# Stripe sandbox integration

This overlay moves Milestone 10A from a provider-neutral stub to a testable
Stripe Connect boundary without enabling live credentials.

## Model

Find A Place creates the guest charge on the platform and routes the host share
with a Stripe Connect destination charge.

- Host connection: Stripe Express + Stripe-hosted onboarding.
- Platform revenue: `application_fee_amount`.
- Host routing: `transfer_data[destination]`.
- Raw bank account, identity and card data never enter Find A Place tables.
- `payment_accounts.provider_account_id` stores only the Stripe `acct_...` ID.

## Required environment values

Keep sandbox/test values during this phase:

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SECRET_KEY` **or** `SUPABASE_SERVICE_ROLE_KEY`

After the webhook endpoint is created in Stripe:

- `STRIPE_WEBHOOK_SECRET`

The server-only Supabase key is now justified because processor webhooks have no
signed-in user session and must update payment/account state after Stripe's
signature is verified.

## Host test

1. Sign in as a host.
2. Open `/host/payments`.
3. Click **Connect Stripe**.
4. Complete Stripe's sandbox onboarding.
5. Return to Find A Place.
6. The local `payment_accounts` row should show `READY` once payouts are enabled.

## Webhook

Create a Stripe sandbox webhook endpoint that points to:

`https://YOUR_SITE/api/stripe/webhook`

Listen at minimum for:

- `account.updated` (connected-account events)
- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `payment_intent.payment_failed`

Add the resulting `whsec_...` value as `STRIPE_WEBHOOK_SECRET`.

## Important boundary

The public guest checkout screen in the current repository is still deliberately
disabled and the existing reservation test RPC is host/admin authenticated.
This overlay wires the processor and host payout side safely; opening anonymous
guest reservation creation should be a separate reviewed change so availability,
pricing, taxes, promo redemption, fraud controls and duplicate-booking locking
are not bypassed.
