# Find A Place — Guest Experience + Booking Comparison Overlay

**Project snapshot:** GitHub `Find-a-Place-Booking/Find-A-Place-Booking`, main branch as inspected on November 11, 2026.

This overlay implements **items 2 and 3 only** from the user's request. It does not change Stripe collection, reservations, taxes, host calendars, ResNexus, or messaging.

## APPLY TO YOUR PROJECT (IMPORTANT)

1. Extract this ZIP **inside the repository root** (the folder with `package.json`). Overwrite matching files. This installs eight new/replacement page, component and utility files.
2. **Double-click `APPLY_GUEST_UPDATES.bat`** on Windows to apply the other eight edits. This second step is required. On macOS/Linux: `python3 APPLY_GUEST_UPDATES.py`.
3. The updater checks exact Git blob versions before modifying any existing source file; mismatches abort safely. Backups are saved in `.git/fap-guest-overlays/2026-11-11` (or a separate temporary folder if no `.git`). If it reports a mismatch, do **not** force it. Refresh the overlay for your new source instead.
4. Validate the project: `npm run typecheck`, `npm run build`. Then commit and push with your normal Git workflow. Make sure Vercel uses the new deployment.

This is a carefully guarded overwrite/update overlay, **not a database migration**. GitHub connector permissions do not allow directly committing these files for you.

## REQUEST CHECKLIST

- [x] Homepage Featured Stays restricted to published **Cabin** properties whose `homepage_feature_priority` is **1** (launch) and whose host's `partner_status` is **VERIFIED**. Never fills vacant slots with other types.
- [x] Buffalo National River targeted searches capped at **12 straight-line miles** of defined Buffalo access points. Norfork/White River excluded; Lucky Star and Cabin in the Woods retained in tests. General geographic search remains unchanged.
- [x] Public `/experiences` directory and **Experiences** menu link, deduplicated by title/category/local host area, using only published stay connections.
- [x] Distinct **Luxury stays** ($300+ starting nightly rate, excluding RV/campsites) and **Unique stays** (unusual property types/tags/named cabooses/treehouses). Unique URLs are no longer redirected to Luxury.
- [x] **Budget Friendly** label with `< $150` starting nightly threshold. Older Under $150 search links map to Budget Friendly.
- [x] Guest mobile web app property gallery supports horizontal swiping, previous/next arrows, keyboard arrows, an image count, and accessibility labels.
- [x] Same-property **other booking platforms** comparison added immediately beneath estimated total in property booking card; checkout still shows its comparison alongside the total.
- [x] Existing verified external quotes are distinguished from **illustrative modeled comparisons**. When a quote cannot be verified, the API falls back to its existing 15.5% fee-assumption model instead of returning no card, where sufficient real Find A Place checkout data exists.
- [x] Guest-facing comparison names **other booking platforms**, not individual competitors. Shows a positive savings figure only when data supports it. Discloses modeling assumptions and taxes/host promotions. Does not alter real checkout price.

## SAFETY

- No manual changes to availability, prices, tax configuration, Stripe or host payouts.
- The price comparison API still requires a published property, active unit, valid dates/guest count, and a real checkout quote before estimating.
- All price differences are **before taxes**, while the nearby actual trip estimate displays taxes when collected in the checkout quote. This distinction is intentional.
- The public Experiences hub excludes recommendations from unpublished listings.
- If Supabase launch eligibility lookup fails, featured spots are hidden, not populated with unrelated properties.
- If a verified external quote is unavailable, a *modeled* price is not labeled as a checked price.

## TESTING

Static TS/TSX parsing passed on the six direct source modules, plus eight focused tests:
- Buffalo radius and named property inclusion/exclusion
- Luxury/Unique/group classifiers
- Experiences use only published properties and deduplicate
- Eight audited source SHA guards
- Launch-only cabin eligibility criteria
- Mobile gallery controls and scroll snapping
- Comparison fallback path transformation
- No changes to booking/calendar/ResNexus authorization paths

**Not yet run:** Full `npm run typecheck`, full `npm run build`, and a real-browser checkout test require the complete repository/deployment. Don't mark live until your build and deployment pass.

## LIVE SMOKE TEST AFTER DEPLOY

1. Homepage Featured grid: only launch VERIFIED partner **Cabin** stays.
2. `/stays?filter=Unique%20stays`: caboose and other distinctive stays; `/stays?filter=Luxury%20stays`: higher-priced stays.
3. `/stays?filter=Budget%20Friendly`: nightly price under $150; older `Under%20%24150` deep-link still resolves.
4. Buffalo National River collection: Lucky Star and Cabin in the Woods included; Norfork/White River excluded.
5. `/experiences`: page loads, attractions deduplicate per host area, linked stays are published.
6. Guest app `/apps/guest`: select property with 2+ photos; swipe and use both arrows/counter.
7. Property page: select dates and guests; actual quote and comparison appear together, with fees and taxes distinguished.
8. Same booking on `/checkout`: final quote matches the booking flow; no named competitor appears in comparison. Verify live competitor quote vs modeled estimate labels.
9. No change to real booking payment, calendar, messaging, or ResNexus state.
