Find A Place Booking — Milestone 9B overlay
Baseline: 563fc11 (update A9.1 Stuff)

Extract this ZIP into the existing repository root.
Then follow docs/APPLY_MILESTONE_9B.md.

Database: run only migration 20260914001400_calendar_availability_ical.sql on top of the already-applied 9A.1 migration 013.
Expected health schema: calendar-availability-ical-v1

This milestone adds canonical availability, owner blocks, iCal import/export, sync health, host calendar operations and read-only Admin calendar health. It does not add Stripe, Square, taxes, live reservations or live money.
