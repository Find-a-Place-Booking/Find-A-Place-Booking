# Find A Place - embedded Stripe experience

## Goal

Hosts and guests remain on Find A Place.

Stripe still owns every sensitive field. We do **not** collect bank numbers,
identity documents, SSNs or card numbers into ordinary Find A Place forms and
then forward them ourselves.

## Host side

Host dashboard:

`/host/payments`

The page loads Stripe Connect's embedded account-onboarding component. The app
creates/reuses the connected account on the server, then creates a short-lived
Stripe Account Session. The browser receives only the Account Session client
secret and renders Stripe's component inside Find A Place.

Data boundary:

Find A Place -> organization ID / Stripe acct_ reference / readiness flags
Stripe -> bank account / identity / compliance / verification requirements

## Guest side

Use the same principle for checkout.

Recommended Find A Place experience:

property -> dates -> guest details -> price breakdown -> embedded Stripe payment
component -> confirmation

The guest remains on `/checkout`. Stripe's embedded Checkout or Payment Element
owns card/wallet fields.

The payment server call must use the already-snapshotted reservation values:

- `guest_total_cents`
- `platform_commission_cents`
- `provider_account_ref`

For Stripe Connect destination-charge routing:

- platform creates the guest payment
- application fee = reservation's 5% / 7% commission snapshot
- destination = host's connected Stripe account
- Stripe handles payment credentials in its embedded UI

## Packages

Install in the project root:

npm install @stripe/connect-js @stripe/react-connect-js @stripe/stripe-js @stripe/react-stripe-js

This overlay currently uses the Connect packages for host onboarding. The Stripe
payment packages are listed now because the public guest-checkout pass should use
the same embedded approach.

## Webhook

Embedded UI does not replace webhooks. The browser is not authoritative for money
or account readiness.

Before full booking testing, create a sandbox Stripe webhook pointing at:

`https://YOUR-SITE/api/stripe/webhook`

At minimum the finished payment pass should process:

- account.updated
- payment_intent.succeeded
- payment_intent.payment_failed
- charge.refunded
- charge.dispute.created

The webhook secret stays server-side as `STRIPE_WEBHOOK_SECRET`.

## Why the guest payment is not opened by this host overlay

The current repository intentionally has anonymous public checkout disabled.
Its reservation-hold RPC is protected for authenticated host/admin test tools.
Opening a card form before opening a safe guest reservation transaction would
allow payment logic to bypass the database's availability lock, pricing snapshot,
commission snapshot and promo/tax boundaries.

So this overlay changes the HOST experience now. The guest pass should open the
reservation boundary and embedded payment together, not separately.
