# Promotion → Reservation → Payment Boundary

This document is the source-of-truth handoff for how Find A Place discount codes must connect to checkout and payment processors later.

## Ownership

Promotion codes are **Find A Place pricing configuration** stored in Supabase. They are not Stripe coupons and not Square discounts. The platform resolves the discount first and sends finalized reservation amounts to the selected payment-provider adapter.

## Quote stage

A preview/public quote may validate:

- code exists and is active/not archived;
- property/organization scope;
- quote currency;
- eligible check-in window;
- minimum nights;
- minimum lodging subtotal;
- max-redemption capacity as a non-locking preview check;
- advertised-special stacking policy.

Previewing a quote never increments usage and never guarantees the final reservation can consume the code.

## Reservation/hold stage — future required transaction

When reservation infrastructure is built, the authoritative booking transaction must lock/revalidate the relevant records and do the following as one coherent operation:

1. verify the property/unit is still published/bookable;
2. revalidate canonical availability for the requested nights;
3. create or validate the temporary booking hold;
4. rerun authoritative pricing using current date rules/stay rules/fees/add-ons;
5. revalidate the promo under lock;
6. reserve/consume one allowed redemption atomically so two simultaneous checkouts cannot oversubscribe a limited code;
7. snapshot promotion ID/code/label/type/configured value/actual discount into reservation financial history;
8. snapshot nightly lodging, fees, add-ons and 5%/7% commission tier/base;
9. calculate/snapshot tax with the jurisdiction layer;
10. create provider-facing payment state from the immutable reservation amounts.

A future `promotion_redemptions` record should link a consumed/reserved use to the hold/reservation rather than relying only on `promotion_codes.redemption_count`. Cancellation/expired-hold behavior must explicitly release or reverse a reserved use according to the booking state model.

## Processor boundary

The payment adapter receives amounts and metadata; it does not decide the discount. Core code should target a provider-neutral contract such as:

- reservation/payment reference;
- currency;
- guest total;
- host proceeds basis;
- platform application fee/commission;
- tax amounts and liable party metadata;
- idempotency key.

Stripe/Square IDs are integration metadata and must not become the source of truth for rates, discounts or commissions.

## Refunds

Refund calculations must use the reservation snapshot/ledger, not current promo or rate settings. Promo configuration can change or be archived after booking without changing the historical reservation.

## Current 9A.1 rule

Advertised/public special rates do not combine with a promo code unless that promotion explicitly sets `allow_with_public_special=true`. This prevents accidental double-discounting while still letting a host deliberately create a stackable campaign.

## Open policy before live money

Decide whether hosts may create 100% lodging discounts/true comps. Current pricing math permits them; no hidden business cap should be introduced without an explicit product decision.
