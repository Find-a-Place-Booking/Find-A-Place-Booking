Find A Place Booking — Date-aware marketplace search overlay

What it changes
---------------
1. /stays now passes the selected check-in/check-out/guest count into the public listing loader.
2. The server checks the existing canonical availability_blocks table before returning search inventory.
3. A stay is excluded when the requested range overlaps:
   - owner blocks
   - imported external/iCal blocks
   - confirmed Find A Place reservations
   - unexpired checkout holds
4. Expired INTERNAL_HOLD rows are ignored, matching the existing authoritative availability logic.
5. Minimum-stay rules and maximum-guest rules are enforced in search.
6. The old “Dates above don’t narrow results yet” / “Date matching coming soon” wording is removed.
7. Empty results explicitly tell the guest that no stays are available for those dates.

No database migration is required. This intentionally uses the calendar/availability schema that is already in the current project, so it stays separate from the tax work.

Apply
-----
Put apply-date-aware-search.mjs in the repository root and run:

  node apply-date-aware-search.mjs
  npm run typecheck
  npm run build

Then review:

  git diff -- lib/public/listings.ts app/stays/page.tsx components/StayResults.tsx

Suggested commit:

  git add lib/public/listings.ts app/stays/page.tsx components/StayResults.tsx
  git commit -m "implement date-aware marketplace availability search"

Important behavior
------------------
The public results page now filters against the same canonical availability block types used by property booking availability, so search results and the booking calendar stay aligned.
