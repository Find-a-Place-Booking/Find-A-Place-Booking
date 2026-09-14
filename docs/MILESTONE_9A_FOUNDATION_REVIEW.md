# Milestone 9A Foundation Review — 2026-09-13

Baseline reviewed: `68eae1d` + Milestone 9A package.

## Confirmed foundation

### Pricing ownership

- Base rates, date overrides, minimum stays, host fees, add-ons and promotions live in Find A Place/Supabase.
- `/host/rates/[slug]` is the single operational owner for base rates, standard fees and the default minimum stay. The general property editor is summary-only for those values, and its database save no longer mutates pricing tables. This removes stale-screen/tab overwrite risk.
- Stripe/Square do not own rates or coupons.
- Calendar/PMS availability is separate from pricing ownership.

### Rate resolution

- Base weekday/weekend pricing.
- Date-bound special/seasonal/custom overrides.
- Deterministic precedence: priority → narrower date range → newest rule.
- Friday/Saturday weekend behavior.
- Guest-facing special badge metadata reserved for public search/listing presentation.

### Stay rules

- Property default minimum stay remains fallback and is managed in the Rates & fees workspace.
- Date-bound/holiday minimum stay overrides resolve from arrival/check-in date.

### Fees

- Cleaning fee.
- Pet fee.
- Included-guest threshold + additional guest fee per extra guest/night.
- Commission excludes legitimate host fees.

### Add-ons

- Structured property/unit extras.
- Per stay, per night, per person and per person/night calculations.
- Separate quote line items and reserved tax-category mapping.
- Add-ons excluded from platform commission base.

### Promotions

- Percentage or fixed-dollar host promo codes.
- Property or organization scope.
- Optional check-in window, minimum nights, minimum lodging and future maximum-use configuration.
- One promo code per quote.
- Discount applies to lodging only and fixed discounts are capped at lodging subtotal.
- Platform commission follows lodging after the valid host discount.
- Preview validates but does not consume/redemption-count a code.
- `max_redemptions` cannot be configured below the already-consumed redemption count once reservations begin using it.

### Future reservation/payment boundary

The booking milestone must revalidate availability, obtain a hold, rerun authoritative pricing, atomically validate/consume promo usage, calculate taxes, snapshot all pricing/discount/commission components, then create payment-provider state.

Existing reservations must never be recalculated from current host settings.

### Future calendar/PMS boundary

Calendar sources own open/blocked state and sync health only unless an explicit provider-pricing mode is introduced later. iCal/PMS connections must not silently overwrite Find A Place rates/promotions.

### Public/guest boundary

Current host pricing RPCs remain authenticated operational tools. Guest-facing pricing/search should later use a deliberately safe published-inventory wrapper rather than exposing host pricing tables/RPC bundles directly.

## Intentionally deferred

These are not defects in 9A and should be handled by their owning milestones:

- canonical availability / owner blocks / iCal/PMS sync — 9B;
- temporary booking holds / reservation records / immutable snapshots — booking milestone;
- atomic promotion-redemption history — reservation milestone;
- jurisdiction-specific tax computation/remittance — tax/compliance milestone;
- Stripe Connect / Square adapter calls, processor fees, payouts — payment milestone;
- public guest promo entry / checkout UI — checkout milestone;
- advanced revenue management/dynamic pricing/provider-owned rate mode — later demand-driven expansion;
- add-on inventory/approval workflows or arbitrary quantities — later if real host use requires them.

## UI review

- Amenities/policy category summary rows use a fixed three-column layout so labels, selected counts and expand controls stay aligned.
- Pricing and promotion management stays within the existing Find A Place host-dashboard visual language and responsive panel/card patterns.
