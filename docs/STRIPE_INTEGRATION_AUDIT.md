# Stripe integration audit — corrected model

This patch replaces the earlier trial patches. The previous versions mixed
legacy Accounts v1 concepts, omitted Accounts v2 responsibilities, and pinned an
unverified API version. Those were mistakes.

## Correct Find A Place model

Find A Place is a marketplace using destination charges.

Guest payment:
- Charge is created on the Find A Place platform.
- `transfer_data.destination` routes the host share to the connected host.
- `application_fee_amount` is the Find A Place commission snapshot (5% or 7%).
- Stripe processing fees for destination charges are deducted from the PLATFORM
  balance, not calculated only against Find A Place's commission amount.

Host account:
- Accounts v2 (`POST /v2/core/accounts`)
- `configuration.recipient`
- `stripe_balance.stripe_transfers`
- `dashboard: none`
- embedded Connect Account Onboarding
- no Stripe-hosted Dashboard redirect

Connected-account responsibilities in this embedded setup:
- `defaults.responsibilities.fees_collector = stripe`
- `defaults.responsibilities.losses_collector = stripe`

This makes Stripe responsible for the connected account's risk/KYC lifecycle
while Find A Place renders the Stripe-owned onboarding UI inside the host portal.
It does NOT change the destination-charge rule that the platform pays processing
fees for guest charges.

We do NOT assign the `merchant` configuration because Find A Place is not using:
- direct charges, or
- `on_behalf_of` to make the host the settlement merchant.

If either of those decisions changes later, the connected-account configuration
must be revisited.

## Embedded onboarding

Connect embedded components use a server-created AccountSession. The client only
receives the short-lived AccountSession client secret. Bank information, identity
documents, tax IDs, SSNs, and payout account details remain inside Stripe's
component.

## Readiness

A recipient account is ready when:
- `configuration.recipient.capabilities.stripe_balance.stripe_transfers.status`
  is `active`, and
- `configuration.recipient.capabilities.stripe_balance.payouts.status`
  is `active`.

`charges_enabled` is not the host readiness gate for this architecture because
the host does not create the guest charge.

## Still required before full booking test

- Stripe webhook endpoint + signing secret.
- Public guest reservation/hold transaction.
- Embedded guest payment UI.
- Destination-charge PaymentIntent or embedded Checkout Session.
- Webhook-driven reservation confirmation.
- Refund and dispute handling.
- Reconciliation of actual Stripe processing fees.

## Important fee correction

For destination charges with `application_fee_amount`, Stripe documents that:
1. the full charge is transferred to the connected account,
2. the application fee is transferred back to the platform,
3. Stripe's processing fee is deducted from the PLATFORM balance.

Therefore the processor fee must be modeled from the full guest payment according
to Stripe's actual fee schedule, not as 2.9% of only the 5%/7% Find A Place fee.
