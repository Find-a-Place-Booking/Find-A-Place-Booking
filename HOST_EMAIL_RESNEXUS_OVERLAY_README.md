# Find A Place Booking — Host Guest Emails + ResNexus Temporary Bridge

Audited against repository `main` at:

`863cec704b7f3dbc434c31d01e526bdf9588b404` — `mobile fix`

This overlay does **not** push to GitHub or Supabase. It also intentionally does
**not** replace the repository root `README.md`.

## What this adds

### 1. Host-controlled automated guest emails

New host page:

`/host/guest-emails`

Hosts can create reservation-email rules for:

- N days before check-in
- N days after checkout
- property-local send time
- one property or all properties in a host organization
- custom subject/body
- optional "do not send until an access code exists"

Supported values:

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

Door/access codes and arrival notes are stored in a host/admin-only RLS table
scoped to the reservation.

The existing Resend transactional-email outbox is reused. Scheduled messages
therefore keep the existing persisted payload, idempotency and retry behavior.
A reservation date change gets a new date-specific automation key, so an email
already sent for the old dates does not prevent the corrected automation from
sending for the new dates.

The new cron is:

`/api/cron/host-automation`

and runs every **5 minutes**. Already-sent/queued delivery states are preloaded
so the cron does not call the email provider over and over for the same rule.

Pre-arrival messages that require an access code remain eligible after their
scheduled time until the property's actual check-in time. This lets a host add
the code late without permanently missing the email. Day-zero post-stay emails
will not send before the property's actual checkout time.

### 2. Temporary ResNexus availability bridge

New host page:

`/host/integrations/resnexus`

This avoids collecting ResNexus passwords or maintaining a browser/login
session.

Inbound path:

ResNexus reservation/update/cancellation email
→ a **filtered** forward to the property's unique Find A Place inbound address
→ Resend `email.received` webhook
→ webhook signature verification
→ server-side retrieval of the received email
→ fail-closed parser
→ canonical `EXTERNAL_BLOCK`

The parser requires:

- one unambiguous Confirmation / Reservation / Booking reference
- one unambiguous labelled Check-in / Arrival date
- one unambiguous labelled Check-out / Departure date

If those cannot be identified safely, the event becomes `NEEDS_REVIEW`, the
calendar connection is marked `ERROR`, and **availability is not guessed or
changed**.

Explicit cancellation messages with the same stable reservation reference can
release the imported ResNexus block.

Do **not** forward the whole business inbox to the unique address. The forward
rule must be limited to ResNexus reservation confirmation/update/cancellation
messages, or the address should be configured directly as an additional
ResNexus reservation-notification recipient if the account supports it.

### Find A Place → ResNexus while this workaround is active

No fake write-back is attempted.

A confirmed Find A Place reservation on a bridged unit creates a one-time
host operational email telling the host to block/update those exact dates in
ResNexus and not to charge the guest again. If approved reservation dates later
change, a new date-specific action email is generated. If the Find A Place
reservation is cancelled, a cancellation action email tells the host to reopen
or remove the corresponding manual ResNexus block.

This remains an assisted workaround, not an atomic channel API. There is an
unavoidable window between a Find A Place reservation and the host applying the
manual block in ResNexus. Replace this bridge with the official ResNexus channel
/API integration when access is available.

## Database migrations

Apply in this exact order:

1. `supabase/migrations/20260928120000_calendar_email_bridge_kind.sql`
2. `supabase/migrations/20260928120100_host_guest_automations_resnexus_bridge.sql`

They are deliberately split because PostgreSQL must commit the new
`EMAIL_BRIDGE` enum value before the following migration uses it.

The second migration reuses the project's **existing**
`public.can_manage_reservation(uuid)` function. It does not replace it, so the
existing admin-access behavior remains intact.

## Resend setup for inbound ResNexus mail

1. Enable Resend Receiving Emails.
2. Get the receiving domain, for example `abc123.resend.app`.
3. Add to Vercel:
   `RESNEXUS_INBOUND_DOMAIN=abc123.resend.app`
4. Create a Resend API key that can retrieve received-email contents. Prefer a
   dedicated key and add:
   `RESEND_INBOUND_API_KEY=...`
   If omitted, the code falls back to the existing `RESEND_API_KEY`, but that
   key must have the permissions required for inbound-email retrieval.
