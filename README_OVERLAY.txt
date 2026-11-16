FIND A PLACE BOOKING — HOST EDITOR CORRECTION OVERLAY
Prepared for the live GitHub main at commit 9c21b28ee2c1297b7995d6f83d289db6cc81aab4.

DIRECT FILE OVERLAY. No Python installers or patch scripts.

INSTALL:
1. Extract this ZIP into the root of the existing Find A Place Booking project.
2. Allow replacement of matching source files. Keep all other project files.
3. Commit the changes and let Vercel build/deploy.
4. Have the host refresh the dashboard after deployment; leave previously open editing tabs closed.

WHAT IS FIXED:
- Host-wide form draft recovery now runs only during onboarding, not on operational
  pages like properties, nearby experiences, rates, calendar or integrations.
- Each property editor and nearby experience editor is keyed to the exact listing.
- Property editor saves include the server's current revision; an old tab cannot
  silently overwrite a newer save.
- Property editing is blocked if an incomplete data read might wipe saved
  amenities, policies or photos. Shows a reload notice instead.
- The live Supabase function now preserves minimum-stay and calendar preferences
  when publishing status is PUBLISHED or PAUSED, even if another field is saved.

DATABASE:
The two migration files under supabase/migrations match the migration versions
ALREADY APPLIED to production Supabase through the connector:
  20261116183232 — protect_live_host_listing_rate_calendar_settings_20261116
  20261116183444 — atomic_host_property_editor_revision_guard_20261116
They are included for repository history / clean future deployments. Do not run
SQL manually again. No Renea reservation, calendar, photo, pricing or property
rows were changed by these migrations.

QA COMPLETED:
- All ten published Fancy Hill listings audited (photos, prices, minimum stays,
  amenity/policy catalog lookups, each property's own nearby experiences).
- Published listings can still pass current readiness checks.
- Stale editor revision rejected by Supabase before any write.
- Current revision passed guard (followed by expected missing-name rejection;
  no actual property changes made in that negative-control test).
- Updated TypeScript/TSX files pass syntax parsing.
- Booking/calendar logic, Stripe, and connected PMS workers not modified.

NOT VERIFIED IN THIS SESSION:
- Full authenticated browser walkthrough on Renea's device.
- Production Vercel runtime logs (connector permission prevents access).
- Full Next.js typecheck/build against entire repository (source-only overlay).

NOTE: The older Phase 1 & 2 migration history mismatch identified earlier is
outside the scope of this correction and was not modified here.
