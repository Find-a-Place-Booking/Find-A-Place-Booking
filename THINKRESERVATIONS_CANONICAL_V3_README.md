# ThinkReservations canonical availability v3

Built against main commit `1e436233ebccbe3042387ea09152fd7e81bcc0a0` on 2026-10-02.

## Why v2 looked weird

The v2 parser began recognizing ThinkReservations blackout records correctly,
but Find A Place stored inventory ranges and individual blackout fragments as
separate EXTERNAL_BLOCK rows. That produced duplicate/striped blocks in the host
calendar and still left holes where Think exposed only boundary fragments.

The live Lone Cedar / Oak Ridge data showed repeated Think blackout ids on
separated dates. For example, the same id appeared at both ends of a longer
stay. The background sync also started at the current date, which prevented it
from seeing the beginning of a stay already in progress.

## What v3 changes

- Background Think sync now reads a 45-day lookback as well as the existing
  future lookahead. `PMS_SYNC_LOOKBACK_DAYS` can optionally override the 45-day
  default from 0 through 120 days.
- Repeated blackout fragments with the same Think id and room scope are
  consolidated into a single span when their fragments are close enough to be
  parts of the same provider event.
- Inventory, blackout, reservation, and verified live-availability evidence are
  combined in memory first.
- Short ambiguous gaps between provider-derived unavailable ranges are checked
  against ThinkReservations `/availabilities` before they are filled.
- Find A Place writes one canonical set of unavailable ranges to
  `availability_blocks` instead of separate inventory + blackout rows.
- Existing `service_apply_pms_sync` reconciliation automatically cancels the
  obsolete fragment keys inside the widened sync window after the first good
  sync.
- The existing live availability checks before booking hold and before Stripe
  payment remain unchanged.
- The ThinkReservations `/reservations` endpoint remains best-effort only because
  this hotel currently returns HTTP 500 from that endpoint. Sync does not depend
  on it.

## October regression case

Expected Oak Ridge unavailable nights from the ThinkReservations calendar:

- October 1–4
- October 8–12
- October 14–18
- October 23–30

That is 22 unavailable nights. Expected open nights checked explicitly:
October 5–7, October 13, and October 19–22.

The canonicalization regression test passed 22/22 and kept all expected open
nights open.

## Files

- `lib/calendar/sync-thinkreservations.ts` — actual fix
- `README.md` — restores the project README accidentally overwritten by the
  prior cron-only overlay
- `THINKRESERVATIONS_CANONICAL_V3_README.md` — this file
- `THINKRESERVATIONS_CANONICAL_V3_MANIFEST.json`

## Database / configuration

No Supabase migration is required.
No new required environment variable is required.
No GitHub or Supabase changes are performed by this overlay.
