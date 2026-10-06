Find A Place Booking — Hospitable outbound iCal compatibility overlay

DROP/UNZIP OVER THE PROJECT ROOT.

Files:
- lib/calendar/ics-export.ts
- supabase/migrations/20261006234232_hospitable_ical_export_compatibility.sql
- tests/calendar-ical.mjs

IMPORTANT:
The Supabase migration has ALREADY been applied to the current production
Supabase project and is recorded in migration history as:
  20261006234232 hospitable_ical_export_compatibility

Do not manually apply a duplicate migration to that same database.
The migration file is included so the repository history matches production.

WHAT CHANGED:
- Export URL/token stays unchanged.
- Stable VEVENT UID stays unchanged.
- Dates stay all-day [start, checkout) ranges.
- Owner/manual blocks are labeled as booking-style events:
    Find A Place Owner Stay
    Find A Place Direct Booking
    Find A Place Blocked Stay
- Real Find A Place reservations export as:
    Find A Place Reservation
- Added DESCRIPTION, CREATED, LAST-MODIFIED, SEQUENCE, CLASS:PRIVATE,
  STATUS:CONFIRMED, TRANSP:OPAQUE and X-FAP-EVENT-TYPE.
- Source-specific feeds still exclude events originally imported from that
  same source, preventing Hospitable -> FAP -> Hospitable echo loops.
- Checkout holds are still intentionally NOT exported.

ROBERT / HOSPITABLE:
He does NOT need to remove or re-add the existing Find A Place feed in
Hospitable. Once this code is deployed, Hospitable's existing subscription
will receive the new format on its next poll.

TEST:
After deploy, create one fresh manual/owner block on Rhonda's Romantic Retreat,
leave it active for at least one full Hospitable polling interval, and confirm
it appears in Hospitable. Do not remove the block during the test.
