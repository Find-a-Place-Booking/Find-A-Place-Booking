Find A Place Booking — Recent Validity Fixes

LIVE DATABASE STATUS
- The no-host-tax-config checkout bug is already fixed in production Supabase.
- Lone Cedar LIVE hold was verified inside a rollback: state sales + tourism tax calculated and payment_ready=true.
- A configured-tax property was also verified inside a rollback after the fix.
- The refund enum reconciliation fix is already live.
- The previously stuck cancellation request was reconciled to COMPLETED.
- Production migration history now includes:
  20261005200754_fix_checkout_tax_record_and_refund_enum_reconciliation

SOURCE FILES IN THIS OVERLAY
1. app/api/booking/track/route.ts
   - Restores milestone tracking for current CTA copy:
     Reserve these dates -> checkout_clicked / hold_submit_clicked
     Pay $X & confirm stay -> payment_submit_clicked
   - Corrects Turnstile security telemetry from HOLD to CHECKOUT_DETAILS.
   - Does this server-side so older cached clients cannot keep corrupting funnel stage data.

2. lib/bookings/booking-tracking.ts
   - Replaces the first-attempt plain INSERT with conflict-safe UPSERT/DO NOTHING behavior.
   - Stops concurrent first events from throwing booking_attempts_pkey duplicate-key errors.
   - Existing fail-open behavior remains.

3. supabase/migrations/20261005041805_normalize_host_state_tax_categories.sql
   - Mirrors the production migration that expanded supported host tax categories.

4. supabase/migrations/20261005042006_checkout_payment_hold_grace_and_recovery_timing.sql
   - Mirrors the production Stripe/3DS payment-hold grace and recovery timing migration.

5. supabase/migrations/20261005200754_fix_checkout_tax_record_and_refund_enum_reconciliation.sql
   - Source-side mirror of today's production tax/refund reconciliation fixes.

IMPORTANT
- Arkansas automatic statewide tax behavior remains intentionally STATE_SALES + STATE_TOURISM.
- No booking route, Stripe charge model, commission percentage, calendar sync, or policy acceptance logic is changed by the TypeScript files.
- The database migration files are included to reduce production/Git drift. The 20261005200754 migration is already applied in production; do not manually run it again against production just because it is added to the repo.
