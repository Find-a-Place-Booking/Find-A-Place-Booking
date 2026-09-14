Find A Place Booking — Milestone 10A reservation/payment foundation overlay
Baseline: e710828 — accepted 9B.1 calendar-hardening checkpoint

1. Extract this ZIP into the existing repository root and merge folders/files.
2. Apply ONLY:
   supabase/migrations/20260914001600_reservation_payment_foundation.sql
   Database must already be current through migration 015.
3. Run:
   npm run typecheck
   npm run build
   npm run dev
4. Open /api/health/supabase and confirm schema reservation-payment-foundation-v1.
5. In development only, Host -> Reservations exposes a local test-hold form.
6. Follow docs/APPLY_MILESTONE_10A.md before accepting the checkpoint.

No Stripe/Square network call, OAuth flow, webhook listener, tax calculation, payout release, or live-money activation is included.
