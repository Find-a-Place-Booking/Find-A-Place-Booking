# Milestone 10A.1 — Reservation / Payment Integrity Hardening

Baseline: `ecfca766`.

This pass closes integrity gaps found after the first reservation/payment-foundation commit without expanding into processor integration.

## Database protections

- Reservation `organization_id → property_id → unit_id` is now enforced by composite foreign keys in addition to the existing individual foreign keys.
- Payment-account assignments are rejected unless the account and property/unit resolve to the same organization.
- A payment account cannot be moved to another organization after creation.
- A reservation cannot snapshot a payment account/provider/account/location combination that does not match the same organization and processor record.
- Reservation-linked availability blocks must use the reservation unit and an internal hold/reservation block type.
- Reserved promo rows must match the reservation organization and property/unit scope.
- Payment rows must match the processor route and currency snapshotted on the reservation.
- Refunds must belong to their payment/reservation and use the same currency.
- Financial-ledger payment/refund links are validated against the same reservation before an append-only entry is accepted.
- Direct calls to `resolve_payment_account_for_unit` now require authentication plus owner/manager or active-admin access.
- Pricing, policy, promotion, commission, stay dates/party size, pre-tax total and processing-policy snapshot fields cannot be silently rewritten after reservation creation.
- Processor routing may be attached once before payment starts, then becomes immutable.

## Development test tools

The 10A test-hold RPCs are now behind two gates:

1. the Next.js server action refuses them in `NODE_ENV=production`;
2. PostgreSQL requires `platform_runtime_flags.allow_test_reservation_tools = true`.

The database flag defaults `false` and has no authenticated table policy. Only a privileged development/operations SQL session can toggle it.

Test-hold cancellation additionally requires the immutable append-only `HOLD_CREATED` event to contain `test_only=true`, so the helper cannot cancel a future real checkout hold.

## Still intentionally absent

- live guest checkout;
- Stripe Connect calls;
- Square OAuth or Payments API calls;
- webhooks;
- taxes;
- payout scheduling/release;
- live-money activation.
