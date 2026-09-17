# Find A Place — Sandbox Guest Booking / Stripe Test Flow

This overlay opens a **sandbox-only** guest checkout so the connected fake host
can receive a complete Stripe test booking. It does not open live booking.

## What it adds

- published stay date selection in sandbox mode;
- server-side availability recheck;
- 20-minute canonical reservation hold;
- immutable price + 5%/7% commission snapshot;
- READY Stripe host-account resolution;
- embedded Stripe Payment Element on Find A Place;
- destination-charge routing to the connected host;
- host-paid processing economics for the sandbox card test;
- server-verified post-payment finalization for localhost testing;
- Stripe webhook handler using the same idempotent DB confirmation transaction;
- conversion of INTERNAL_HOLD -> INTERNAL_RESERVATION after payment succeeds;
- promotion consumption + reservation/payment/ledger updates.

## Important architecture correction

The existing migration 017 resolver still required `charges_enabled`, which is
wrong for the Accounts v2 **recipient** Stripe host model you are now using.
This migration corrects that. Stripe hosts are considered routable when the
account is READY, has a provider account ID, and payouts are enabled.

## Install / apply

The current local project already has the Stripe React packages from the
embedded host onboarding work. If not:

```powershell
npm install @stripe/stripe-js @stripe/react-stripe-js
```

Extract this overlay into the project root.

Run migration:

`supabase/migrations/20260917001800_sandbox_guest_booking.sql`

Then explicitly enable only the DB sandbox gate:

```sql
update public.platform_runtime_flags
set allow_sandbox_guest_checkout = true,
    updated_at = now()
where singleton = 1;
```

Add the values shown in `SANDBOX_BOOKING_ENV.txt` to `.env.local`.

Then:

```powershell
npm run typecheck
npm run build
npm run dev
```

## First end-to-end test

1. Keep the fake host's Stripe account showing READY.
2. Open the marketplace in an incognito/private browser.
3. Open the published property attached to that host.
4. Choose available dates and guests.
5. Continue to test checkout.
6. Use guest name/email test data.
7. Click **Hold dates & continue to payment**.
8. Pay with Stripe sandbox card:
   - `4242 4242 4242 4242`
   - any future expiry
   - any CVC
   - any postal code
9. The localhost finalize route retrieves the PaymentIntent from Stripe and only
   confirms the reservation if Stripe says `succeeded`.
10. Confirm:
    - guest sees confirmed booking;
    - host Reservations shows it;
    - calendar dates are blocked as INTERNAL_RESERVATION;
    - Stripe sandbox shows the platform payment/application fee/transfer;
    - connected account balance reflects host proceeds.

## Fee model in this sandbox pass

For the card-only test:

guest total
- Find A Place 5%/7% commission
- estimated Stripe card processing fee
= host routed proceeds

The PaymentIntent's Stripe `application_fee_amount` equals:

Find A Place commission + sandbox processor-fee estimate

Stripe still technically debits processing from the platform balance on a
destination charge. Retaining the processor estimate causes the host to bear
that cost economically while preserving the platform commission.

The actual Stripe fee is retrieved from the Charge balance transaction after a
successful payment and recorded. For production, payment-method-specific fee
policy/reconciliation still needs a final launch review rather than assuming
2.9% + 30c for every method.

## Webhook

A webhook route is included at:

`/api/stripe/webhook`

For the first localhost 4242 test, the explicit sandbox finalizer means you do
not need Stripe CLI just to prove the happy path.

Before deployment/live booking, configure Stripe webhooks and add
`STRIPE_WEBHOOK_SECRET`. At minimum listen for:

- payment_intent.succeeded
- payment_intent.payment_failed

## Safety gates

Guest booking works only while BOTH are true:

1. `.env.local`: `BOOKING_SANDBOX_ENABLED=true`
2. DB flag: `allow_sandbox_guest_checkout=true`

Set either false to close test booking immediately.

Live booking remains a separate launch decision.
