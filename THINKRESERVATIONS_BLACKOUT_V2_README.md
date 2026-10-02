# Find A Place Booking — ThinkReservations blackout/reservation sync v2

Base file checked against GitHub `main`:

`lib/calendar/sync-thinkreservations.ts`
blob SHA: `859cc2cf43750175faa3343f86d173c569e12180`

This is an overlay only. It does not push to GitHub, deploy Vercel, or change Supabase.

## What the live production check found

The active Lone Cedar / Oak Ridge Think connection is failing its new sync before reconciliation with:

`ThinkReservations blackout data changed shape. Existing imported dates were preserved.`

That fail-closed behavior is why the site still shows the older inventory-derived snapshot instead of all of the unavailable dates. The old October snapshot still contains the familiar 14-night inventory pattern.

## What this replacement changes

Replace only:

`lib/calendar/sync-thinkreservations.ts`

The replacement keeps the existing booking/payment routing intact and changes the Think parsing/synchronization layer:

- Blackout responses are no longer assumed to be one flat array of flat records.
- Blackouts are recursively normalized from nested wrappers, nested physical-room objects, date-keyed maps, room-keyed maps, room ID arrays, room-type ID arrays, single-date rows, and common start/end field spellings.
- Known Think physical-room and room-type IDs from the existing resource cache are used to scope nested data safely.
- Cancelled/inactive blackout records are ignored instead of being treated as a schema failure.
- If Think returns a genuinely unrecognized non-empty blackout response, the sync still fails closed and preserves the last good calendar. The error now includes a safe structural shape summary so the next unexpected response can be diagnosed without logging the API key or guest PII.
- `/reservations` is queried as best-effort enrichment. When it works, room-booking stay ranges are merged into the canonical Think block snapshot.
- A reservation endpoint failure does not make inventory/blackout synchronization fail. Existing reservation-derived blocks are carried forward instead of being silently deleted.
- Inventory remains supplemental. It is no longer the only thing expected to describe a cabin's unavailable nights.
- The existing live `/availabilities` checkout guard is retained, including the second verification before Stripe payment intent creation elsewhere in the current overlay.
- No Think write access is introduced.

## Safety behavior

The important invariant stays in place:

**A partial, malformed, or failed upstream response is never allowed to become a successful empty calendar.**

If the required inventory/blackout snapshot cannot be normalized safely, Find A Place preserves the current imported blocks and marks the sync as an error.

The reservations endpoint is intentionally different: it is enrichment because this hotel has previously returned HTTP 500 from that operation. A reservation failure therefore preserves any existing reservation-derived blocks but does not erase a successfully verified inventory/blackout snapshot.

## Checks run before packaging

Strict TypeScript compilation passed for the replacement file.

Parser tests passed for:

- flat blackout records
- nested `room` objects
- parent date ranges with nested `rooms` arrays
- date-keyed → room-keyed maps
- room-keyed → date-keyed maps
- `roomIds` arrays
- single-day blackout records
- cancelled blackout records
- adjacent date-range merging
- mapped-room availability detection

A synthetic regression using the existing 14-night October inventory snapshot plus the eight previously missing nights also produced the exact 22-night known-unavailable set:

- Oct 1–4
- Oct 8–12
- Oct 14–18
- Oct 23–30

That is a parser/regression test, not a claim that production has already been corrected. This ZIP has not been deployed.

## Database / environment changes

None.

- No Supabase migration.
- No new secret.
- No new required environment variable.
- Existing `THINK_SYNC_MODE` behavior remains supported.

## After overlaying

Deploy normally, then run/schedule the Think calendar sync. The immediate thing to verify is that the connection no longer returns the old `blackout data changed shape` error and that Oak Ridge's October calendar matches the known truth set.

If Think returns yet another undocumented wrapper that still cannot be normalized safely, the new error contains a structural summary of that response. Existing blocks will remain untouched rather than being cleared.
