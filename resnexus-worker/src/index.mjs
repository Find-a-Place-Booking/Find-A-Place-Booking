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
  readResNexusAvailability,
  UnsafeExtractionError,
} from "./resnexus.mjs";

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
  Math.min(900, Number(process.env.RESNEXUS_LEASE_SECONDS || 600)),
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
    const raw = decryptCredential(ciphertext);
    const parsed = JSON.parse(raw);

    if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray(parsed.cookies) &&
      Array.isArray(parsed.origins)
    ) {
      return parsed;
    }
  } catch {
    // A bad/expired browser session is disposable. The stored login can
    // reauthenticate and produce a fresh session.
  }

  return undefined;
}

function activeChallenge(connection) {
  if (
    !connection.challenge_ciphertext ||
    !connection.challenge_expires_at
  ) {
    return null;
  }

  const expires = new Date(connection.challenge_expires_at).getTime();
  if (!Number.isFinite(expires) || expires <= Date.now()) {
    return null;
  }

  try {
    return decryptCredential(connection.challenge_ciphertext);
  } catch {
    return null;
  }
}

async function markFailure(
  connection,
  error,
  sessionCiphertext = null,
) {
  const needsAttention = error instanceof NeedsAttentionError;
  const diagnostic =
    error instanceof NeedsAttentionError ||
    error instanceof UnsafeExtractionError
      ? error.diagnostic || {}
      : {};

  const resources = Array.isArray(diagnostic.discoveredResources)
    ? diagnostic.discoveredResources.filter(
        (value) => typeof value === "string",
      )
    : [];

  const { error: rpcError } = await supabase.rpc(
    "service_finish_resnexus_browser_attempt",
    {
      target_browser_connection_id:
        connection.browser_connection_id,
      worker_id: workerId,
      result_status: needsAttention ? "NEEDS_ATTENTION" : "ERROR",
      error_message: safeMessage(error),
      attention_reason_code: needsAttention ? error.code : null,
      attention_reason_message: needsAttention
        ? safeMessage(error)
        : null,
      encrypted_session: sessionCiphertext,
      resource_names: resources,
      run_diagnostic: diagnostic,
    },
  );

  if (rpcError) {
    console.error(
      "[resnexus worker] unable to record failed attempt",
      rpcError.message,
    );
  }
}

async function processConnection(connection) {
  const login = decryptCredential(connection.login_ciphertext);
  const password = decryptCredential(connection.password_ciphertext);
  const challengeCode = activeChallenge(connection);
  const storageState = parseStorageState(
    connection.session_ciphertext,
  );

  const currentBrowser = await getBrowser();
  const context = await currentBrowser.newContext({
    storageState,
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    timezoneId: validTimeZone(connection.property_time_zone),
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

    const storageAfterLogin = await context.storageState();
    sessionCiphertext = encryptCredential(
      JSON.stringify(storageAfterLogin),
    );

    const snapshot = await readResNexusAvailability({
      context,
      page,
      resourceMatch: connection.resource_match,
      lookbackDays,
      lookaheadDays,
      maxCalendarPages,
    });

    const { data, error } = await supabase.rpc(
      "service_apply_resnexus_browser_sync",
      {
        target_browser_connection_id:
          connection.browser_connection_id,
        source_blocks: snapshot.blocks,
        sync_window_start: snapshot.windowStart,
        sync_window_end: snapshot.windowEnd,
        encrypted_session: sessionCiphertext,
        resource_names: snapshot.resources,
        worker_id: workerId,
        run_diagnostic: snapshot.diagnostic,
      },
    );

    if (error) throw new Error(error.message);

    lastSuccessAt = new Date().toISOString();
    lastError = null;

    console.log("[resnexus worker] availability sync complete", {
      browserConnectionId: connection.browser_connection_id,
      unitId: connection.unit_id,
      blocks: snapshot.blocks.length,
      result: data,
    });
  } catch (error) {
    lastError = safeMessage(error);

    // Login verification challenges are often tied to cookies/session state
    // created immediately before the challenge page. Preserve that state even
    // though the availability read did not succeed, so a host-entered one-time
    // code can continue the same ResNexus login challenge on the next attempt.
    if (!sessionCiphertext) {
      try {
        const storageOnFailure = await context.storageState();
        sessionCiphertext = encryptCredential(
          JSON.stringify(storageOnFailure),
        );
      } catch {
        sessionCiphertext = null;
      }
    }

    console.error("[resnexus worker] availability sync failed", {
      browserConnectionId: connection.browser_connection_id,
      unitId: connection.unit_id,
      error: lastError,
      attention:
        error instanceof NeedsAttentionError ? error.code : null,
    });

    await markFailure(connection, error, sessionCiphertext);
  } finally {
    await page?.close().catch(() => null);
    await context.close().catch(() => null);
  }
}

async function claimOne() {
  const { data, error } = await supabase.rpc(
    "service_claim_resnexus_browser_connection",
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

      // One Chromium process is shared, but every host gets a separate
      // BrowserContext/storage state. Processing sequentially keeps memory use
      // predictable on a small Railway worker.
      while (!stopping && claimed < 20) {
        const connection = await claimOne();
        if (!connection) break;

        claimed += 1;
        await processConnection(connection);
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

console.log("[resnexus worker] starting", {
  workerId,
  pollSeconds,
  leaseSeconds,
  lookaheadDays,
  lookbackDays,
  maxCalendarPages,
  headless,
});

await loop();
