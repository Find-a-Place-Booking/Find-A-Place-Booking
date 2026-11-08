# Find A Place — Targeted Search Buttons & Property Manager Overlay

**This replaces the previous `Find_A_Place_Discovery_Property_Managers_Booking_Audit_Overlay.zip`. Use this corrected ZIP instead of applying both.**

The homepage **Browse by stay type** section and the **Find a Stay** filter-chip row now include these three options in the *same design as the existing search options*:

- **Buffalo National River** — opens `/stays?filter=Buffalo%20National%20River`. Matches existing stays within the selected radius of multiple Buffalo National River access areas, not just Jasper. Also supports typing Buffalo National River in location search.
- **Unique stays** — opens `/stays?filter=Unique%20stays`, showing explicitly tagged types (glamping, tiny homes, etc.).
- **Group getaways** — opens `/stays?filter=Sleeps%208%2B`, showing cabins/homes accommodating 8+, not campground capacity numbers.

These **are NOT separate homepage feature sections, promotional cards, or an extra destination tile**. The original destination grid, including Jasper, is preserved. These three use the exact existing `stay-type-card` and filter-chip components.

Also retains the other pending features from the previous overlay: small **For hosts** dropdown, mobile/footer links to `/property-managers`, and the booking audit report. Existing checkout, calendar sync, taxes, prices, Stripe and booking hold code remain unchanged.

## Installation

1. Extract this ZIP into the **root of your Find A Place Booking repository**. Keep the folder structure.
2. Double-click **`APPLY_OVERLAY.bat`** on Windows (or `bash APPLY_OVERLAY.sh` on macOS/Linux). **Extraction alone does not connect these new buttons to the existing site.** The script checks all required source anchors before changing any file, and supports a repository with or without the previous overlay already applied.
3. Run `npm run typecheck` and `npm run build`. Do not push if either fails. Run `node tests/test_discovery.cjs` and `python tests/test_overlay.py` to run the included targeted tests.
4. Commit the changed files and push to `main`, then confirm the Vercel deployment reports READY.

## Checks after deploying

- Homepage: **Browse by stay type** contains all three buttons in the same visual style as the other seven. The existing destination grid still includes Jasper.
- `/stays?filter=Buffalo%20National%20River` — chip is selected and only matching Buffalo corridor listings appear. Test a 15-, 40- and 100-mile search radius.
- `/stays?filter=Unique%20stays` and `/stays?filter=Sleeps%208%2B` — selected chips produce matching types. Camping sites with large occupancy are excluded from Group getaways.
- Selecting an additional filter works normally; clearing filters returns the full matching results. Check desktop and mobile layouts.
- `/property-managers` and the existing host menu still work.

No live financial, booking, or calendar changes are in this overlay.

## Scope and testing

The anchor patch was validated against the repository source at GitHub main `adb34887af2e6be2edbd960b0c49a5d86086493d`, checked for idempotence, and isolated source parsing and discovery tests were run. A complete application build and authenticated booking test require the local checkout/deployment. The GitHub connection available to ChatGPT cannot push changes to your repository.

**Operational reminder:** As of the latest read-only audit, Fancy Hill ResNexus connections still needed credential reconnection. This overlay deliberately does not bypass that availability protection.
