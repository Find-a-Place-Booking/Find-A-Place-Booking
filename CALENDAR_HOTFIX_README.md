# Calendar integration hotfix

This hotfix was created after re-auditing the canonical availability, iCal
import/export and booking-confirmation logic.

## What was already correct

- One canonical `availability_blocks` table is used by owner blocks, external
  calendars, checkout holds and confirmed Find A Place reservations.
- Availability uses checkout-exclusive ranges `[check_in, check_out)`.
- Guest checkout checks that canonical availability table while holding a
  per-unit advisory lock.
- Successful payment converts the SAME `INTERNAL_HOLD` block into
  `INTERNAL_RESERVATION`.
- Confirmed reservations are included in Find A Place outbound ICS feeds.
- Unpaid checkout holds are NOT exported to external channels.
- Source-specific exports exclude blocks imported from that same source, which
  reduces iCal echo loops.
- Existing inbound feed fetches have HTTPS-only, private-network, redirect,
  timeout and size protections.
- Unsafe/recurring feed events stop a sync rather than guessing and deleting
  existing availability.

## Gaps fixed here

### 1. Manual owner block race
Owner blocks previously checked for another owner block before the insert-level
availability lock was taken. A host block and guest checkout could therefore
race. Migration 025 takes the canonical unit advisory lock before the conflict
check and refuses to create a manual owner block over any currently active
unavailable range.

### 2. Automatic inbound iCal refresh
The existing host UI only synchronized inbound channel calendars on Connect &
sync or when the host pressed Sync now. That is not enough for a live OTA
integration because an Airbnb/Vrbo booking could arrive after the last manual
sync.

This hotfix adds:
- `service_apply_ical_sync`
- `service_mark_calendar_sync_error`
- `GET /api/cron/calendar-sync`

The route uses the SAME parser/fetch protections and the same canonical
availability blocks. It does not touch Stripe or booking/payment code.

## Apply

1. Extract over the repository root.
2. Run:

`supabase/migrations/20260917002500_calendar_background_sync_hotfix.sql`

3. Set production environment variables:

```env
CRON_SECRET=<a long random secret>
CALENDAR_SYNC_INTERVAL_MINUTES=15
```

`CALENDAR_SYNC_INTERVAL_MINUTES` controls whether a connection is due when the
job runs. Default is 15 minutes.

4. Clear Next cache and verify:

```powershell
Remove-Item -Recurse -Force .next
npm run typecheck
npm run build
```

## Schedule

Configure your deployment scheduler to call:

`GET /api/cron/calendar-sync`

with:

`Authorization: Bearer <CRON_SECRET>`

Run the scheduler at least as often as `CALENDAR_SYNC_INTERVAL_MINUTES`.

For example, a 15-minute scheduler would call it at `*/15 * * * *`.

Do not paste a real `CRON_SECRET` into source control.

## Important iCal limitation

iCal is eventually consistent, not transactional. Find A Place can poll an
Airbnb/Vrbo feed frequently and can publish confirmed Find A Place reservations
immediately in its own outbound feed, but the external platform decides when it
polls that outbound feed.

For hosts needing truly near-real-time cross-channel locking, a supported PMS
API/direct channel-manager integration is the later stronger integration path.
The current schema already reserves `PMS_API` as a connection kind.
