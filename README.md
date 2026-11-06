# Find A Place Booking — In-house Airbnb comparison + cleaner checkout card

Prepared against production GitHub main commit `cd69a03f669c9b34bf167c5340149355f9bd1078` (November 4, 2026).

## What to do

Unzip into the **root of the Find-A-Place-Booking repository**, preserving folder paths and overwriting the matching files. This is a **drop-in replacement**: do not run BAT/Python/apply scripts.

Then in the project root:

```bash
npm ci
npm run typecheck
npm run build
node --test tests/airbnb-direct-pricing.test.mjs tests/booking-comparison-route.test.mjs
```

If the checks pass, commit and push. Vercel will build and deploy from GitHub. This ZIP is not itself a deployment.

## What changed

- `app/api/booking/airbnb-comparison/route.ts` — full replacement of the previous Apify-coupled comparison endpoint; uses the existing rate-limited database table, signed-in-independent public quotes, and an in-house data collector. Does not change checkout or Stripe amounts.
- `lib/bookings/airbnb-direct-pricing.ts` — **new** first-party quote collector. It tries a configured host-authorized price feed first, then (unless disabled) the publicly reachable Airbnb listing page. Does not log in, rotate proxies, bypass CAPTCHA or other protections. Parses an all-in BEFORE-TAX guest price only when listing ID, check-in, check-out, guest count and currency match; otherwise returns no comparison.
- `components/DirectBookingValue.tsx` — full replacement. Shows a compact, brand-matched comparison card and a collapsible Find A Place price and modeled host-fee breakdown; preserves props already used by checkout and booking receipt.
- `components/DirectBookingValue.module.css` — **new** responsive styling.
- `tests/` — automated parser, backend, cache, throttling, mismatched-price and fallback tests.

The existing `components/DirectBookingValue` is **already used in `app/checkout/page.tsx`**, and also on a booking receipt. Neither call site needs editing.

## Current data sources / limitations

**Airbnb-connected properties**: Use the existing Airbnb iCal connection *only to identify the same listing*. iCal does **not** contain prices. The server attempts to retrieve the matching before-tax guest total from publicly available structured price data if accessible, or from the optional **host-authorized** price feed below. Any stale, incomplete, nightly-only, tax-inclusive or mismatched data is rejected. Without an exact validated price the widget hides the numerical claim. It NEVER estimates the "actual" Airbnb price.

**Non-Airbnb-connected properties**: Continue to use the already-shipped, explicitly labeled *estimated* comparison based on equivalent host proceeds and Airbnb's **typical 15.5% host-paid service fee** versus Find A Place's actual 5% or 7% host fee. This is a fee-model example of a comparable stay, **not** Airbnb market-price research, and should not be marketed as a guaranteed or observed saving. Airbnb has exceptions and service fees can change.

**Airbnb's published Terms restrict automated collection.** This in-house reader is a best-effort integration, not an approved Airbnb API. Review permission/terms before enabling the public-page collector in production. It uses ordinary requests only; it will *not* bypass restrictions. There is no guarantee Airbnb includes any full guest prices in the returned HTML; a JS-rendered page may provide none. In that case a host-authorized pricing feed or licensed API is required. Never claim automatic "actual" savings if no matched quote exists.

This means **no one can accurately guarantee guest prices directly from Airbnb using iCal alone**. The new collector supports direct collection *when genuine price data is available*, but its effectiveness must be tested against a real Airbnb listing before reporting it as operational.

## Optional Vercel server-only configuration

- `AIRBNB_PUBLIC_PAGE_LOOKUP=false` — turn off the direct public-page fetch if collection isn't authorized. The default is to try it after the DB rate-limit permits a check, without anti-bot evasion.
- `AIRBNB_PRICE_FEED_URL=https://your-approved-source.example/quote` — optional endpoint you control, sourcing **authorized** host price data; invoked ahead of the public-page fetch.
- `AIRBNB_PRICE_FEED_TOKEN=...` — optional Bearer credential for that endpoint; store exclusively in Vercel server-side environment variables. **Never send credentials in the chat or commit them to GitHub.**

The authorized feed must respond with `Content-Type: application/json` and the **exact** dimensions. Example for illustration, not a real quote:

```json
{
  "listing_id": "12345678",
  "check_in": "2026-12-11",
  "check_out": "2026-12-14",
  "adults": 2,
  "currency": "USD",
  "available": true,
  "total_before_taxes": 650.42
}
```

The server validates these fields independently; fields the browser sends cannot set Airbnb or FAP totals.

## Caching and guardrails

The existing `airbnb_price_comparisons` table and `claim_airbnb_price_comparison` function were already migrated in production on November 4. **No new migration** is necessary.

The DB caps new checks to one per unit/dates/party in 30 minutes, six per unit/hour, and 120 across the platform/hour; accepted quotes are cached for two hours. Each HTTP fetch has a 10-second timeout and bounded response size. The comparison fails closed and cannot block booking/Stripe/payment or calendar operations.

## What was validated

- 19 local automated tests passed, including exact match, mismatched dates/guests/IDs, rejection of a nightly-only or opaque total, prevention of adjacent-listing price contamination, caching, no-quote behavior, and unlinked estimated fallback.
- Strict isolated TypeScript typecheck passed for the edited files with interface stubs, and TS/TSX syntax checked.
- Full Next.js build **was not run** (complete repository dependencies/source not accessible inside the editing container).
- **Live Airbnb source access and production Vercel deployment were not tested.** You must run the full build and test one known Airbnb price on the checkout page after pushing. The direct website may not expose enough data; keep the widget hidden rather than assuming a saving.

## QA after deploying

1. Unlinked property: enter future dates and party size. Confirm estimate appears, is labeled *Illustrative estimate*, and expands for breakdown/assumptions.
2. Linked Airbnb property: enter future dates and party size. Confirm **no unverified numeric claim** if direct source can't supply full guest price. If one appears, manually confirm the same Airbnb listing, dates, guests, currency and pre-tax total.
3. Recheck with different dates/guests; ensure no stale result is displayed.
4. Confirm mobile layout, that the actual guest subtotal/total remain unchanged, and that booking still works normally.
5. Revalidate the booking receipt: only show comparison when the stored pre-tax price is still exactly equal to the current FAP quote.

## Files deliberately NOT changed

Payment processing, host payout logic, Stripe integration, tax calculation, reservation creation, calendar import/export, host rates, marketplace fees, and database schema.
