import http from "node:http";
import os from "node:os";

import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

import {
  decryptCredential,
  encryptCredential,
} from "./crypto.mjs";
import {
  ensureResNexusSession,
  NeedsAttentionError,
  readResNexusAccountAvailability,
  UnsafeExtractionError,
} from "./resnexus.mjs";
import {
  SnapshotVerificationError,
  verifyResNexusSnapshot,
} from "./snapshot-verifier.mjs";
import {
  recoverResNexusSnapshotAfterVerificationError,
} from "./snapshot-recovery.mjs";

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const workerId =
  process.env.RESNEXUS_WORKER_ID?.trim() ||
  `${os.hostname()}-${process.pid}`;

const pollSeconds = Math.max(
  5,
  Number(process.env.RESNEXUS_POLL_SECONDS || 20),
);
const leaseSeconds = Math.max(
  60,
  Math.min(1800, Number(process.env.RESNEXUS_LEASE_SECONDS || 600)),
);
const lookaheadDays = Math.max(
  30,
  Number(process.env.RESNEXUS_SYNC_LOOKAHEAD_DAYS || 730),
);
const lookbackDays = Math.max(
  0,
  Number(process.env.RESNEXUS_SYNC_LOOKBACK_DAYS || 7),
);
const maxCalendarPages = Math.max(
  1,
  Math.min(24, Number(process.env.RESNEXUS_MAX_CALENDAR_PAGES || 24)),
);
const headless =
  String(process.env.RESNEXUS_HEADLESS || "true").toLowerCase() !== "false";

let browser = null;
let lastLoopAt = null;
let lastSuccessAt = null;
let lastError = null;
let stopping = false;

function safeMessage(error) {
  return (
    (error instanceof Error
      ? error.message
      : String(error || "Unknown error"))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000)
  );
}

function validTimeZone(value) {
  const candidate = String(value || "").trim() || "America/Chicago";

  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: candidate,
    }).format();
    return candidate;
  } catch {
    return "America/Chicago";
  }
}

async function getBrowser() {
  if (browser?.isConnected()) return browser;

  browser = await chromium.launch({
    headless,
    args: [
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  browser.on("disconnected", () => {
    browser = null;
  });

  return browser;
}

function parseStorageState(ciphertext) {
  if (!ciphertext) return undefined;

  try {
    const parsed = JSON.parse(decryptCredential(ciphertext));

    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.cookies) &&
      Array.isArray(parsed.origins)
    ) {
      return parsed;
    }
  } catch {
    // A stale/bad browser session is disposable. Saved credentials can log in
    // again and replace it.
  }

  return undefined;
}

function activeChallenge(account) {
  if (
    !account.challenge_ciphertext ||
    !account.challenge_expires_at
  ) {
    return null;
  }

  const expires = new Date(account.challenge_expires_at).getTime();
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    return null;
  }

  try {
    return decryptCredential(account.challenge_ciphertext);
  } catch {
    return null;
  }
}

function resourceCatalogFromDiagnostic(diagnostic) {
  if (!diagnostic || !Array.isArray(diagnostic.resourceCatalog)) {
    return [];
  }

  return diagnostic.resourceCatalog.filter(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof item.key === "string" &&
      typeof item.label === "string",
  );
}

async function markFailure(
  account,
  error,
  sessionCiphertext = null,
) {
  const needsAttention = error instanceof NeedsAttentionError;
  const diagnostic =
    error instanceof NeedsAttentionError ||
    error instanceof UnsafeExtractionError ||
    error instanceof SnapshotVerificationError
      ? error.diagnostic || {}
      : {};

  const { error: rpcError } = await supabase.rpc(
    "service_finish_resnexus_browser_account_attempt",
    {
      target_account_id: account.browser_account_id,
      worker_id: workerId,
      result_status: needsAttention ? "NEEDS_ATTENTION" : "ERROR",
      error_message: safeMessage(error),
      attention_reason_code: needsAttention ? error.code : null,
      attention_reason_message: needsAttention
        ? safeMessage(error)
        : null,
      encrypted_session: sessionCiphertext,
      resource_catalog: resourceCatalogFromDiagnostic(diagnostic),
      run_diagnostic: diagnostic,
    },
  );

  if (rpcError) {
    console.error(
      "[resnexus worker] unable to record failed account attempt",
      rpcError.message,
    );
  }
}

