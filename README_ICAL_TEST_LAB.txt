Find A Place Booking — iCal Test Lab Overlay

WHAT THIS ADDS
- Admin-only /admin/calendars/test-lab
- Public tokenized synthetic .ics feed endpoints under /test-ical/<token>.ics
- Provider-like feed styles for Airbnb, Vrbo, Booking.com, ResNexus,
  OwnerRez, Lodgify, Google Calendar and generic iCal
- Editable synthetic reservation dates
- Stable event UID while dates change, so the importer should MOVE the same
  external availability block instead of creating a duplicate
- Confirmed or CANCELLED test events
- All-day or property-local timed events
- Feed failure modes: NORMAL, EMPTY, INVALID, RECURRING_UNSAFE
- Admin Calendars page link to the Test Lab

DATABASE
The migration in this overlay has already been applied to the current Supabase
project as migration:
  20260923084249 ical_test_lab

The migration is included so repository migration history stays aligned.
It creates only two isolated test tables:
  public.ical_test_feeds
  public.ical_test_events

Both tables have RLS enabled, no anon/authenticated direct table access, and do
not directly touch reservations, payments, Stripe, real availability blocks,
hosts, properties or accounts.

HOW TO TEST
1. Deploy the overlay.
2. Go to Admin -> Calendars -> Open iCal Test Lab.
3. Create an Airbnb/Vrbo/ResNexus simulator.
4. Copy its generated .ics URL.
5. Go to the HOST Calendar for a TEST property/unit.
6. Add the URL as the matching provider and click Test, connect & sync.
7. Verify the synthetic reservation becomes an External calendar block.
8. Back in the Test Lab, edit the same event's start/end date.
9. Return to Host Calendar and click Sync now.
10. Verify the existing imported block moves to the new dates.
11. Set the event to CANCELLED or delete it, sync again, and verify the
    imported block releases.
12. Optional safety tests:
    - EMPTY: first unexpected empty sync should preserve existing imported
      dates; the application's second-empty confirmation protection applies.
    - INVALID: sync should fail without changing existing availability.
    - RECURRING_UNSAFE: sync should reject the unsafe recurring event rather
      than guessing at dates.

IMPORTANT
Use a dedicated test property/unit or obviously unused future dates.
Synthetic events become real EXTERNAL_BLOCK rows on whichever unit you connect
the test feed to. That is intentional because this tool exercises the real
calendar import/reconciliation path.

This simulator is provider-like, not a claim that every current feed emitted
by Airbnb/Vrbo/ResNexus uses byte-for-byte identical ICS formatting.
