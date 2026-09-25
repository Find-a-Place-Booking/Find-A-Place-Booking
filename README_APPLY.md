Find A Place Booking - Calendar Integrations UI patch

Based on current main commit:
9fcdbe5c80b32d8212a75dcb3b004829cff512f3

What this adds:
- A new Booking system integrations panel on the host Calendar page.
- ThinkReservations shown as the next direct PMS/API integration.
- Guesty shown with iCal available now and direct channel/API coming later.
- Hostify shown as a coming-soon direct API/webhook integration.
- Firefly Reservations shown as a coming-soon channel integration through Channex.
- Guesty added to the actual iCal provider dropdown and provider labels.
- Removes ResNexus from the host-facing iCal dropdown because we could not verify a usable iCal export path.
- Keeps the generic Other iCal / ICS option.
- Makes the admin test-lab heading provider-neutral.

Apply with:
  git apply calendar-integrations-ui.patch

Then run:
  npm run build

No Supabase migration is required for this UI/iCal provider update.
No production credentials or secrets are added.
The ThinkReservations card is informational only in this patch; the direct API connector comes next.
