Find A Place Booking — final regression fixes
2026-09-20

Overlay these files onto the current repository root.

Migration:
  supabase/migrations/20260920004900_final_regression_guards.sql

This pass fixes:
- partial-refund payouts stuck in RETRY
- transient payout-schedule checks downgrading account readiness
- server-side pet policy / max-pet enforcement
- guest add-on ownership/visibility validation
- internal notification links to admin reservation pages
- health check coverage through migration 049

It does NOT change:
- 5% / 7% commission math
- Stripe destination-charge architecture
- PaymentIntent amount/application-fee calculation
- tax calculation/remittance architecture
- processor fee recovery
- webhook ownership of payment confirmation

Apply:
  npx supabase db push --dry-run

Expected pending migrations depend on what you already applied. 047, 048, 049
in order is valid. If 047/048 are already applied, only 049 should appear.
Stop if an unexpected older migration appears.

Then:
  npx supabase db push
  npm run typecheck
  npm run build
  npm audit

After that, run the runtime regression matrix in docs/FINAL_REGRESSION_2026-09-20.md.