async function processAccount(account) {
  const login = decryptCredential(account.login_ciphertext);
  const password = decryptCredential(account.password_ciphertext);
  const challengeCode = activeChallenge(account);
  const storageState = parseStorageState(account.session_ciphertext);

  const currentBrowser = await getBrowser();
  const context = await currentBrowser.newContext({
    storageState,
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    timezoneId: validTimeZone(account.browser_time_zone),
  });

  let page = null;
  let sessionCiphertext = null;

  try {
    page = await ensureResNexusSession({
      context,
      login,
      password,
      challengeCode,
    });

    sessionCiphertext = encryptCredential(
      JSON.stringify(await context.storageState()),
    );

    const rawSnapshot = await readResNexusAccountAvailability({
      context,
      page,
      lookbackDays,
      lookaheadDays,
      maxCalendarPages,
    });

    let snapshot;

    try {
      snapshot = await verifyResNexusSnapshot({
        context,
        snapshot: rawSnapshot,
      });
    } catch (error) {
      if (!(error instanceof SnapshotVerificationError)) throw error;

      const recovered = recoverResNexusSnapshotAfterVerificationError({
        snapshot: rawSnapshot,
        error,
      });

      if (!recovered) throw error;

      snapshot = recovered;

      console.warn(
        "[resnexus worker] detail proof incomplete; using date-window quarantine recovery",
        {
          browserAccountId: account.browser_account_id,
          failures:
            recovered.diagnostic?.verifier?.failures?.length || 0,
          quarantined:
            recovered.diagnostic?.verifier?.quarantinedFailures?.length || 0,
          rejectedImplausible:
            recovered.diagnostic?.verifier?.rejectedImplausibleFailures?.length || 0,
        },
      );
    }

    const { data, error } = await supabase.rpc(
      "service_apply_resnexus_browser_account_sync",
      {
        target_account_id: account.browser_account_id,
        source_blocks: snapshot.blocks,
        resource_catalog: snapshot.resources,
        sync_window_start: snapshot.windowStart,
        sync_window_end: snapshot.windowEnd,
        encrypted_session: sessionCiphertext,
        worker_id: workerId,
        run_diagnostic: snapshot.diagnostic,
      },
    );

    if (error) throw new Error(error.message);

    lastSuccessAt = new Date().toISOString();
    lastError = null;

    console.log("[resnexus worker] account sync complete", {
      browserAccountId: account.browser_account_id,
      organizationId: account.organization_id,
      resources: snapshot.resources.length,
      blocks: snapshot.blocks.length,
      result: data,
    });
  } catch (error) {
    lastError = safeMessage(error);

    // Verification challenges can depend on cookies created during the failed
    // sign-in attempt. Preserve that session so a host-entered code can resume
    // the same challenge instead of restarting login from scratch.
    if (!sessionCiphertext) {
      try {
        sessionCiphertext = encryptCredential(
          JSON.stringify(await context.storageState()),
        );
      } catch {
        sessionCiphertext = null;
      }
    }

    console.error("[resnexus worker] account sync failed", {
      browserAccountId: account.browser_account_id,
      organizationId: account.organization_id,
      error: lastError,
      attention:
        error instanceof NeedsAttentionError ? error.code : null,
    });

    await markFailure(account, error, sessionCiphertext);
  } finally {
    await page?.close().catch(() => null);
    await context.close().catch(() => null);
  }
}

async function claimOne() {
  const { data, error } = await supabase.rpc(
    "service_claim_resnexus_browser_account",
    {
      worker_id: workerId,
      lease_seconds: leaseSeconds,
    },
  );

  if (error) throw new Error(error.message);

  return Array.isArray(data) && data.length ? data[0] : null;
}

async function loop() {
  while (!stopping) {
    lastLoopAt = new Date().toISOString();

    try {
      let claimed = 0;

      // One browser process, separate browser context/session per ResNexus
      // account. Each account scan covers every mapped room/cabin.
      while (!stopping && claimed < 20) {
        const account = await claimOne();
        if (!account) break;

        claimed += 1;
        await processAccount(account);
      }
    } catch (error) {
      lastError = safeMessage(error);
      console.error("[resnexus worker] loop error", lastError);
    }

    await new Promise((resolve) =>
      setTimeout(resolve, pollSeconds * 1000),
    );
  }
}

const port = Number(process.env.PORT || 8080);

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, {
      "Content-Type": "application/json",
    });
    response.end(
      JSON.stringify({
        ok: true,
        mode: "resnexus-account-mapping-v4-quarantine-recovery",
        workerId,
        lastLoopAt,
        lastSuccessAt,
        lastError,
        browserConnected: Boolean(browser?.isConnected()),
      }),
    );
    return;
  }

  response.writeHead(404, {
    "Content-Type": "text/plain",
  });
  response.end("Not found");
});

server.listen(port, "0.0.0.0", () => {
  console.log(
    `[resnexus worker] health server listening on ${port}`,
  );
});

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;

  console.log(`[resnexus worker] ${signal} received`);
  server.close();
  await browser?.close().catch(() => null);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

console.log("[resnexus worker] starting account-mapping v4 quarantine recovery", {
  workerId,
  pollSeconds,
  leaseSeconds,
  lookaheadDays,
  lookbackDays,
  maxCalendarPages,
  headless,
});

await loop();
