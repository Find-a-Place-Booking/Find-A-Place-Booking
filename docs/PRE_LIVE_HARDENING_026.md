# Pre-live hardening 026 release checklist

Use this checklist for the first controlled property pilot. A successful build is necessary, but it is not authorization to process live money.

## 1. Database

- Take a Supabase backup.
- Apply migrations in timestamp order through `20260918002600_pre_live_hardening.sql`.
- If migration 026 reports multiple settled Stripe payments for one reservation/environment, stop and reconcile those records before retrying.
- Call `/api/health/supabase` and verify `pre_live_schema` is `pre-live-hardening-026-v1`.
- Confirm every existing payment account, reservation, payment, refund, and processor event was backfilled as `TEST`.

## 2. TEST rehearsal

- Configure matching Stripe TEST keys and the TEST webhook secret.
- Configure Turnstile, Resend, the cron secret, site URL, email domain, processing-fee inputs, and a 32+ character guest-token secret.
- Add the production `/auth/confirm` URL to Supabase Auth's redirect allowlist and test host/admin password recovery.
- Connect the pilot host through embedded Stripe onboarding and confirm the TEST account reaches READY with payouts enabled.
- Connect each external iCal feed. Verify the scheduled sync and the pre-hold refresh both succeed.
- Complete a booking with Stripe test card `4242 4242 4242 4242`.
- Verify exactly one reservation, payment, active reservation block, guest email, and host email are produced.
- Retry the payment-intent request and the Stripe webhook; verify no duplicate charge or email is produced.
- Run a partial refund and verify guest refund, host-funded transfer reversal, retained platform commission, and `PARTIALLY_REFUNDED` state.
- On a separate booking, run a full refund and verify 100% guest refund, host transfer reversal, application-fee reversal, cancelled reservation, and released dates.
- Simulate payment failure, a cancelled PaymentIntent, webhook retries, and a dispute event.
- Temporarily break an iCal feed and verify new holds fail closed while existing imported blocks remain.

## 3. Tax gate — required before LIVE

- Confirm the business has the required Arkansas and local lodging-tax registrations.
- Validate the correct Stripe Tax product treatment for each charge component; do not infer or guess a tax code.
- Implement and verify a real Stripe Tax calculation before PaymentIntent creation.
- Snapshot the provider calculation ID, full tax breakdown, total, and jurisdiction evidence on the reservation.
- Create the corresponding tax transaction only after successful payment.
- Test full and partial refund tax reversals and accounting exports.

Until this section is complete, live payment is intentionally rejected because reservations remain `NOT_CALCULATED`.

## 4. Controlled LIVE pilot

- Use a separate production deployment with matching Stripe LIVE keys and LIVE webhook secret.
- Reconnect the host in LIVE mode; never reuse the TEST database payment-account row.
- Leave all properties' `live_checkout_enabled` value false.
- Verify the production email sending domain and Turnstile hostname.
- Confirm Vercel invokes `/api/cron/calendar-sync` every 15 minutes with `CRON_SECRET`.
- Run a low-risk internal live transaction only after the tax gate passes.
- Enable live checkout for the single approved pilot property from the admin property page.
- Monitor Stripe events, Supabase processor events, notification deliveries, calendar sync failures, refunds, and disputes during the pilot.
- Disable the property gate immediately if payout readiness, tax calculation, webhook processing, or calendar verification degrades.

## 5. Rollback controls

- Fast stop: set `BOOKING_CHECKOUT_ENABLED=false`.
- Property stop: disable `live_checkout_enabled` for the affected property.
- Do not roll back migration 026 after it has recorded payments or refunds. Deploy the prior application only with checkout disabled, then use a forward migration for database corrections.
