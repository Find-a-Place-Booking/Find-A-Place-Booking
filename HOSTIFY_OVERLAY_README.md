# Find A Place Booking — Hostify Availability Overlay

Apply this AFTER the ThinkReservations overlay.

## What this enables now

Hostify is added as a real iCal/ICS availability provider.

A Hostify host can:

1. Open the listing in Hostify.
2. Open Calendar → iCal.
   - Some Calendar Service v2 accounts may show a separate iCal Import/Export page.
3. Copy the listing's private Hostify iCal export URL.
4. In Find A Place Calendar, choose Hostify and paste that URL.
5. Find A Place performs the existing read-only compatibility test before saving.
6. Hostify booked/blocked dates enter the canonical availability calendar used by checkout.
7. The existing 15-minute calendar sync refreshes the feed.
8. Checkout refreshes connected iCal feeds again before creating the guest hold.
9. The source-specific Find A Place export URL can be pasted back into Hostify for two-way availability blocking while reducing calendar echo loops.

## Availability only

This does NOT sync prices, rates, fees, taxes, discounts, policies, guest details or payments.

## Why the direct Hostify API is not hard-coded yet

Hostify publicly confirms that it has an Open API and real-time webhooks.
Its detailed endpoint documentation currently redirects to the logged-in Hostify portal.

Publicly available integration documentation confirms Hostify's RMS API host and
the `/reservations` endpoint, but does not expose enough of the read-only listing,
calendar/availability, pagination and authentication contract to safely ship a
production direct adapter without guessing.

So this overlay makes Hostify usable immediately through iCal. Once we have one
Hostify API key/account and can open their logged-in docs, the direct API/webhook
adapter can be finished on top of the same PMS infrastructure already built for
ThinkReservations.

## Install

Extract this ZIP into the repository root and allow overwrite.

No new Supabase migration is required for this Hostify iCal addition.

Then run:

    npm run typecheck
    npm run build
