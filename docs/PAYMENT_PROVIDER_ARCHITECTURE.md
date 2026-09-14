# Payment Provider Architecture — Stripe + Square

Milestone 10A freezes the provider-neutral boundary but does not call either processor.

## One booking, one processor transaction

Find A Place must not collect a guest charge and then separately card-charge the host for the 5%/7% commission.

The intended provider execution is:

`reservation snapshot -> selected host processor account -> one guest payment -> processor fee + Find A Place application fee + host remainder`

Find A Place calculates the application fee before the adapter call from the reservation's immutable discounted lodging commission base.

## Stripe

Target: Stripe Connect direct-charge style routing on the selected connected host account with a Find A Place application fee. The processor-adapter milestone will confirm the final connected-account configuration against the actual Find A Place Stripe platform account before any test payment is accepted.

Milestone 10A reserves `STRIPE` account/provider state and the adapter contract only.

## Square

Target: seller OAuth connection, then Square Payments API using the seller OAuth context and `app_fee_money` for the Find A Place fee. Square documents application fees as part of the same processed payment, with the developer/platform fee credited to the developer account and the remainder credited to the seller after Square fees.

Milestone 10A reserves `SQUARE` account/provider state and the adapter contract only.

## Routing

`payment_accounts` are organization-owned references. `payment_account_assignments` can override at property or unit level.

Resolution order:

1. unit assignment;
2. property assignment;
3. organization default.

Reservations snapshot the resolved account/provider so later host configuration changes cannot silently redirect an old booking.

## Processing-fee policy

Launch/default: `HOST_FULL`.

Reserved future policies:

- `PLATFORM_CREDIT_PERCENT`
- `PLATFORM_CREDIT_FIXED`
- `PLATFORM_FULL`

A future Find A Place subsidy changes ledger economics, not which processor account owns the guest charge.

## Secrets and sensitive data

Never store raw bank account numbers, card data or SSNs in Find A Place application tables. Platform API secrets remain server-only environment configuration. Seller OAuth/provider credentials will be handled in the processor-adapter milestone using an appropriate encrypted secret boundary, not ordinary application metadata columns.

## Official references checked during architecture review

- Stripe Connect documentation: https://docs.stripe.com/connect
- Square application fees: https://developer.squareup.com/docs/payments-api/take-payments-and-collect-fees
- Square OAuth: https://developer.squareup.com/docs/oauth-api/overview
