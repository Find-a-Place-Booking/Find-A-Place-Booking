# Find A Place Booking — Calendar Integrations Overlay

Built against current `main` commit:

`9fcdbe5c80b32d8212a75dcb3b004829cff512f3`

## Install

Extract this ZIP directly into the repository root and allow it to overwrite files.

The paths in the ZIP already match the project:

- `app/host/calendar/page.tsx`
- `lib/host/calendar.ts`
- `lib/calendar/diagnostics.ts`
- `components/CalendarIntegrationPanel.tsx`
- `components/CalendarIntegrationPanel.module.css`

Then run:

```powershell
npm run build
```

## What this adds

- New booking-system integrations section on the host Calendar page.
- ThinkReservations shown as the next direct PMS/API integration.
- Guesty shown as iCal available now with a richer channel/API integration coming later.
- Hostify shown as coming soon.
- Firefly Reservations / Channex channel connection shown as coming soon.
- Guesty added to the iCal provider selector and calendar diagnostic labels.
- ResNexus removed from the host-facing iCal selector because a usable iCal export could not be verified.
- Existing stored ResNexus connections still retain their display label in code.

No database migration is included or required for this UI update.
No credentials or secrets are included.
