# Find A Place Booking — Remaining Priorities Overlay

Targets reviewed: GitHub main `adb34887af2e6be2edbd960b0c49a5d86086493d` (November 5, 2026). The installation script also checks its exact anchors before touching existing source files.

## What's included

- **Buffalo National River:** New editorial destination on the homepage; searches use NPS access-point coordinates in three river districts instead of a single circle around Jasper. Respects the existing 15/25/40/60/100-mile controls. Existing Jasper search remains available, but the homepage swaps Jasper's separate card for a broader Buffalo River card, preserving the clean six-card grid.
- **Unique stays:** Adds a homepage collection and Find a Stay chip; matches explicit property types/tags such as Glamping, Tiny Home, Treehouse or Yurt, not arbitrary property names.
- **Group getaways:** Adds a homepage collection and Find a Stay chip for accommodation sleeping 8 or more. Excludes camping/RV/unknown-type listings, so a 25-person campsite is not marketed as a large house.
- **Property managers:** Desktop "For hosts" dropdown, one extra link in the mobile menu and footer, plus a new `/property-managers` informational page linked to existing authenticated host tools.
- **Booking QA:** `docs/BOOKING_AUDIT_2026-11-05.md` lists code checks, read-only production results and hands-on test steps. No payment or calendar code was changed.

## How to install (IMPORTANT)

1. Open the checked-out Find A Place Booking GitHub repository on your computer.
2. Extract this ZIP into that **repository root**, preserving `app/`, `components/`, `lib/`, `tests/` and `docs/`. If asked, overwrite matching **overlay installer** files. It does not contain complete copies of existing `Header.tsx`, `StayResults.tsx` or `app/page.tsx`.
3. **Double-click `APPLY_OVERLAY.bat` on Windows**, or use `bash APPLY_OVERLAY.sh` on macOS/Linux. This is REQUIRED: extracting files alone does not wire the new features into the existing pages. The installer is idempotent and preflights all source anchors before any writes. Use `python apply_overlay.py . --check` first if you want a dry run.
4. Run `npm run typecheck`, then `npm run build`. If a command fails, do not push; send the error output. The tests `python tests/test_overlay.py` and `node tests/test_discovery.cjs` are available when Python 3 and TypeScript are installed.
5. Commit the changed files and push `main`. Confirm Vercel deploys to READY.
6. Check `/stays?where=Buffalo%20National%20River&radius=40`, `/stays?filter=Unique%20stays`, `/stays?filter=Sleeps%208%2B`, `/property-managers`, and the desktop/mobile header.

This overlay includes **no Supabase migration or fee changes**; it can be installed separately after the 7%-fee/frontend polish overlay from the previous task.

## What wasn't verified

The script's exact anchors were checked against the current GitHub source, and isolated parsing, classification, regional-search and repeat-installation tests passed. We could not run a full application build against the entire checked-out GitHub repository, or perform authenticated payment, host login and production ResNexus tests from the connected tools. The connected GitHub integration is read-only for writes.

## Important: Fancy Hill ResNexus

The live audit found all 10 Fancy Hill ResNexus feeds reporting saved-login rejection as of Nov 5, 2026. That requires an updated login from a user authorized to manage that account at `/host/integrations/resnexus`. The current availability/payment system is intentionally conservative about unverified ResNexus calendars. Do not disable it to make a booking succeed. See the booking audit in `docs/`.

## Sources for regional search points

National Park Service, Buffalo National River, "Getting Around": https://www.nps.gov/buff/planyourvisit/getting-around.htm . The three points are publicly documented campground/access coordinates, not private property addresses.
