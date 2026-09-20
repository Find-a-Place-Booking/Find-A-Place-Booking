Find A Place Booking — Cancellation + Host Payout Timing Pass 1
===============================================================

Purpose
-------
Implements the agreed platform timing without changing the existing booking,
commission, tax, destination-charge, or processor-fee calculations.

Policy implemented
------------------
- Ordinary guest self-service cancellation is allowed BEFORE the date that is
  14 calendar days prior to check-in.
- Beginning 14 calendar days before check-in, ordinary self-service
  cancellation is closed / non-refundable under the platform policy.
- Host bank payout becomes eligible 13 calendar days before check-in.
- A booking made inside the 13-day window becomes payout-eligible as soon as
  its successful payment is available in the connected Stripe balance.
- Admin exceptional refund/cancellation tools remain separate.

Important Stripe behavior
-------------------------
Destination charges put the host share into the connected Stripe account
balance when the payment succeeds. That is NOT the same thing as paying the
host's bank account.

This pass forces supported Stripe connected accounts to MANUAL bank payouts by
using Stripe Balance Settings, then creates the bank payout at the Find A Place
eligibility date. This keeps the current destination-charge economics intact.

What this overlay adds
----------------------
1. supabase/migrations/20260919004500_cancellation_payout_policy.sql
   - reservation_payouts table
   - cancellation cutoff date
   - payout eligibility date
   - payout lifecycle/status tracking
   - successful-payment trigger to schedule payouts
   - successful-refund reconciliation so unsent payouts are reduced/cancelled
   - RLS for hosts/admins
   - backfill for already-confirmed successful bookings

2. lib/payments/stripe-payouts.ts
   - Stripe Balance Settings -> manual payout schedule
   - connected-account balance lookup
   - standard bank payout creation
   - payout status lookup

3. lib/payments/sync-stripe-account.ts
   - Stripe payout account is READY only when transfers/payouts are active AND
     Find A Place successfully confirms a MANUAL payout schedule.
   - payout schedule errors are kept in payment-account metadata.

4. app/api/cron/payouts/route.ts
   - re-enforces MANUAL payout schedules
   - reconciles pending/in-transit Stripe payouts
   - initiates due payouts
   - waits safely when funds are still pending
   - pauses while a refund is pending

5. app/api/trip/cancellation/route.ts
   - secure guest cancellation status
   - token-protected self-service cancellation
   - full Stripe refund before the 14-day cutoff
   - blocks cancellation if a bank payout has somehow already begun

6. components/GuestTripTools.tsx
   - cancellation-policy panel on the secure trip page
   - full-refund amount shown before cancellation
   - explicit confirmation before submitting cancellation

7. app/booking/cancelled/page.tsx
   - cancellation/refund result page

8. /host/payouts + host navigation
   - hosts can see scheduled, pending/in-transit, paid, failed, and cancelled
     payout records with eligibility dates.

9. vercel.json
   - preserves the existing calendar cron
   - adds the payout scheduler at minute 15 of every hour

Files deliberately NOT changed
------------------------------
- app/api/booking/hold/route.ts
- app/api/booking/payment-intent/route.ts
- app/api/stripe/webhook/route.ts
- lib/payments/stripe-checkout.ts
- tax calculation migrations/functions
- commission calculation
- application_fee_amount calculation
- processor-fee recovery
- guest verification
- policy acceptance
- calendar import logic

Apply
-----
Extract the overlay over the CURRENT project.

Before applying database changes:

  npx supabase db push --dry-run

The only new migration from this pass should be:

  20260919004500_cancellation_payout_policy.sql

If migration history is otherwise clean:

  npx supabase db push
  npm run typecheck
  npm run build

Local scheduler test
--------------------
The cron endpoint requires the existing CRON_SECRET.
From PowerShell, with the local app running:

  Invoke-RestMethod `
    -Uri "http://localhost:3000/api/cron/payouts" `
    -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }

Do not paste CRON_SECRET into chat.

Important test-mode behavior
----------------------------
Stripe test-mode payouts do not move real money, but Stripe still creates payout
objects and goes through payout lifecycle behavior.

Existing host accounts
----------------------
After applying this pass, visit Payments & taxes and refresh/re-enter the Stripe
account flow if needed so account synchronization can confirm MANUAL payouts.
The hourly payout cron also re-checks connected Stripe payout schedules.

Pet-fee backlog (NOT implemented in this pass)
-----------------------------------------------
Keep this for the later Rates & fees pass:
- per pet per night
- per pet per stay
- flat per stay
- host-selectable calculation method
- preserve host-entered Find A Place pricing from availability-only iCal feeds

Next pass
---------
Host/guest transactional notifications:
- payment confirmed
- cancellation/refund
- payout scheduled
- payout initiated
- payout paid
- payout failed
- disputes / chargebacks where appropriate
