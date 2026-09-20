Find A Place Booking — Pilot-readiness cleanup
Base audited: main @ d7d8ddd7c8140a01fb4ee8ea4d7aabe32bd472da

This pass repairs the blank 046 migration in Git, adds a safe 050 repair replay,
restores ResNexus/iCal diagnostics, builds real Host/Admin reports with CSV
exports, exposes admin tax/report navigation, and cleans stale pilot UI wording.

IMPORTANT APPLY ORDER
1. Extract this ZIP into the repository root and overwrite matching files.
2. From the repo root run:

   powershell -ExecutionPolicy Bypass -File .\APPLY_PILOT_READINESS_CLEANUP.ps1
   node .\scripts\check-pilot-readiness.mjs
   npx supabase db push --dry-run

3. If the dry run shows only the migrations you actually have pending, apply:

   npx supabase db push
   npm run typecheck
   npm run build
   npm audit

If 047/048/049 are already applied, 050 should be the only new migration.
The repaired 046 file should NOT replay under its old timestamp; migration 050
is what safely replays that hardening for databases that may have recorded the
blank 046 file.

After the database push, visit:
  http://localhost:3000/api/health/supabase

Expected marker:
  "pilot_readiness_schema": "pilot-readiness-cleanup-050-v1"

Then test:
- /host/reports with the existing TEST booking
- /admin/reports
- /admin/taxes from the admin navigation
- Host > Calendar > ResNexus > Test connection

No changes to:
- Stripe destination-charge architecture
- PaymentIntent amount/application fee calculation
- 5% / 7% commission basis
- lodging-tax rates/math
- processor-fee recovery model
