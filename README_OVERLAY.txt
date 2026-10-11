Find A Place Booking — host feedback cleanup + tracking repair
Built against current main after commit 9649e4e1 ("fixes").

WHAT THIS FIXES

1) ONBOARDING PHOTOS CAN NOW BE ORGANIZED
- Keeps the existing 25-photo upload limit.
- Adds Set as cover during onboarding.
- Adds left/right ordering controls that work on mobile and desktop.
- Reuses the existing reorder_property_images RPC already used by the normal Property editor.
- The first photo remains the primary listing/share image.
- Removing a photo normalizes the remaining order.

2) TWO-WAY iCAL IS SURFACED DURING ONBOARDING
- Adds a small authenticated endpoint that reads the current onboarding property's active iCal connections and existing source-specific calendar export tokens.
- The Calendar step now tells hosts to keep Find A Place open and open Airbnb/Vrbo/etc. in another browser tab when retrieving the inbound iCal URL.
- Once an iCal source connects, the host sees the matching Find A Place return feed during onboarding instead of having to discover it later in Host Calendar.
- Copy uses the full absolute .ics URL and includes a fallback for browsers where Clipboard API is unavailable.
- The helper refreshes while the Calendar step is open so a newly-created return feed appears without making the host leave setup.
- It does NOT create a second export system; it only exposes the source-specific tokens that create_ical_connection already creates.

3) INCOMPLETE ONBOARDING CANNOT GENERATE END-OF-ONBOARDING FEEDBACK
- Production migrations are ALREADY APPLIED:
  20261011040530 guard_incomplete_onboarding_feedback
  20261011040534 harden_onboarding_feedback_guard
- A feedback row linked to an onboarding draft still marked IN_PROGRESS is rejected.
- Existing feedback and completed READY_FOR_PROPERTY onboarding are unaffected.
- The trigger helper is not executable by anon/authenticated REST clients.

4) BOOKING FUNNEL TRACKING CLEANUP
- Stops page-exit telemetry from firing when the user is on unrelated pages.
- Beacon page-exit events preserve the actual page path instead of being stored as /api/booking/track.
- Keeps booking-attempt summary stages monotonic in application code as well as the existing production database guard.
- Does not alter booking, availability, hold, payment, Stripe, or reservation routing.

FILES
- components/OnboardingPhotoManager.tsx
- components/OnboardingPhotoManager.module.css
- components/HostHelpAssistant.tsx
- components/onboarding/OnboardingCalendarBridgeHelp.tsx
- components/onboarding/OnboardingCalendarBridgeHelp.module.css
- app/api/host/onboarding/calendar-exports/route.ts
- components/BookingJourneyTracker.tsx
- app/api/booking/track/route.ts
- lib/bookings/booking-tracking.ts
- supabase/migrations/20261011040530_guard_incomplete_onboarding_feedback.sql
- supabase/migrations/20261011040534_harden_onboarding_feedback_guard.sql

VALIDATION
- All changed TS/TSX files pass TypeScript parser/transpile validation.
- Production RLS was checked for organization_members, host_onboarding_drafts, properties, property_units, calendar_connections and calendar_export_tokens. Authenticated hosts already have the required scoped SELECT access.
- reorder_property_images(target_unit_id uuid, ordered_image_ids uuid[]) exists in production.
- create_ical_connection already creates a source-specific export token, so no new calendar-token migration is required.
- Supabase security advisor was rerun after the DDL. The new feedback guard does not add a new exposed SECURITY DEFINER warning; remaining advisor findings are pre-existing broader project findings.

NOT INCLUDED
- Gez/Mike onboarding-review recipients are not changed in this overlay because Mike's email address is still not present in the FAP database/project files. Do not guess it. Gez can be added with Mike once his real address is supplied.
- The share-link, property social-image, mobile map popup and improved tooltip styling from commit 9649e4e1 are already on main and are not duplicated here.
