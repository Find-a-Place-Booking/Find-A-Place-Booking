/**
 * ResNexus worker liveness watchdog.
 *
 * Runs in the SAME Node process as the worker via `node --import`, so a
 * non-progressing polling loop can exit non-zero and let the existing Railway
 * ON_FAILURE restart policy bring up a fresh process.
 *
 * Only reads the loop's local /health endpoint. It never writes calendar data,
 * changes leases, clears blocks, or retries rejected account credentials.
 */

const startedAt = Date.now();

function positiveNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

const pollMs = positiveNumber(
  process.env.RESNEXUS_WATCHDOG_POLL_SECONDS,
  60,
  15,
  300,
) * 1000;
const maxLoopIdleMs = positiveNumber(
  process.env.RESNEXUS_WATCHDOG_MAX_IDLE_MINUTES,
  90,
  30,
  720,
) * 60_000;
const startupGraceMs = positiveNumber(
  process.env.RESNEXUS_WATCHDOG_STARTUP_GRACE_MINUTES,
  15,
  5,
  60,
) * 60_000;
const port = positiveNumber(process.env.PORT, 8080, 1, 65535);
const endpoint = `http://127.0.0.1:${port}/health`;

let checking = false;
let unreachableSince = null;

function terminateStalledWorker(reason) {
  // The process manager (Railway) already restarts non-zero exits; leave
  // cancellation/availability handling to the existing server-side logic.
  console.error("[resnexus watchdog] restarting non-responsive worker", {
    reason,
    maxLoopIdleMinutes: maxLoopIdleMs / 60_000,
  });
  process.exit(1);
}

async function checkHealth() {
  if (checking) return;
  checking = true;
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Local health endpoint returned ${response.status}`);
    }

    const health = await response.json();
    if (!health || typeof health !== "object" || health.ok !== true) {
      throw new Error("Invalid local worker health response");
    }

    const loopAt = Date.parse(String(health.lastLoopAt || ""));
    if (!Number.isFinite(loopAt)) {
      if (Date.now() - startedAt > startupGraceMs) {
        terminateStalledWorker("polling loop did not start");
      }
      return;
    }

    unreachableSince = null;
    const idleMs = Date.now() - loopAt;
    if (idleMs > maxLoopIdleMs) {
      terminateStalledWorker(
        `no polling loop progress for ${Math.round(idleMs / 60_000)} minutes`,
      );
    }
  } catch (error) {
    const now = Date.now();
    unreachableSince ??= now;
    // Do not crash on a short startup delay, momentary local HTTP error, or
    // an overloaded Playwright scan. Restart only after prolonged failure.
    if (
      now - startedAt > startupGraceMs &&
      now - unreachableSince > startupGraceMs
    ) {
      terminateStalledWorker(
        `local health endpoint unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } finally {
    checking = false;
  }
}

// Unref keeps the watchdog from accidentally keeping a failed worker alive.
const interval = setInterval(() => void checkHealth(), pollMs);
interval.unref();
