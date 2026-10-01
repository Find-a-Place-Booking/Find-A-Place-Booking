# Find A Place Booking — Optional Tax Fix

This package removes the accidental tax hard-gate added by the production
hardening pass.

## Intended behavior

- Hosts are still shown the tax setup and encouraged to complete it.
- Tax setup does **not** block onboarding, publishing, or guest bookings.
- If a host opts into tax setup and certifies it, Find A Place adds the
  configured taxes to guest checkout.
- If a host leaves tax setup unconfigured, Find A Place adds **$0 tax** and the
  host handles any applicable tax obligations separately.
- Tax funds are never retained by Find A Place; configured guest tax remains in
  the host's connected Stripe charge.
- Stripe readiness, complete property address, and the normal live checkout
  gate remain required.

## What the migration repairs

The Sep 30 hardening pass auto-paused several otherwise-ready listings only
because their tax setup was not certified. The new migration restores only
listings that can be proven to have been auto-paused for that exact tax-only
reason and that have not been manually changed since.

It does NOT restore listings that were manually disabled/paused.

## Apply

1. Extract this ZIP over the repository root.
2. Run `APPLY_OPTIONAL_TAX_FIX.cmd` on Windows, or:
   `node scripts/apply-optional-tax-fix.mjs`
3. Apply:
   `supabase/migrations/20261001150000_optional_host_tax_checkout.sql`
   to the Find A Place Supabase project.
4. Run:
   `npm run typecheck`
   `npm run build`
5. Optional: run `scripts/VERIFY_OPTIONAL_TAX_FIX.sql` as a read-only check.

Because the production database has known migration-history drift, do not blindly
replay older migrations just to reconcile history. Apply the new migration only,
or reconcile migration history first if using `supabase db push`.
