Find A Place Booking — Transactional Email Pass

Apply this ZIP over the repository root after the live-safety/contrast overlays.

What this adds
- Host payment confirmation email with the canonical financial breakdown and payout eligibility.
- Guest + host refund/cancellation emails for PENDING, SUCCEEDED, FAILED and CANCELLED refund states.
- Host payout sent, paid and failed emails.
- Internal payout-failure alerts to EMAIL_INTERNAL_ALERT_TO.
- Host + internal Stripe dispute opened/closed alerts.
- Persisted email subject/body in notification_deliveries so cron retries replay the exact failed email.
- Existing booking confirmation emails now use the same outbox/retry helper.
- Notification failures remain non-money-critical: Stripe webhooks still acknowledge a successfully committed payment/refund/payout state even if Resend is temporarily down.

Database
One new migration only:
  20260919004700_transactional_email_outbox.sql

This migration does NOT change booking/payment math, commission, taxes, destination charges, processor-fee recovery, cancellation cutoffs or payout timing.

Suggested verification
  npx supabase db push --dry-run
  npx supabase db push
  npm run typecheck
  npm run build

Expected pending migration:
  20260919004700_transactional_email_outbox.sql

Email routing
- Property notification_email first
- then property operations_email
- then organization contact_email
- internal alerts use EMAIL_INTERNAL_ALERT_TO; comma/semicolon separated addresses are supported

Useful test sequence
1. Complete a TEST booking with the local Stripe webhook listener running.
   Host should receive existing New booking plus Payment confirmed.
2. Cancel before the cutoff.
   Guest + host should receive refund status email.
3. For payout tests, use Stripe TEST payout events / existing payout scheduler.
   Host receives sent/paid/failed; failed also alerts internal operations.
4. A Stripe dispute event sends host + internal alert once per opened/closed phase.

No pet-fee or calendar changes are included in this pass.
