# Find A Place Booking — Guest Email Automation + ResNexus Persistent Browser

Built against repository `main`:

`863cec704b7f3dbc434c31d01e526bdf9588b404` — `mobile fix`

Nothing in this overlay has been pushed to GitHub, Supabase, Vercel or Railway.

## Important: the ResNexus email bridge is gone

This version contains **no ResNexus email-forwarding/parser bridge**.

The two features in this overlay are:

1. Host-controlled automated emails to Find A Place guests.
2. A separate persistent Playwright/Chromium worker for ResNexus availability.

The ResNexus connector is browser/session based, exactly so a host can connect
their own ResNexus login once and the worker can reuse the saved session and
automatically sign back in when ordinary session expiry occurs.

---

## Host → guest automated emails

New host page:

`/host/guest-emails`

Hosts can configure rules such as:

- 3 days before check-in at 10:00 AM
- same-day arrival instructions
- post-checkout follow-up
- one property or all properties
- custom subject/body
- optional "wait until a door/access code exists"

Template variables:

- `{{guest_name}}`
- `{{property_name}}`
- `{{check_in}}`
- `{{check_out}}`
- `{{confirmation_code}}`
- `{{access_code}}`
- `{{arrival_notes}}`
- `{{host_name}}`
- `{{host_email}}`
- `{{host_phone}}`
- `{{trip_url}}`

Access codes and arrival notes are private per-reservation records.

The sender reuses the existing Find A Place Resend transactional-email outbox
and retry system. It does not create a second outbound-email stack.

The existing `/api/cron/notifications` route is left unchanged. Failed `HOST_AUTO:*` deliveries use that existing persisted-payload retry path.

### Delivery protections

- Already-sent rule/reservation messages are not duplicated.
- Editing/pausing/deleting a rule marks old pending/failed revisions `SKIPPED`
  so the existing retry cron cannot later send stale instructions.
- A new/edited rule does not back-send a scheduled message whose target time
  already passed before the edit.
- If a pre-arrival rule requires a door code, it can still send after its normal
  target time when the host adds the code late, but only up to the property's
  actual check-in time.
- Post-checkout rules have a 72-hour recovery window for temporary provider or
  cron outages.
- Scheduling uses the property's IANA timezone.

A new Vercel cron runs:

`/api/cron/host-automation`

every 5 minutes.

---

## ResNexus persistent-browser connector

New host page:

`/host/integrations/resnexus`

For each Find A Place unit, the host can enter:

- ResNexus login
- ResNexus password
- exact ResNexus room/unit name when needed
- desired check interval

The main Find A Place app encrypts the login/password with the existing:

`PMS_CREDENTIAL_ENCRYPTION_KEY`

before storing them.

The credentials, saved browser session and one-time verification code are all
service-role-only database fields and are never returned to host UI.

### Normal worker flow

1. Railway worker claims one due connection.
2. Decrypts the saved browser session for that host.
3. Opens ResNexus reservation calendar.
4. If still authenticated, it continues without logging in again.
5. If the normal session expired, it automatically signs back in with the
   encrypted saved login/password.
6. If ResNexus asks for a regular one-time verification code, Find A Place marks
   the connection `NEEDS_ATTENTION`. The host enters the code in Find A Place,
   and the worker retries.
7. If ResNexus presents CAPTCHA/human verification, the worker stops and marks
   the connection `NEEDS_ATTENTION`. It does not attempt to bypass the security
   control.
8. It reads booked/blocked availability.
9. It writes only source-owned `EXTERNAL_BLOCK` rows to Find A Place.
10. It encrypts and saves the refreshed browser storage state.
11. It closes that host browser context and continues to the next host.

One Chromium process is shared for cost control, but every host gets a separate
BrowserContext and separate encrypted session state.

### What it does NOT do

The temporary ResNexus worker does not:

- create/edit/cancel ResNexus reservations
- push Find A Place bookings into ResNexus
- change ResNexus rates
- import rates into Find A Place
- change fees, taxes, policies or payouts
- inspect/store guest card data
- touch Stripe/Square
- bypass CAPTCHA
- bypass MFA/security verification

This is **read-only inbound availability** until the official ResNexus
API/channel integration is available.

---

## Extraction is intentionally fail-closed

The worker does not infer dates from pixels or drag/drop positions.

It only accepts machine-readable evidence from the authenticated ResNexus
calendar:

1. JSON/XHR objects with explicit start/end dates.
2. Calendar DOM elements with explicit date data attributes.
3. Authenticated reservation/detail links with labelled check-in/check-out or
   arrival/departure fields.

If the live ResNexus account uses a layout/response shape the worker cannot
prove safely, it records an error/needs-attention state and leaves existing
Find A Place availability untouched.

### First live account calibration is required

The ResNexus login/calendar routes are included, but authenticated ResNexus DOM
and account-specific response shapes cannot be fully verified without an actual
host account.

