FIND A PLACE BOOKING — CALENDAR SAFETY REVIEW + STAY BROWSING ORDER
2026-10-24

APPLYING THE OVERLAY
Copy the app/ and lib/ directories from this ZIP over the matching directories
in your Find A Place Booking repository, commit and push. These are complete
files, NOT scripts and NOT patches.

CHANGE INCLUDED
- /stays results default to cabins, cottages, houses, tiny homes, glamping,
  and other indoor stays before campsite/RV listings.
- Includes campground listings labelled "Other" but named "Camping Site".
- Preserves the existing order within each of the two groups.
- Guests deliberately filtering RV stays still see RV stays only.
- Changing the results sort to price/rating continues to override this default.
- Homepage featured-spot rotation is deliberately not changed by this overlay.

CALENDAR / MANUAL BLOCKS (READ-ONLY AUDIT OF LIVE DATABASE)
- 48 active calendar feeds reporting HEALTHY, all with recent successful syncs.
- 31 active OWNER_BLOCK entries, 603 EXTERNAL_BLOCK entries, 7 active
  INTERNAL_RESERVATION entries, and zero active expired checkout holds.
- Confirmed reservation records each have exactly one active reservation block.
- Zero OWNER_BLOCK vs INTERNAL_RESERVATION overlaps.
- Zero mismatched internal-reservation ranges, missing reservations,
  or cross-unit calendar-source links.
- 7 overlapping active block pairs: 5 manual vs imported, 1 imported vs
  imported, and 1 historical imported vs confirmed (Oct 18–20 Lone Cedar).
  These stay blocked. Do not automatically delete source calendar blocks.
- Owner create/cancel RPCs require calendar-manager access. Creation locks
  the unit and refuses an overlapping live block. Cancellation is restricted
  to OWNER_BLOCK records for that same unit.
- iCal imports reconcile ONLY their own EXTERNAL_BLOCK records and do not
  erase owner blocks or internal guest reservations.
- Reservation holds refresh relevant feeds and use canonical server checks;
  expiring payment holds have a grace window to avoid racing Stripe.


ADDITIONAL OUTBOUND CALENDAR VERIFICATION
- The deployed calendar-sync route is configured for every 15 minutes in
  vercel.json. Actual recent successful imports confirm feed activity, although
  this review did not independently replay the scheduled job.
- There are 41 active outbound calendar export tokens, 35 source-specific.
  All 41 tokenized feeds returned valid event arrays when queried internally.
- Active export feeds include 12 owner-block event occurrences and 5 confirmed
  reservation-block occurrences (across feeds). This confirms owner blocks
  are represented in outgoing iCal, not merely shown in the host dashboard.
- Per-source calendar export deliberately excludes its own imported feed to
  prevent a feedback loop; no private calendar tokens were disclosed in the audit.

BOUNDARIES
No booking, Stripe, refund, tax, iCal/PMS sync, calendar connection,
host notification or database code changed. This was a read-only live-data
and static-code audit, not a real paid booking or live manual block creation.
It does NOT certify an end-to-end payment or PMS sync test. Inspect the
Lone Cedar past imported ThinkReservations range manually only if its
range is unexpected; do not clear it without the host verifying it.

AFTER DEPLOYMENT
1. Browse /stays: a cabin should appear above Camping Site 8 and RV Site 12.
2. /stays?filter=RV%20Site must show only RV stays.
3. Select dates on a stay; make sure booking pricing/availability is unchanged.
4. On a non-booked test future date, create then remove an owner block;
   verify guest availability is blocked then reopened (only after coordinating
   with host and checking all external calendar feeds).
5. Check a confirmed reservation is still blocked.

SOURCE BASE
app/stays/page.tsx from GitHub main at audit time (October 24, 2026).
No live deployment performed; GitHub write access for the Find A Place repo
is denied to this connection (403).
