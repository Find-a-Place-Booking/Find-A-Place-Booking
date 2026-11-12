# Find A Place — Immediate Savings Where Guests See Prices

**November 11, 2026 · Guest-facing update for previous work-list items 2 and 3**

This ZIP **supersedes** `FAP_Guest_Experience_Search_Comparison_Overlay_2026-11-11.zip`. Do not run both update scripts. This package includes all guest-feature files from that earlier overlay **plus** the immediate price-side savings treatment.

## Install (Windows)

1. Extract **all** the ZIP contents into the **root folder** of your Find A Place Booking project (the folder containing `package.json`). Approve replacing files when Windows asks.
2. Double-click **`APPLY_GUEST_UPDATES.bat`**. The script applies the remaining source edits. Python 3 is required. On macOS/Linux: `python3 APPLY_IMMEDIATE_PRICES.py`.
3. Run `npm run typecheck` and `npm run build` in the project folder. Do **not** push if they fail. Commit and push the changes using your normal workflow.
4. Vercel must deploy the new commit. Check the real pages, especially on mobile. **No server configuration, database migration, or Railway redeployment is needed for these guest-side changes.**

The update script supports either (a) the eight core files as they stood in GitHub on Nov 11, where the previous overlay only installed new files, or (b) all eight core edits already installed by the previous script. It **refuses unfamiliar or partially modified source** rather than silently overwriting other changes. It backs up touched files under `.git/fap-guest-overlays/` (or a temporary folder if `.git` is unavailable). If it refuses, stop and reconcile your current source; don't force it.

## Immediate price-side placement (new in this ZIP)

| Guest moment | What they see |
|---|---|
| Homepage featured stay card | Starting nightly rate immediately followed by an **illustrative potential savings per night** line |
| Main website search/listing card | Same clearly labeled savings line immediately beneath `$/night` |
| Property details, before dates | Saving illustration next to the visible `$/night` rate, without waiting for check-in dates |
| Property details, after dates and guest count | Real Find A Place estimated trip total, immediately followed by **other booking platforms** comparison, **before** the detailed fees and Reserve button |
| Standalone guest web app, listing cards and detail | Same initial nightly rate/savings preview on mobile |
| Checkout | Existing date-specific comparison continues to accompany checkout; exact payment amount remains authoritative |

**Important:** Initial nightly savings are a modeled *one-night fee illustration*, **not** a verified external price. The conservative calculation assumes 7% Find A Place guest fees and a 15.5% host-side fee elsewhere, with equal host proceeds; it excludes cleaning, taxes, optional extras, and discounts. It rounds *down*. Actual platform pricing can differ. The UI clearly says **could save**, **about**, and **illustrative**, never a guarantee. When the guest chooses dates and gets an actual quote, the comparison is calculated using the date-specific pre-tax quote. A validated same-property external quote is shown as verified; otherwise the existing API uses its disclosed illustrative model, if enough actual checkout data is available.

## All previously requested guest features also included

- Homepage Featured Stays: only PUBLISHED launch-priority VERIFIED partner Cabin inventory. No non-cabin fallback.
- Buffalo National River: 12-mile target-search threshold, excludes Norfork/White River while retaining the two close stays named in the notes. General search unchanged.
- Separate Luxury Stays ($300+), Unique Stays (distinctive types such as cabooses), Budget Friendly (under $150) collection rules.
- Experiences directory, deduped from published property recommendations, and navigation tab.
- Guest web app touch/swipe property photo gallery.
- The comparison is guest-facing as **“Other booking platforms”**, not named competitors; uses real quote data and a transparent fallback estimate.

## QA status / limitations

- Targeted Node and Python placement, modeled-savings arithmetic, category, geo, experiences, photo gallery and guarded-source tests pass in this package.
- The shared live booking/quote/reservation/Stripe/ResNexus code is not changed by the price placement update.
- **Full project `npm run typecheck`, `npm run build`, Vercel deploy, and a browser-based comparison against real stay dates are not verified here.** Complete these after applying the ZIP.

## Smoke test after push

1. Go to homepage. When Featured Stay shows `$X / night`, the illustrative fee-based savings line should appear directly below.
2. Open `/stays`. Every eligible property card with valid positive starting rate should show the nightly savings teaser immediately after the nightly price.
3. Open a property page **without dates**. The booking sidebar should show the nightly rate and potential savings together.
4. Choose valid check-in/checkout and guests. As soon as the `Estimated trip total` appears, the comparison should appear **directly below it**, ahead of the line-item price breakdown. It may show `Comparing booking costs...` briefly. The nightly teaser should disappear in favor of the date-specific comparison when that quote is available.
5. Inspect a property **with** and **without** a connected external calendar. You should see a checked price only when validated; otherwise a labeled illustrative model (where enough quote data is available). Never label an estimate a verified quote.
6. Go to `/apps/guest` and check both result cards and stay detail prices. Confirm swiping through images still works.
7. Open `/checkout` with dates. Check the pre-tax comparison disclosure, the tax-inclusive final total, and the payment amount separately.
8. Check reservation flow, calendars and host dashboard after deploy; no system logic in those areas was edited.
