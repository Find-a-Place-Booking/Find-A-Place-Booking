# Find A Place Booking — Production Milestone 9A (Revised)

Baseline: `68eae1d` — accepted Step 8 cleanup.

This package completes the **pricing / stay-rule / promotion foundation before calendar availability** and includes the Amenities selected-count alignment cleanup.

## What is real now

- Host `/host/rates` property pricing index.
- Property pricing workspace at `/host/rates/[slug]`.
- Base weeknight/weekend pricing plus the default/fallback minimum stay.
- Rates & fees is the single operational pricing owner; general property saves no longer overwrite rates/fees/minimum-stay values.
- Cleaning and pet fees.
- Additional guest fee + included guest threshold.
- Date-bound special/seasonal/custom rates.
- Guest-facing special label metadata for future date search.
- Date-bound minimum-night rules for holidays/events.
- Optional guest add-ons such as romance packages.
- Structured calculation modes for add-ons.
- Host-created promo/discount codes:
  - percentage or fixed-dollar;
  - property or organization scope;
  - optional eligible check-in dates;
  - optional minimum nights / lodging;
  - future maximum-use configuration.
- Promo-aware quote math with discount applied to lodging before commission.
- Deterministic overlapping-rate resolution.
- Pre-tax pricing preview using the same structured quote boundary intended for checkout.
- Admin read-only visibility into operational pricing and promo codes.
- Durable audit events for pricing/promotion mutations.
- Amenities category summary counts aligned in a fixed, symmetrical column.

## What remains deliberately disconnected

- real availability / owner blocks;
- iCal/PMS connections;
- reservation holds;
- reservations;
- atomic promo redemption history/consumption;
- tax calculation/remittance;
- Stripe/Square calls;
- payouts;
- live money.

The quote RPC explicitly marks availability, taxes, payment processing, promo redemption and bookability as unresolved/false.

## Supabase

Complete 9A migrations:

1. `supabase/migrations/20260911001100_pricing_stay_rules_addons.sql`
2. `supabase/migrations/20260913001200_promotion_codes_pricing_quote.sql`

If 011 has already been applied to the current Supabase project, **do not rerun it**. Run only 012.

If 011 has not been applied, run 011 and then 012.

Expected health schema after both:

`pricing-stay-rules-promotions-v1`

## Local verification

```bash
npm run typecheck
npm run build
npm run dev
```

Full acceptance sequence: `docs/APPLY_MILESTONE_9A.md`.

After 9A is accepted and checkpointed, the next milestone is **9B canonical availability + calendar/iCal foundation**. After 9B passes locally, establish the Vercel staging environment for real HTTPS integration testing.
