FIND A PLACE BOOKING - ROUND 5 - RESNEXUS WORKER WATCHDOG
========================================================

DIRECT OVERLAY. No BAT, CMD, PowerShell, Python patch, or install scripts.

Extract this ZIP into the ROOT of the Find-A-Place-Booking repository.
Approve replacement of the two existing files below:
  resnexus-worker/Dockerfile
  resnexus-worker/package.json
And add:
  resnexus-worker/src/watchdog.mjs

Push the changed project files to GitHub as usual. This is a ResNexus
WORKER update, not a Vercel-only website update. The Railway worker needs
to redeploy from that commit for this improvement to take effect.

WHAT CHANGED
- Docker now runs the package's start command, which starts the watchdog
  with the existing worker in the same Node process.
- The watchdog checks only the worker's LOCAL /health endpoint.
- If the worker polling loop gets stuck for over 90 minutes, the process
  exits with an error so Railway's existing ON_FAILURE policy can restart.
- Brief network problems, normal idle periods and short scans do not trigger
  restarts. It does not perform logins or any database writes.
- All existing ResNexus extraction, verifier, quarantine and safety-block
  code stays untouched.

IMPORTANT
This does NOT remotely restart a Railway service that's currently stopped
or fix rejected ResNexus credentials. One account was last confirmed synced
on October 30, 2026; another had CREDENTIALS_REJECTED and requires the host
to update its login. Confirm the Railway service is deployed and online.
Do NOT clear existing blocked nights or disable ResNexus safety protections.

OPTIONAL RAILWAY ENV VARS (defaults work as-is):
  RESNEXUS_WATCHDOG_POLL_SECONDS=60
  RESNEXUS_WATCHDOG_MAX_IDLE_MINUTES=90
  RESNEXUS_WATCHDOG_STARTUP_GRACE_MINUTES=15

SOURCE BASELINE: GitHub main, worker index sha ae880ff0b37c14f88ab1bf65952bcb7e8b465790.
NO schema migrations, Stripe, booking, tax, or Vercel configuration edits.