Do not call this production-proven until the first real ResNexus account passes
the live validation checklist below.

---

## Double-booking protections

### Source isolation

All imported dates are tied to the ResNexus `calendar_connections` row and are
written as `EXTERNAL_BLOCK`.

The worker uses the same per-unit PostgreSQL advisory lock pattern used by the
existing booking/calendar code.

### Empty-snapshot safety

If the browser suddenly reports zero ResNexus unavailable dates while Find A
Place still has active imported ResNexus blocks:

- first empty result preserves all existing blocks
- a second empty result at least 5 minutes later is required before clearing
- after a two-hour gap the confirmation sequence starts over

### Stale-source booking guard

For units with an active ResNexus browser connector, the database rejects a new
`HOLD` / `PAYMENT_PENDING` reservation if ResNexus has never synced, is
unhealthy, or the successful snapshot is stale.

Freshness threshold:

`max(90 minutes, 2 × configured sync interval + 15 minutes)`

This guard does **not** affect hosts/units without a ResNexus browser
connection.

---

## Supabase migrations

Apply these in this exact order:

1. `supabase/migrations/20260928143000_host_guest_email_automations.sql`
2. `supabase/migrations/20260928143100_resnexus_browser_connection_kind.sql`
3. `supabase/migrations/20260928143200_resnexus_persistent_browser_connector.sql`

The enum migration is intentionally separate because PostgreSQL needs the new
`BROWSER_WORKER` enum value committed before the next migration uses it.

Do not blindly run all historical repo migrations against production if your
migration history is not aligned. Apply/review these three with the same
production migration process you currently use.

---

## Main app / Vercel

The overlay updates `vercel.json` to add the host automation cron.

No ResNexus email-receiving variables or Resend webhook are required.

The browser connection reuses:

- `PMS_CREDENTIAL_ENCRYPTION_KEY`
- normal Supabase server configuration

The guest-email automation reuses:

- `RESEND_API_KEY`
- `EMAIL_DOMAIN`
- `CRON_SECRET`
- `BOOKING_GUEST_TOKEN_SECRET`
- `NEXT_PUBLIC_SITE_URL`

---

## Railway worker

Deploy the `resnexus-worker` directory as its own Railway service.

Required Railway environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PMS_CREDENTIAL_ENCRYPTION_KEY`

`PMS_CREDENTIAL_ENCRYPTION_KEY` must be **the exact same value** used by the
Find A Place Vercel app.

Optional worker values are documented in:

`resnexus-worker/.env.example`

The service exposes:

`GET /health`

for basic worker/process health.

No Railway persistent disk is required for browser cookies because each browser
storage state is encrypted and persisted in Supabase after a successful check.

---

## First live ResNexus validation checklist

Before enabling the connector broadly:

1. Apply the three migrations.
2. Deploy the main app.
3. Deploy the Railway worker.
4. Connect one real ResNexus host/property.
5. Confirm the worker reaches `CONNECTED`.
6. Confirm correct ResNexus room/unit mapping.
7. Compare several known occupied/blocked dates between ResNexus and FAP.
8. Change a safe test reservation date in ResNexus and verify the FAP block
   moves.
9. Cancel/remove the test availability in ResNexus and verify the old FAP block
   clears after a successful confirmed snapshot.
10. Let an ordinary ResNexus login session expire and verify automatic
    re-login.
11. Test a one-time verification-code flow if that account uses one.
12. Confirm CAPTCHA/security challenge produces `NEEDS_ATTENTION` without
    availability changes.
13. Stop the Railway worker long enough to exceed the freshness threshold and
    confirm checkout fails closed only for that connected unit.
14. Restart worker and verify checkout becomes available after a healthy sync.

If step 7 reveals an account-specific DOM/API shape that is not recognized,
adjust the extractor against that real account before enabling additional
ResNexus hosts. Do not loosen it by guessing.

---

## Files

### Existing files replaced

- `components/HostSidebar.tsx`
- `components/HostMobileNav.tsx`
- `vercel.json`

### New application files

- `app/host/guest-emails/page.tsx`
- `app/host/guest-emails/actions.ts`
- `app/api/cron/host-automation/route.ts`
- `lib/notifications/host-guest-automations.ts`
- `app/host/integrations/resnexus/page.tsx`
- `app/host/integrations/resnexus/actions.ts`
- `lib/host/resnexus-browser.ts`

### New migrations

- `supabase/migrations/20260928143000_host_guest_email_automations.sql`
- `supabase/migrations/20260928143100_resnexus_browser_connection_kind.sql`
- `supabase/migrations/20260928143200_resnexus_persistent_browser_connector.sql`

### Railway worker

- `resnexus-worker/package.json`
- `resnexus-worker/Dockerfile`
- `resnexus-worker/railway.toml`
- `resnexus-worker/.env.example`
- `resnexus-worker/src/index.mjs`
- `resnexus-worker/src/crypto.mjs`
- `resnexus-worker/src/resnexus.mjs`
