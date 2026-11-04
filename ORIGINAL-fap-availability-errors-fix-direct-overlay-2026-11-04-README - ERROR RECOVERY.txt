FIND A PLACE BOOKING - AVAILABILITY ERROR TRACKING FIX
November 4, 2026

Direct replacement-file overlay. No scripts, commands, migrations or database writes.

REPLACEMENT FILE
  app/api/booking/track/route.ts

EXTRACT over the ROOT folder of the Find-A-Place-Booking repository (the folder containing package.json).
Allow the matching route.ts to be replaced, then commit/push as usual.

FIX
Browser-initiated availability checks are intentionally canceled when visitors
change selected dates, re-focus the page or navigate away. The previous server
logged every such abort as availability_failed/network_error, hiding actual
availability problems in the booking funnel.

The replacement route classifies ONLY explicitly canceled, quick (< 3 seconds)
availability requests as "availability_cancelled" with success=null. It keeps
true failures, including the ResNexus HTTP 503 failures, generic network errors,
and the client 10-second timeout as failure events. Works for previously cached
browser clients because classification happens on the server.

NOT CHANGED
  Booking holds, connected calendars, Stripe, fees, reservations, guest checkout,
  the availability fail-closed check, account credentials and Supabase schema.

IMPORTANT: SEPARATE RESNEXUS WORKER ISSUE
ResNexus last successful scan for one connected account: Oct 30, 2026.
Next scheduled scan is overdue, and no lease is held. Another account has
CREDENTIALS_REJECTED (18 failed attempts). The app correctly refuses to
confirm availability against unverified calendars.

This route patch does not restart a stopped Railway process, repair login
credentials or turn the 503 failures into successful availability checks.
Review the Railway service's latest deployment and logs. Verify the service
Root Directory is /resnexus-worker, the Config File path is
/resnexus-worker/railway.toml (when used), the Playwright Dockerfile is
selected, and the service is RUNNING. Restart/redeploy it in Railway and verify
new last_attempt_at / last_success_at values. See the separate OPTIONAL
paid-Railway restart overlay if your Railway plan supports restart=Always.

VERIFIED
  Original GitHub file: app/api/booking/track/route.ts
  Original blob: 75bd5a7eb0416bc812e7e666b56df7de5bfe44ae
  Target main (before patch): fb059ab3d05e5a63f4dd82737e6c1896b45f009d
  TypeScript syntax transpile: passed
  8 classification unit cases: passed
  A full Next.js build and production smoke test are NOT yet verified.