5. In Resend Webhooks create:
   - URL: `https://www.findaplacebooking.com/api/integrations/resnexus/email`
   - event: `email.received`
6. Add the webhook signing secret to Vercel:
   `RESEND_WEBHOOK_SECRET=whsec_...`
7. Redeploy.
8. Open `/host/integrations/resnexus`, create a bridge for the unit, and copy
   its unique address.
9. Set a **ResNexus-only** forwarding filter to that address.
10. Create one harmless ResNexus test reservation and confirm the event becomes
    `APPLIED` and the dates are blocked in Find A Place.
11. Test a date change and a cancellation before relying on the bridge.

If the first real ResNexus template produces `NEEDS_REVIEW`, do not loosen the
parser by guessing. Adjust the explicit parser pattern to the real template and
re-test.

## Audit hardening included

The pre-overlay audit found and corrected several issues before this ZIP was
finalized:

- preserved the existing `can_manage_reservation` function instead of
  accidentally replacing its admin behavior
- added strict TypeScript null/type corrections in the webhook and pages
- made ResNexus webhook replays/idempotency safe
- tightened cancellation detection so policy wording cannot reopen dates
- made ambiguous reservation references/dates fail closed
- added explicit service-role grants for cron/webhook tables
- made paused ResNexus bridges re-enable cleanly and require fresh availability
- added outbound ResNexus notices for date changes and cancellations
- invalidated stale pending/failed automation retries after rule/reservation
  changes
- made guest-email idempotency date-specific
- fixed late access-code and same-day checkout scheduling edge cases
- added invalid-timezone fallback
- preloaded existing delivery states to prevent repeated provider calls every
  cron run
- avoided overwriting the repository's root `README.md`
- versioned host-automation delivery keys so an edited rule can recover from
  an invalidated failed/pending send without duplicating a message that already
  reached the guest
- versioned repeated ResNexus cancellation notices so cancel → restore → cancel
  does not silently suppress the second required host action
- made a ResNexus cancellation terminal for the same reservation reference, so
  an out-of-order/replayed confirmation cannot reopen cancelled dates

## Existing systems not changed

This overlay does not alter:

- Stripe Connect
- Square payment work
- PaymentIntent creation
- commission math
- host payouts
- taxes
- refund/cancellation payment logic
- booking holds
- iCal parsing/sync
- ThinkReservations sync
- pricing
- existing notification retry cron

The only existing application files replaced are listed with their expected
base blob SHAs in `HOST_EMAIL_RESNEXUS_OVERLAY_MANIFEST.json`.

## Existing Supabase migration-history drift to be aware of

The live project currently contains the ThinkReservations schema/functions, but
its migration history does **not** record local migration
`20260924233000_thinkreservations_calendar_sync.sql`. The live migration history
also contains `20260927160424_fix_prepare_onboarding_property_unit_rate_conflict`,
which is not present on the current GitHub `main` branch.

That drift existed before this overlay. Do **not** blindly run `supabase db push`
against production until the migration history is reconciled, because the CLI
may try to replay or reject unrelated migrations. The two new migrations in
this overlay are numbered after the current live history and can be reviewed /
applied individually if that is the deployment path you are already using.

## Checks run on this overlay

Before packaging, the new TS/TSX files were run through a strict TypeScript
harness and syntax transpilation. Parser tests covered numeric dates, named-month
dates, HTML-table labels, cancellations, policy-text false positives,
ambiguous references/dates, invalid ranges, and signed/tampered webhook bodies.
Scheduling tests covered Central time in winter/summer, late access-code sends,
check-in cutoff, and checkout cutoff.

A full repository `npm run typecheck` / `npm run build` still must be run after
overlaying because the GitHub connector provides repository contents but does
not mount the complete repo and `node_modules` into this execution environment.

Run locally after overlaying:

```bash
npm run typecheck
npm run build
```

Review the two new SQL migration files separately. If you first reconcile the
existing Supabase migration-history drift, then `npx supabase db push --dry-run`
is also appropriate. Do not use a production `db push` blindly while that older
drift remains.
