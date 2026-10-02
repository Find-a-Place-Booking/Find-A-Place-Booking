# ThinkReservations current-API calendar fix

Built for Find A Place Booking against the ThinkReservations public API documented October 1, 2026.

## What this changes

The previous sync treated `/inventory` as the cabin calendar. That is incomplete for the Dawn case: it found 14 of the 22 unavailable October nights and missed Oct 2–3, 15–17, and 27–29.

This overlay changes ThinkReservations handling to use the current read-only API sources together:

- `GET /v1/hotels/{hotelId}/inventory` for sold / unavailable inventory.
- `GET /v1/hotels/{hotelId}/blackouts` for blocked dates that are not represented by inventory alone.
- `GET /v1/hotels/{hotelId}/availabilities` as a live pre-booking availability gate.

It does not write reservations, rates, taxes, fees, or availability back to ThinkReservations.

## Safety behavior

- Inventory and blackouts must both succeed before a background snapshot is reconciled. A partial result never clears the other source.
- Any API/shape/auth/network failure preserves the last known imported Think blocks.
- A mapped room type must still resolve to exactly one physical Think room before room-type inventory can be applied to a Find A Place cabin.
- Blackouts map by physical room ID first, then by room type only when that type has one physical room. A dated blackout with no room identifier is treated conservatively as hotel-wide.
- Empty upstream results cannot immediately erase existing blocks; the existing two-pass empty confirmation remains in place.
- Booking hold refreshes only the requested Think date window instead of forcing a full multi-year Think sync.
- The requested stay is checked live before the database hold and again immediately before Stripe PaymentIntent creation.
- If Think's `/availabilities` endpoint returns a request-shape 400/422, the live gate falls back to a fresh exact-window read of BOTH `/inventory` and `/blackouts`. It does not fall back on authentication, permission, timeout, network, or 5xx failures.
- No Think reservation is created by this overlay.

## Rollout / rollback switch

Optional Vercel environment variable:

`THINK_SYNC_MODE=current_api`

Modes:

- `current_api` — default; apply inventory + blackout reconciliation.
- `current_api_shadow` — fetch and validate both sources and log the proposed counts, but do not mutate imported Think blocks.
- `freeze_last_good` — stop Think background reconciliation and retain the last imported blocks. The live booking safety gate still runs.

If `THINK_SYNC_MODE` is absent, `current_api` is used.

No new Supabase migration is required. This uses the existing ThinkReservations mapping tables and `service_apply_pms_sync` RPC.

## Files in the overlay

- `lib/calendar/sync-thinkreservations.ts`
- `lib/calendar/sync-ical.ts`
- `app/api/booking/hold/route.ts`
- `app/api/booking/payment-intent/route.ts`

## Verification performed

Strict TypeScript check passed for all four changed files.

Synthetic acceptance case for Dawn, October 2026:

- Expected unavailable: Oct 1–4, 8–12, 14–18, 23–30 = 22 nights.
- Explicitly verifies the eight dates inventory alone missed: Oct 2–3, 15–17, 27–29.
- Expected open: Oct 5–7, Oct 13, Oct 19–22.
- Result: 22/22 unavailable nights matched and all expected open nights remained open.

Additional checks passed for:

- single-day blackout normalization;
- physical-room availability matching;
- unique room-type fallback matching;
- rejecting a different room / room type;
- exclusive checkout-date boundaries;
- date-range merging.

## After overlaying

Deploy normally. No database SQL needs to be run for this fix.

For the safest production rollout, `current_api_shadow` can be used for one sync cycle to inspect the proposed inventory/blackout counts, then changed to `current_api`. If you want the fix active immediately, leave `THINK_SYNC_MODE` unset because `current_api` is the default.
