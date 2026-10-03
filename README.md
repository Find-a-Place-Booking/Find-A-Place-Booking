# Find A Place Booking — calendar readiness fix

These two migrations match the production database changes applied on 2026-10-03.

What they do:
- infer ICAL/PMS availability preference when a host actually connects that source
- backfill existing unambiguous UNSET listings
- make calendar setup part of publication readiness instead of failing only after Publish is clicked
- make duplicate generic iCal labels provider-specific (Airbnb calendar, Vrbo calendar, etc.)
- auto-name future generic iCal labels so multiple feeds are easier to tell apart

Production status when generated:
- Livingston Junction Caboose 101: DRAFT, ICAL selected automatically, Airbnb + Vrbo both HEALTHY
- Livingston Junction Caboose 103: DRAFT, ICAL selected automatically, Airbnb + Vrbo both HEALTHY
- Neither draft was auto-published; the host should intentionally click Publish once after refreshing.

The migrations are included here so the repository can be kept aligned with production.
