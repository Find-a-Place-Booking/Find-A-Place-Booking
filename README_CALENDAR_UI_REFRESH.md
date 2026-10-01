# Find A Place Booking — clickable host calendar UI refresh

This is a **UI-only** calendar cleanup.

It does not change:
- calendar routes;
- availability RPCs;
- iCal / PMS synchronization;
- ResNexus or ThinkReservations routing;
- reservation creation/payment logic;
- block creation/removal logic;
- database schema.

## What changes

The manual block form is no longer buried below the calendar.

The calendar becomes the working surface:

- click a date to inspect it and select one night;
- click a second date to select a range;
- selected start/end dates fill the existing manual block form;
- dates can still be typed directly;
- quick labels: Owner stay, Maintenance, Direct booking, Other;
- manual blocks can be removed from the selected-day inspector;
- an expandable manual-block list remains under the calendar.

## Source legend at the top

Distinct labels/colors are shown for active sources:

- Find A Place reservations
- checkout holds
- manual blocks
- Airbnb
- Vrbo
- ResNexus
- ThinkReservations
- Guesty
- Hostify
- Booking.com
- OwnerRez
- Lodgify
- Google Calendar
- other iCal

The list comes from the actual active connections for that unit.

## Direct / offline bookings

The Direct booking preset uses the existing manual availability-block action so
the selected dates become unavailable on the canonical calendar immediately.

It clearly states that this is an availability block only; it does **not**
create a Find A Place guest reservation/payment record. Creating that would
require backend reservation logic, which this UI-only change intentionally does
not touch.

The normal Find A Place reservation manager is linked from the top of the
calendar.

## Apply

Extract this ZIP into the repository root and run:

`APPLY_CALENDAR_UI_REFRESH.cmd`

Then:

- `npm run typecheck`
- `npm run build`

No Supabase migration is required.
