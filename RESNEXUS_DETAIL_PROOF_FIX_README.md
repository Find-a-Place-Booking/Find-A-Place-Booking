# ResNexus detail-proof availability fix

This overlay changes only the persistent ResNexus Railway worker.

Files:
- `resnexus-worker/src/index.mjs`
- `resnexus-worker/src/snapshot-verifier.mjs` (new)

## Why this is needed

The current ResNexus list/detail bridge can attach a correct room label to dates
that were guessed from a reservation-list row containing several unrelated date
fields. It can also see every room name in a detail-page dropdown and mistake a
room merely present in that dropdown for the reservation's selected room.

Production evidence before this patch included a Lil' Rustic reservation block
spanning 2026-08-21 through 2027-01-03, plus overlapping Lil' Rustic blocks.
Both Lil' Rustic and Whitetail were also stuck in ERROR because the database
correctly rejects `ambiguous_reservation_safety_block` fan-out rows.

## What this patch does

After the existing extractor builds its account snapshot, but before anything is
sent to Supabase, the worker re-opens reservation detail records and proves:

1. the selected ResNexus room/site, preferring the actually selected option or
   room/unit/site form field instead of matching against a dropdown containing
   the whole account inventory;
2. the stay range from explicit Check In/Arrival + Check Out/Departure fields,
   Check In/Arrival + number of nights, or one unique rendered date range.

When the detail page proves different dates or a different room, the block is
corrected before sync. Ambiguous fan-out rows collapse to one exact resolved
resource. Cancelled/void/deleted records are omitted.

If the worker still cannot prove the exact room and dates, it fails closed and
preserves existing Find A Place availability rather than guessing.

The verifier also rejects overlapping different reservations for the same exact
physical resource after verification, because one cabin/site cannot be occupied
by two different reservations on the same night.

## Database / environment changes

None. No Supabase migration and no new environment variable are required.
The existing database guard against `ambiguous_reservation_safety_block` remains
in place.

## Deployment

Overlay the two source files and deploy the ResNexus Railway worker normally.
The worker health payload changes its mode to:

`resnexus-account-mapping-v3-detail-proof`

On the first successful account sync, the normal ResNexus reconciliation RPC
will update corrected reservation blocks and cancel stale blocks that are no
longer present in the verified snapshot.
