# Apply / Verify Milestone 9A — Pricing, Stay Rules, Promotions & Add-ons

Baseline known-good checkpoint: `68eae1d`.

This milestone intentionally comes **before** calendar sync. Pricing says what an allowed stay costs; the next calendar milestone says whether the nights are available. Do not combine those responsibilities.

## 1. Copy the package

Overlay this package on the current repository while preserving the existing:

- `.git`
- `.env.local`
- `package-lock.json`

No new npm dependency is required.

## 2. Supabase migrations

The complete 9A foundation uses:

1. `supabase/migrations/20260911001100_pricing_stay_rules_addons.sql`
2. `supabase/migrations/20260913001200_promotion_codes_pricing_quote.sql`

If migration 011 has **already** been run successfully in your current Supabase project, do not rerun it; run only 012.

If 011 has not been run, run 011 first, let it complete, then run 012.

Do not rerun migrations 001–010.

Migration 011 adds:

- `unit_rate_rules`
- `unit_stay_rules`
- `unit_add_ons`
- `unit_rate_settings.included_guests`
- audited host pricing RPCs
- deterministic daily pricing resolver
- structured pre-tax stay quote RPC

Migration 012 adds:

- `promotion_codes`
- property-wide or organization-wide promo scope
- percentage/fixed lodging discounts
- eligibility/minimum/max-use configuration
- audited promo CRUD
- promotion-aware pre-tax quote output
- commission base after valid host discount
- the Rates & fees workspace becomes the single owner of operational rates, standard fees and the default minimum stay, preventing stale property-detail saves from overwriting pricing

## 3. Local compiler/runtime gate

```powershell
npm run typecheck
npm run build
npm run dev
```

Then open:

`http://localhost:3000/api/health/supabase`

Expected schema:

`pricing-stay-rules-promotions-v1`

## 4. Property editor alignment check

Open a property with multiple amenity categories selected.

Under **Amenities**, verify every category row uses the same three-column alignment:

- category label on the left;
- selected count in the same centered column;
- expand/collapse control in the same right column.

Check desktop plus 390–430 px mobile.

## 5. Base pricing test

Open `/host/rates` and select Pine Hollow (or another real test property).

On `/host/rates/[slug]` verify:

- existing base weeknight/weekend rates appear;
- default minimum stay appears and can be changed here;
- cleaning/pet/extra-guest fees appear;
- set `Guests included in nightly rate` below max capacity;
- set an additional guest fee;
- save, refresh and verify persistence;
- sign out/sign in and verify persistence.

Negative checks:

- included guests > maximum property guests fails cleanly;
- extra guest fee with no included-guest threshold fails cleanly;
- base weeknight rate cannot be zero/blank;
- default minimum stay must be 1–365 nights.

Then open `/host/properties/[slug]`. The Rates & fees section should be a read-only summary/link rather than a second pricing editor. Change/save another property field and confirm it does **not** alter rates, fees, included-guest threshold or default minimum stay.

## 6. Holiday/special-rate test

Create a date rate such as:

- Name: `Christmas Special`
- Type: `Special`
- Start: December 23
- End: December 27
- Nightly override: a clear value different from base
- Guest-facing special label: `Christmas Special`
- Highlight as special: checked
- Active: checked

Create a minimum-stay rule for the same range, e.g. 3 nights.

Verify both survive refresh/sign-in.

## 7. Overlap precedence test

Create a second rate rule inside the first range with a higher priority and a different price.

Use Pricing preview with a stay that includes the overlap.

Expected:

- higher priority wins;
- if priorities tie, narrower date range wins;
- if both tie, newest rule wins;
- Friday/Saturday use the selected rule's weekend override when provided, otherwise its normal nightly override.

## 8. Minimum-stay resolution test

Use Pricing preview with check-in inside the holiday rule:

- a stay shorter than the minimum returns a clear error;
- an allowed stay quotes normally;
- minimum-stay rule is evaluated from arrival/check-in date.

## 9. Additional guest fee test

Example:

- max guests: 6
- included guests: 4
- extra guest fee: $20 per guest/night
- preview: 6 guests, 3 nights

Expected extra-guest line = `2 × $20 × 3 = $120`.

Preview must reject guest count above property capacity.

## 10. Add-on test

Create at least two add-ons:

1. `Romance package` — flat per stay
2. `Firewood bundle` — per night

Select them in Pricing preview.

Verify they appear as separate quote line items and are **not** added to `commission_base_cents`.

Tax category may remain blank. Do not invent a tax treatment merely to fill it.

## 11. Mike-style promo-code test

Create:

- Code: `FANCY25`
- Label: `25% direct booking special`
- Type: percentage
- Value: `25`
- Scope: this property
- Active: yes

With a $150 lodging subtotal, preview with `FANCY25` should show a $37.50 discount and a $112.50 lodging/commission base before separate fees/add-ons.

Also verify:

- lowercase guest input such as `fancy25` resolves case-insensitively;
- invalid/inactive code fails cleanly;
- fixed-dollar code works and cannot reduce lodging below $0;
- optional check-in date/minimum-night/minimum-lodging constraints reject ineligible stays;
- organization-scope code appears in the pricing workspace for another property in the same organization;
- duplicate code within the same organization is rejected;
- pricing preview does **not** increase redemption count.

`max_redemptions` is configuration only until reservation creation exists. The booking milestone must atomically consume/reserve usage and create immutable redemption/reservation history.

## 12. Quote safety boundary

A successful preview must remain non-bookable:

- Availability: not checked
- Taxes: not calculated
- Payment processor: not contacted
- Promo redemption: not consumed
- quote is not a reservation/hold

This is intentional. Do not wire checkout around these flags yet.

## 13. Published-property behavior

Pricing is operational, not listing-identity content.

For a PUBLISHED test property, confirm `/host/rates/[slug]` can update rates/rules/promos while `/host/properties/[slug]` identity/photo editing remains locked according to the existing review lifecycle.

## 14. Admin visibility

Open `/admin/properties/[propertyId]` and verify Admin can see:

- base rates;
- date-rate count/list;
- minimum-stay-rule count/list;
- promo-code count/list;
- add-on count/list.

Admin visibility is read-only in this milestone.

## 15. Regression pass

Recheck:

- host signup/sign-in/sign-out;
- host avatar;
- host onboarding persistence;
- property edit/save/reload;
- property photos;
- property review/approval/publication;
- public published listing visibility;
- private exact address/contact boundaries;
- admin host/property/partner/audit screens;
- mobile navigation;
- `/host/rates` and `/host/rates/[slug]` around 390–430 px;
- no booking/payment/calendar screen falsely claims those systems are connected.

## 16. Commit only after acceptance

```powershell
git add .
git commit -m "feat: add pricing stay rules promotions and guest add-ons"
git push origin main
git rev-parse --short HEAD
```

Record the hash before starting Milestone 9B.
