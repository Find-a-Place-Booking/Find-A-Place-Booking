# Find A Place Booking — Production Error Hardening V2 FINAL

Use this package instead of the earlier hardening ZIP.

I re-audited the first patch against the current production database, booking
hold path, host onboarding, Stripe routing, tax engine and public listing path.
The second pass found upstream/downstream gaps, so this V2 closes them.

## Fixed by this package

- PostgreSQL `42702` ambiguous `slug` property-save failure.
- Historical state values such as `ARKANSAS` are normalized to `AR`.
- Future state writes are normalized at the database boundary.
- Publication readiness now matches actual LIVE booking requirements:
  - live checkout gate enabled
  - complete tax address
  - supported statewide tax rules present
  - property tax setup certified
  - actual routable LIVE Stripe account
- If Stripe, tax certification, payment routing, or the live-checkout gate later
  becomes invalid, the affected public listing is automatically changed to
  `PAUSED`.
- Accepted tax setup from host onboarding is now persisted into the actual
  property tax tables once onboarding is ready and the property exists.
- Existing published listings that cannot pass LIVE checkout are paused instead
  of remaining publicly bookable and failing at hold creation.
- PostgREST schema cache is reloaded.

Existing reservations are not changed.

## Current production state observed during the audit

Before applying this package:
- 21 primary listings were `PUBLISHED`.
- All 21 had the live-checkout gate enabled.
- All 21 had a routable LIVE default Stripe account.
- Only 4 were tax-checkout ready.
- Several properties used `ARKANSAS` rather than `AR`.
- The current AR/MO/TX/TN automatic statewide rules exist and are active.
- The historical calendar `JWT issued at future` error recovered; later syncs
  continued successfully.

## Important manual tax-data review

The migration does not auto-edit host-entered tax rates.

Two current Mammoth Spring / Fulton County properties have a host-certified
custom `City + county sales tax` line at 11.50%, while the engine separately
adds Arkansas state sales tax (6.50%) and Arkansas tourism tax (2.00%).

That configuration deserves manual review before relying on those listings for
live bookings. See:

`docs/MANUAL_TAX_DATA_REVIEW.md`

## Files

- `supabase/migrations/20260930230000_production_error_hardening_v2.sql`
- `scripts/VERIFY_PRODUCTION_ERROR_HARDENING_V2.sql`
- `docs/SUPABASE_MIGRATION_HISTORY_NOTE.md`
- `docs/MANUAL_TAX_DATA_REVIEW.md`

## Apply

Overlay at repository root and run your normal Supabase migration process.

This ZIP does **not** push to GitHub, Supabase or Vercel by itself.

After applying, run the verification SQL. Verification query #3 should return
zero rows.
