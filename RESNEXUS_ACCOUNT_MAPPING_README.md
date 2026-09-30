# Find A Place Booking — ResNexus Account-Level Mapping v2

Built against current GitHub `main`:

`51c037940aeecdc06d36d58de8802286ec127cd8` — `Resnexus Workaraound`

Nothing in this overlay has been pushed to GitHub, Supabase, Vercel or Railway.

## What this fixes

The first ResNexus browser connector attached one login/session to one Find A
Place unit. That meant a host with several cabins under one ResNexus account
would have had to enter the same credentials repeatedly.

This overlay changes the model to:

```text
ONE ResNexus account/login
        ↓
ONE encrypted persistent browser session
        ↓
scan the whole ResNexus account calendar
        ↓
discover every ResNexus room/cabin
        ↓
map each discovered resource to one FAP property/unit
```

The host only connects the ResNexus account once.

## Host workflow

1. Open `/host/integrations/resnexus`.
2. Choose the host organization/account.
3. Enter the ResNexus login/password once.
4. Railway performs the first account scan.
5. The FAP page shows the discovered ResNexus rooms/cabins.
6. The host maps each FAP property to the matching ResNexus resource.
7. Future Railway checks use the same encrypted browser session and scan all
   mapped cabins in that ResNexus account in one pass.

Multiple ResNexus accounts are still supported for an organization if a host
actually has more than one ResNexus login.

## Database model

New tables:

- `resnexus_browser_accounts`
  - one encrypted login/password/session per ResNexus account
  - account-level worker status, verification challenge, next sync, diagnostics

- `resnexus_resource_mappings`
  - maps one discovered ResNexus resource to one FAP `property_units` row
  - owns one normal `calendar_connections` row per mapped FAP unit

- `resnexus_account_runs`
  - account-level worker audit/history

The original per-unit ResNexus connector tables/RPCs are left in place for
rollback compatibility, but the new host UI and Railway worker no longer use
them.

At the time this overlay was built, production had **0 rows** in the old
`resnexus_browser_connections` table, so there is no existing host connection
data to migrate.

## Availability flow

```text
Railway logs into ONE ResNexus account
        ↓
reads the whole account calendar
        ↓
each occupied/block record must expose a room/unit identity
        ↓
worker assigns a stable `resource_key`
        ↓
Supabase matches that resource_key to the host's saved mapping
        ↓
each FAP unit receives only its own `EXTERNAL_BLOCK` rows
```

A multi-cabin account is not flattened into one calendar.

## Safety behavior

The account-level worker remains intentionally fail-closed:

- every imported reservation/block must have explicit start/end dates
- every imported reservation/block must have an explicit ResNexus room/unit
- the worker does not infer dates from visual pixel positions
- unknown/unprovable records stop the sync instead of guessing
- source-specific per-unit advisory locks remain in place
- mapped units still use the ResNexus stale-source booking guard
- unexpected empty snapshots preserve existing imported blocks until a second
  empty snapshot at least 5 minutes later
- CAPTCHA/human verification is not bypassed
- one-time verification codes can still be entered through the FAP host UI
- no ResNexus rates, taxes, payments or write-back reservations are touched

## Files replaced

- `app/host/integrations/resnexus/page.tsx`
- `app/host/integrations/resnexus/actions.ts`
- `lib/host/resnexus-browser.ts`
- `resnexus-worker/src/index.mjs`
- `resnexus-worker/src/resnexus.mjs`

## New migration

- `supabase/migrations/20260929090000_resnexus_account_multi_property_mapping.sql`

### Migration order

If the original persistent-browser migrations `431` and `432` are already
applied, apply only the new `20260929090000` migration.

If they are not yet applied, use:

1. `20260928143100_resnexus_browser_connection_kind.sql`
2. `20260928143200_resnexus_persistent_browser_connector.sql`
3. `20260929090000_resnexus_account_multi_property_mapping.sql`

`BROWSER_WORKER` from 431 is required by the new mapping migration.

## Railway

No new Railway environment variables are required.

Keep the variables already configured:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PMS_CREDENTIAL_ENCRYPTION_KEY`
- `RESNEXUS_POLL_SECONDS`
- `RESNEXUS_LEASE_SECONDS`
- `RESNEXUS_HEADLESS`
- `RESNEXUS_SYNC_LOOKAHEAD_DAYS`
- `RESNEXUS_SYNC_LOOKBACK_DAYS`
- `RESNEXUS_MAX_CALENDAR_PAGES`

After this code is pushed, Railway should redeploy the worker from the same
`/resnexus-worker` root directory.

Its `/health` response now reports:

`"mode": "resnexus-account-mapping-v2"`

which is an easy way to confirm Railway is running the new worker.

## First live account

The browser/session architecture is wired, but authenticated ResNexus response
shapes still need a real account for final calibration.

For the first real multi-cabin account:

1. connect one ResNexus login once
2. watch Railway logs for `account sync complete`
3. confirm all expected cabins appear under Discovered ResNexus rooms/cabins
4. map each cabin to the correct FAP property
5. compare several occupied dates per cabin
6. move one safe test reservation and confirm only that FAP cabin moves
7. cancel/remove the test reservation and confirm only that FAP cabin clears
8. verify another cabin is unaffected

If ResNexus does not expose a stable room/unit identity in that account's
authenticated data, the worker intentionally errors instead of mixing cabins.
