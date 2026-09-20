Find A Place Booking — live safety fixes
Base reviewed: main @ b8d1c32e9c0c79b87860ce4f50a002b4b2762471 (Latest 9-19-26)

This is a direct repo-root overlay. It does NOT rewrite the proven booking math,
5%/7% commission calculation, tax amounts, destination-charge calculation, or
PaymentIntent flow.

WHAT THIS FIXES
- TEST/LIVE environment separation for reservation payouts.
- Atomic payout claiming with SKIP LOCKED + stable Stripe idempotency recovery.
- Exact cancellation/payout timestamps using the property IANA timezone.
- Payout webhook reconciliation plus hourly polling backup.
- Host payout workspace filters to the active Stripe environment.
- Removes the embedded Stripe payouts component from host onboarding.
- Booking confirmation no longer becomes a failed Stripe webhook just because
  Resend is temporarily unavailable; failed booking emails retry on cron.
- Tax property verification + local-rule replacement is one DB transaction.
- LIVE Arkansas tax snapshots must include the exact state sales + tourism rules.
- Manual calendar Sync now uses the same safe sync path as background sync.
- Allows camera permission to be requested by Stripe Identity while continuing
  to block microphone/geolocation platform-wide.
- Keeps email OTP out of the email subject/lock-screen preview.
- Cancelled guests keep a secure read-only trip/receipt record.
- Light-surface muted text contrast is strengthened and Next smooth-scroll
  warning is handled.
- Health endpoint now checks the current verification/policy/payout/tax schema.
- Supabase .temp runtime files are ignored going forward.

APPLY
1. Extract this ZIP directly into the repository root and allow replacement of
   matching files.
2. From the repo root run:

   supabase db push
   npm run typecheck
   npm run build
   npm audit

Do NOT run npm audit fix --force blindly. Inspect the audit result first.

NEW MIGRATION
Only one new migration is included:
  supabase/migrations/20260919004600_live_safety_hardening.sql

With the repaired migration history, supabase db push should apply only the new
pending migration(s), not replay the older schema.

NEW / UPDATED ENVIRONMENT SETTINGS
- STRIPE_CONNECT_WEBHOOK_SECRET
  For LIVE checkout this is now required. Create a Stripe webhook endpoint for
  events on connected accounts pointing to:
      https://YOUR_DOMAIN/api/stripe/webhook
  Include payout.created, payout.updated, payout.paid and payout.failed.
  Put that endpoint's signing secret in STRIPE_CONNECT_WEBHOOK_SECRET.

- STRIPE_IDENTITY_COST_CENTS=150
  Internal accounting estimate only. TEST remains $0. Change the value later if
  Stripe pricing changes; it does not change the guest total or host payout.

STRIPE PAYOUT CONTROL
The host embedded Account Session no longer enables Stripe's payouts component.
The app continuously enforces a manual payout schedule before payouts are
processed. In Stripe Connect settings, also keep any connected-account control
that would let hosts change payout timing/manual payout behavior disabled if
that option is exposed for the Express configuration.

PROPERTY TIMEZONE
Existing properties default to America/Chicago, which is correct for the
current Arkansas rollout. Before publishing a property outside that timezone,
set properties.time_zone to the correct IANA value (for example America/Denver).
The database rejects invalid timezone names.

TRACKED SUPABASE TEMP FILES
.gitignore now blocks /supabase/.temp/ going forward. Existing tracked temp
files are still in Git until removed once with:

   git rm -r --cached supabase/.temp

Then commit the deletion normally. This does not delete your local Supabase
runtime files from disk.

OLD PATCH HELPERS
These root files are no longer required by the running application and can be
removed in a normal cleanup commit after this pass is verified:
  apply-tax-marketplace.ps1
  finish-tax-patch.ps1

TEST ORDER AFTER APPLYING
1. npm run typecheck
2. npm run build
3. Start app + Stripe local webhook listener.
4. Make one TEST booking through hold -> email -> Identity -> policies -> pay.
5. Verify Stripe webhook confirms the reservation even if email delivery is
   temporarily disabled/failing.
6. Confirm /host/payouts shows only TEST rows while using test keys.
7. Confirm guest cancellation works before the cutoff and fails closed at/after
   the snapshotted cutoff.
8. Manually sync an iCal feed and verify an unexpected empty result preserves
   existing imported blocks on the first empty response.
9. Visit /api/health/supabase and confirm live_safety_schema is
   live-safety-hardening-046-v1.

NOT CHANGED ON PURPOSE
- Booking hold/payment amount math.
- 5%/7% commission basis.
- Tax rates or tax base policy.
- Stripe destination-charge/application-fee calculation.
- ResNexus RRULE parsing: that needs the actual failing ResNexus feed/error so
  we can add correct provider handling without weakening calendar safety.
- Add-on taxability rules: do not guess these until each add-on tax category is
  deliberately defined.
