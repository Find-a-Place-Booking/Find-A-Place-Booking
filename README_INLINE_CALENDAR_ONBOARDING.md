# Find A Place Booking — inline calendar onboarding

Drop-in overlay for the current `Find-a-Place-Booking/Find-A-Place-Booking` main branch.

## What changes

- Keeps the host on the **Calendar** onboarding step instead of sending them to `/host/calendar` and making them come back.
- Uses the real onboarding property/unit that already exists for photo uploads.
- iCal setup happens inline: test, connect, first sync, current status, manual sync, remove, and **+ Add another calendar**.
- Multiple iCal sources are explicit. Airbnb/Vrbo/etc. are shown as separate source cards; any active imported block still flows into the same canonical availability table.
- ThinkReservations reuses an existing organization-level connection. After the first property, another property only needs the correct ThinkReservations room selected and synced.
- ResNexus login, verification, resource discovery and property mapping can stay in onboarding. Existing mappings for other cabins are preserved when the current property is mapped.
- Review now shows availability as: required, Find A Place only, connected/pending, or connected & synced.
- Reloading onboarding reads the real property calendar state so the host does not lose the visible integration status.

## What does NOT change

- Guest availability resolution
- reservation holds
- checkout or Stripe payment flow
- `availability_blocks` semantics
- existing iCal parser/sync logic
- ThinkReservations sync logic
- ResNexus browser-worker sync logic
- host Calendar advanced workspace
- cron/background sync behavior

The onboarding API derives the property/unit server-side with `prepare_onboarding_property`; it does not trust a browser-supplied unit ID. Private iCal URLs and PMS credentials are never returned in the onboarding state payload.

## Files

- `components/HostOnboardingWizard.tsx`
- `components/onboarding/OnboardingCalendarSetup.tsx`
- `components/onboarding/OnboardingCalendarSetup.module.css`
- `app/api/host/onboarding/calendar/route.ts`
- `lib/host/onboarding.ts`

## Dependency

This expects the current calendar-readiness migrations already present on main:

- `20261003220754_calendar_preference_inference.sql`
- `20261003220905_calendar_readiness_and_multical_clarity.sql`

No new database migration is required for this overlay.

## Legacy onboarding state reconciliation

Onboarding now compares the saved onboarding preference with the real prepared property's active connections. It only repairs clear one-sided stale states (for example, a saved PMS choice with no PMS mapping but an active iCal connection). It does not overwrite an explicit Find A Place-only choice or invent a source when the live connection state is ambiguous.
