# Pricing Integration Boundaries

This document is the contract for connecting Milestone 9A pricing to later availability, reservations, taxes and payment processors.

## 1. Core ownership

Find A Place owns its canonical rate/stay-rule/discount model unless a future host explicitly chooses a provider-owned pricing mode. Merely connecting an iCal/PMS availability source must never overwrite host rates or promotions.

The dedicated Rates & fees workspace is the single operational owner of base pricing, standard fees and the default minimum stay. General property identity/content saves must not mutate these values.

Canonical host pricing tables:

- `unit_rate_settings` — base weekday/weekend rate + included guest threshold
- `property_units.minimum_stay_nights` — default/fallback minimum stay, managed from the Rates & fees workspace
- `unit_rate_rules` — date-based nightly overrides
- `unit_stay_rules` — date-based minimum-night overrides
- `unit_fees` — cleaning/pet/additional-guest fees
- `unit_add_ons` — optional guest extras
- `promotion_codes` — host-created percentage/fixed lodging discounts, scoped to one property or the organization

## 2. Rate precedence

For a given night:

1. active matching date-rate rule with highest `priority`;
2. if tied, the rule with the narrower date span;
3. if still tied, newest rule;
4. otherwise base rate.

Friday and Saturday are weekend nights. A date rule's weekend override wins on those nights when present; otherwise that rule's normal nightly rate is used.

## 3. Minimum stay precedence

The applicable minimum stay is resolved from the **arrival/check-in date**:

1. active matching stay rule with highest priority;
2. narrower range;
3. newest rule;
4. otherwise `property_units.minimum_stay_nights`.

## 4. Promotion / discount contract

Promotion codes are host-owned pricing rules, not Stripe/Square coupons.

- one code may apply to a quote at a time;
- codes may be property-scoped or organization-wide;
- percentage and fixed-dollar discounts are supported;
- optional eligible check-in dates, minimum nights, minimum lodging and maximum redemption configuration are stored;
- discounts apply to **lodging only** in the current model;
- a fixed discount is capped at the lodging subtotal and can never make lodging negative;
- Find A Place commission is calculated from lodging **after** the valid host discount;
- quote preview validates a code but never consumes a redemption;
- future reservation creation must atomically validate/consume any usage limit and snapshot the exact promotion ID/code/discount amount into immutable reservation/ledger records;
- payment processors receive the already-discounted final line items and never own the business rule.

`redemption_count` is reserved for the future booking transaction and cannot be changed through host pricing RPCs.

## 5. Calendar / PMS contract

Milestone 9B availability should answer only whether a unit-night is open/blocked and why. It then joins/resolves 9A pricing for display/search.

Required later source concepts:

- canonical unit-night state;
- owner/manual block;
- imported iCal block;
- native Find A Place hold/reservation;
- direct PMS block/reservation;
- source identifiers + timestamps;
- sync health and stale-data warnings.

A connected provider may eventually be allowed to supply rates only through an explicit provider-pricing mode added later. Do not infer rate ownership from an availability connection.

## 6. Reservation contract

Before a reservation is created, the booking engine must:

1. resolve availability;
2. acquire/revalidate a short hold;
3. run authoritative pricing for exact dates/guest/pet/add-on/promo selection;
4. atomically validate and reserve/consume a promo usage limit when applicable;
5. calculate jurisdiction-appropriate taxes;
6. snapshot all price/rule/discount components into immutable reservation/ledger rows;
7. only then create/confirm processor-side payment state.

Later host edits must not mutate existing reservation totals.

## 7. Commission contract

`commission_base_cents` is the nightly lodging subtotal **after** host date-rate resolution and any valid host promotion code.

It excludes legitimate separate fees, taxes, refundable deposits and optional add-ons. The reservation snapshots the organization commission tier/rate in force at booking creation.

## 8. Payment processor contract

Stripe Connect first and Square second are adapters around platform-owned booking/ledger state. Core pricing tables must not store processor-specific price/coupon IDs.

The future processor adapter receives structured final line items and returns provider identifiers/state. Processor fees belong in the financial ledger, not rate rules or promotion tables.

`quote_unit_stay` is deliberately pre-tax and processor-neutral. Its safety flags remain false until later subsystems have actually run.

## 9. Tax contract

Tax liability/remittance is not hard-coded to host, platform or processor. The later tax layer maps lodging, fees, discounts and add-ons to the actual jurisdiction/provider treatment and snapshots results on the reservation.

`unit_add_ons.tax_category` is a reserved mapping field, not a declaration of taxability.

## 10. Guest/public pricing boundary

The current pricing RPCs are authenticated operational tools for hosts/admin and test preview. A future guest-facing search/checkout path should use a deliberately safe server/RPC wrapper that exposes only published inventory and allowed pricing output. Do not make the raw host pricing bundle public merely to support guest quoting.
