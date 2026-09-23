# Admin TEST / LIVE environment isolation

This patch makes the admin booking and transaction views follow the Stripe keys
that are actually running the application.

## Intended environment split

- Vercel Production: `pk_live_...` + `sk_live_...` -> admin shows LIVE booking
  and transaction data.
- Local `.env.local`: `pk_test_...` + `sk_test_...` -> admin shows TEST/sandbox
  booking and transaction data.

The app uses the existing `stripeEnvironment()` helper, so there is no manual
toggle an admin can accidentally leave on the wrong environment.

## What is isolated

- Admin overview reservation totals
- Admin reservation list
- Reservation detail/payment/refund view
- Refund/admin reservation actions
- Human-readable Activity log transaction events
- Stripe connected-account activity

A TEST reservation cannot be opened from the LIVE admin detail route, and a
LIVE reservation cannot be opened locally while TEST keys are active.

## What remains shared

Profiles, host organizations, properties, listing content, policy/content edits,
and other non-payment platform administration remain shared. Those records are
not Stripe sandbox/live transactions.

## Reports were already correct

`lib/admin/reports.ts` already filters reservations, payments and refunds with
`stripeEnvironment()`. The CSV export uses that same helper, so no report code
needed changing.

## Database/history behavior

Nothing is deleted. TEST payment history stays in Supabase and reappears when
the app runs with TEST Stripe keys. LIVE history stays available only in LIVE
mode.

No database migration is required.

## Payment safety

This patch does not change:
- PaymentIntent creation
- Stripe Connect onboarding
- webhook processing
- direct-charge routing
- application-fee calculation
- refund calculation
- tax calculation

It only filters admin reads and blocks cross-environment admin mutations.

## Apply

This overlay assumes the human-readable Activity Log overlay/migration 068 is
also being used.

```powershell
npm run typecheck
npm run build
```
