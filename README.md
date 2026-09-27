# Find A Place Booking — Hospitable iCal Connection Fix

This overlay replaces only:

- `app/host/calendar/actions.ts`
- `lib/calendar/diagnostics.ts`

## Problem found

The pre-connect iCal compatibility test called `parseIcalAvailability()` without
the property's timezone.

That is stricter than the real sync path, which already loads the property's
timezone before parsing. Reservation feeds that use timed DTSTART/DTEND values
can therefore fail the pre-connect test even though the real sync knows how to
normalize them safely.

Hospitable reservation iCal feeds include reservation dates/times, so this
mismatch can prevent the connection from ever being created.

The connect action also performed `redirect()` inside the diagnostic `try`
block. Next.js redirects throw internally, so an incompatible-feed redirect
could be caught as though it were a fetch/parser error. This overlay moves the
compatibility redirect outside that `try` block.

## Fix

- Loads the selected unit's property's `time_zone`.
- Passes that exact timezone to `inspectIcalFeed()` during:
  - first-time connect/test
  - later "Test connection" checks
- Keeps the actual sync path unchanged.
- Keeps SSRF checks, HTTPS-only checks, recurrence safety, feed size limits,
  source-scoped availability blocks, and empty-feed protection unchanged.
- Does not change bookings, Stripe, rates, taxes, payouts, or calendar exports.

No Supabase migration is required.
