# Find A Place Booking — Milestone 9B Calendar / Availability Foundation

Baseline: `563fc11` — `update A9.1 Stuff` on remote `main`.

Milestone 9B establishes canonical unit-level availability before reservations, taxes or payment processing are connected.

## What is real in 9B

- Canonical availability records are anchored to immutable `property_units.id` UUIDs.
- Owner/manual blocks use checkout-exclusive ranges: `[start_date, end_date)`.
- External calendar connections are unit-scoped and retain their own source identity. One active feed URL can belong to only one rentable unit, preventing the same channel calendar from being accidentally attached to two units.
- Universal iCal/ICS import parses blocking `VEVENT` records and normalizes them to canonical unavailable ranges.
- A sync can update or cancel only blocks belonging to that exact connection. It cannot delete blocks from another source or owner-created blocks.
- Multiple sources may overlap. Overlaps remain visible rather than one source silently replacing another.
- Calendar sync state tracks last attempt, last success and last error.
- Find A Place exposes tokenized iCal exports for each unit.
- Each connected source receives its own outbound token that excludes events imported from that same source, reducing calendar echo loops.
- A separate general export includes all active canonical blocks except temporary checkout holds.
- Exported events use stable UIDs derived from the internal availability-block UUID.
- The host Calendar workspace supports property/unit selection, owner blocks, iCal connections, manual sync, disconnect, export copy/rotation and month navigation.
- The calendar displays existing 9A nightly pricing, public special labels and minimum-stay rules without making pricing the owner of availability.
- Admin gets a read-only Calendar operations view with source ownership and sync health.
- `check_unit_availability(unit, check_in, check_out)` is the authoritative availability boundary for future guest search/checkout.

## Identity / ownership boundary

The chain remains:

`auth user -> profile -> organization membership -> organization -> property -> unit -> calendar connection -> availability block`

Foreign keys and unit-scoped RPC authorization enforce that chain. Calendar names, property names, email addresses and slugs are not used to decide which unit a block belongs to.

## iCal import boundary

The importer currently supports ordinary discrete blocking `VEVENT` records, including the common all-day format used by OTA reservation feeds. It reads stable UID, DTSTART, DTEND, recurrence ID, status and transparency.

Recurring `RRULE` masters are deliberately skipped instead of guessing timezone/recurrence expansion. Direct PMS adapters or a later richer calendar adapter can normalize those into the same canonical availability model.

Host-triggered iCal fetches require a public HTTPS destination (`webcal://` is normalized to HTTPS), reject obvious private/local network destinations, limit redirects, enforce a timeout and cap feed size. This is application-level SSRF hardening for the foundation; staging/production egress controls can strengthen it further.

## What remains deliberately disconnected

Milestone 9B does **not** create live reservations or take money.

Deferred:

- public date-filtered search using availability;
- temporary hold creation during checkout (the canonical type is reserved, but no checkout flow creates it yet);
- reservation creation / cancellation workflows;
- automatic scheduled calendar polling/cron;
- direct Lodgify, OwnerRez, ResNexus or other PMS APIs/webhooks;
- guest identity inside calendar exports;
- tax calculation/remittance;
- Stripe Connect;
- Square;
- processor-fee policy/credits;
- payouts and settlement.

Manual host sync is intentional for the local acceptance milestone. Automatic sync should be wired only when the app has a server/staging execution environment and can run a privileged worker safely.

## Supabase

Apply only:

`supabase/migrations/20260914001400_calendar_availability_ical.sql`

This migration assumes 9A.1 migration `20260914001300_pricing_promotion_hardening.sql` is already applied.

Expected health schema after 014:

`calendar-availability-ical-v1`

## Next boundary after 9B acceptance

The next major milestone can build the reservation/payment path on top of this boundary:

`requested dates -> authoritative availability -> 9A price quote -> temporary hold -> final availability recheck -> final quote/promo reservation -> tax -> reservation snapshot -> Stripe/Square adapter`

Payment processors remain consumers of finalized Find A Place reservation/pricing data; they do not own availability or pricing rules.
