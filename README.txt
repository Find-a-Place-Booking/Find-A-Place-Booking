FIND A PLACE BOOKING — ROUND 4: MAP BUBBLE EXPANSION
DIRECT OVERLAY — NO SCRIPTS OR INSTALLERS

Prepared from the current GitHub main versions of these two files:
- components/StayMap.tsx (original blob aa6e182d2de21b196513c3e753164794e9d9d5e0)
- components/ExpandableStayMap.tsx (original blob 8a43520648d047e0e83f95ab56667fd21ad0b334)

HOW TO APPLY
1. Back up your local project or make sure local changes are committed.
2. Open this ZIP and drag the "components" folder into the ROOT of your
   Find-A-Place-Booking repository (the folder with package.json).
3. Allow the TWO existing component files to be replaced.
4. Commit and push your normal GitHub changes to deploy through Vercel.
5. After deployment, test a cluster on desktop and on your phone:
   - Tap a cluster to open the usual small popup.
   - Tap "Expand this bubble" to open a full scrollable list inside the map.
   - Use Back to map to return to the same map, without resetting it.
   - Check a group of more than 40 stays, if available.

WHAT CHANGED
- The old expanded panel scraped only the stays displayed in the mini popup
  (24 on mobile, 40 on desktop) even when the cluster held more.
- Expand now fetches EVERY cluster member from the Mapbox source in batches
  of 200 and opens the existing in-map panel only when all are available.
- The mini popup retains its limited quick preview and responsive scrolling.
- Failed or interrupted expanded fetches leave the mini popup available for
  retry instead of showing a misleading partial list.
- Existing sort, cards, analytics, Back to map and keyboard Escape remain.
- No Supabase, Stripe, bookings, calendar holds, tax logic or route changes.
- This ZIP does NOT replace your already-applied calendar/email overlays.

VERIFICATION
- Original source blobs matched verified GitHub main versions.
- Syntax checked both patched TSX files with TypeScript.
- Internal patch invariants checked (expand callback, page iteration and
  unchanged control behavior).
- Full Next.js build and browser smoke test could not be performed here.
- This ZIP has not been deployed; deployment requires your normal push.
