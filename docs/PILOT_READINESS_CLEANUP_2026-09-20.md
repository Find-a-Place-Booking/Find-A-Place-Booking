# Find A Place Booking — pilot-readiness cleanup

This pass closes the visible/reporting gaps found in `main` at commit
`d7d8ddd7c8140a01fb4ee8ea4d7aabe32bd472da` without changing the proven
Stripe destination-charge math, 5%/7% lodging commission, marketplace tax math,
or PaymentIntent ownership.

## Included

- Restores the accidentally blank migration 046 file in Git.
- Adds migration 050, which safely replays the idempotent 046 hardening so a
  database that recorded the blank migration is repaired too.
- Restores the ResNexus/iCal read-only connection diagnostics and preflight test.
- Replaces the placeholder Host Reports page with real reservation/payment/
  refund/payout reporting and CSV export.
- Adds Admin Reports with host/property breakdowns and CSV export.
- Adds Reports to admin navigation and exposes Taxes & remittance to finance/
  super-admin users.
- Converts the host topbar notification dot to the real reservation-messages
  workspace and removes the dead sidebar support button.
- Includes a fail-loud copy cleanup script for stale pre-launch wording and the
  dead Property Editor calendar button.
- Extends `/api/health/supabase` through migration 050.

## Deliberate pilot deferrals

These are not treated as broken placeholders in this pass:

- Square payments: explicitly labeled as unavailable during the Stripe-first pilot.
- Partner directory auto-matching: partner verification remains a manual admin decision.
- Additional host team-member management: outside the current pilot.
- Published-listing revision workflow: approved public listing details remain locked;
  rates, calendars, payouts and reports continue in their dedicated workspaces.
- Search impression/property-view analytics: no fake numbers are shown. Add event
  instrumentation later before exposing discovery metrics.

## Apply

1. Extract this overlay into the repository root and allow replacement.
2. Run `powershell -ExecutionPolicy Bypass -File .\APPLY_PILOT_READINESS_CLEANUP.ps1`.
3. Run `node .\scripts\check-pilot-readiness.mjs`.
4. Run `npx supabase db push --dry-run`.
5. If the expected pending chain is correct, run `npx supabase db push`.
6. Run `npm run typecheck`, `npm run build`, and `npm audit`.
7. Start the app and verify `/api/health/supabase` returns
   `pilot_readiness_schema: pilot-readiness-cleanup-050-v1`.
8. Test Host Reports, Admin Reports, and Renea's ResNexus feed with **Test connection**.

## Git hygiene after runtime verification

The repo still contains historical overlay README/patch-helper files and tracked
`supabase/.temp` state. Clean those in a separate commit after this runtime pass
is green so functional and housekeeping changes stay easy to review.
