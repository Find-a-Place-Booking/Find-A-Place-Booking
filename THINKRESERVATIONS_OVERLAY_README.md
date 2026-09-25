# Find A Place Booking — ThinkReservations Calendar Integration Overlay

This overlay includes the earlier Calendar Integrations UI plus the first real
ThinkReservations connector.

## Scope

This integration is intentionally **availability only**.

It reads:
- hotel identity
- rooms / room types
- existing reservations
- ThinkReservations blackout blocks

It does **not** read or sync:
- nightly rates
- fees
- taxes
- discounts
- guest/customer contact data
- payment information
- Find A Place pricing
- Find A Place taxes

It does **not** create or modify ThinkReservations reservations.

## ThinkReservations Restricted API Key scopes

Create a hotel-specific Restricted API Key with only:

- `read:hotel`
- `read:room`
- `read:availability`
- `read:reservation`

Do **not** grant `read:rate`, `write:rate`, `read:customer`, or
`write:reservation` for this calendar-only connector.

## Install

Extract this ZIP over the repository root and allow overwrite.

Then:

1. Add the new server secret locally and in Vercel Production:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

   Save the output as:

   `PMS_CREDENTIAL_ENCRYPTION_KEY`

2. Apply the new Supabase migration:

   `supabase/migrations/20260924233000_thinkreservations_calendar_sync.sql`

3. Run:

   ```powershell
   npm run typecheck
   npm run build
   ```

4. Deploy.

## Host flow

Calendar → Booking system integrations → ThinkReservations:

1. Enter Hotel ID and Restricted API Key.
2. Find A Place verifies the hotel and loads rooms.
3. Map the current Find A Place unit to the corresponding ThinkReservations room.
4. The first booked/blocked-date sync runs immediately.
5. The existing 15-minute calendar cron also syncs ThinkReservations mappings.
6. Guest checkout refreshes the PMS mapping again before the canonical hold is created and fails closed if the provider cannot be verified.

## Credential security

The Restricted API Key:
- is accepted only by a server action;
- is encrypted with AES-256-GCM before storage;
- is stored in `pms_integrations`, which has no anon/authenticated table access;
- is decrypted only in server-only synchronization code;
- is never returned to the browser or Admin Calendar view;
- is never written to logs or audit metadata.

## Important first-live-key validation

The code uses the documented ThinkReservations endpoints:
- `/v1/hotels/{hotelId}`
- `/v1/hotels/{hotelId}/rooms`
- `/v1/hotels/{hotelId}/room_types`
- `/v1/hotels/{hotelId}/reservations`
- `/v1/hotels/{hotelId}/blackouts`

The first real Restricted API Key is still needed to validate the exact live
reservation/blackout payload produced by an actual host account. The parser is defensive and fails closed: it preserves existing blocks rather than clearing availability if ThinkReservations returns an unrecognized or unexpectedly paginated response.

No production database or GitHub changes were made by this ZIP.
