# Find A Place Booking — Missed Booking Recovery

This overlay adds a host-controlled recovery funnel for guests who priced dates
or abandoned checkout but did not book.

## Guest flow

1. The existing immediate abandoned-checkout recovery email remains unchanged.
2. If the host has enabled recovery for that property, the new recovery cron
   checks again after 24 hours. If the exact dates are still bookable, it sends
   one "your dates are still available" message. The day-one reminder is
   deduped by guest email + unit + exact dates, so retrying checkout does not
   create multiple 24-hour reminders.
3. After 72 hours, successful LIVE pricing sessions for the same unit and exact
   date range are grouped into an opportunity. Plain listing views do not count.
4. An opportunity is only created when the dates are still available and at
   least one non-suppressed guest email from an abandoned checkout exists.
5. In ASK mode, the host sees a dashboard alert and chooses the discount before
   anything promotional is sent. In AUTO mode, Find A Place sends the host's
   saved default offer automatically.
6. Each recipient gets a unique one-use promo code scoped to the property and
   original check-in. The dollar value is calculated from the lodging price the
   guest actually saw, so fees/taxes are not discounted and extending a stay
   does not enlarge the recovery discount.
7. Offers expire automatically and their generated promo codes are archived.

## Host controls

New page: `/host/recovery`

Per published property the host can set:
- recovery on/off
- 24-hour availability reminder on/off
- after 3 days: Ask me / Automatic / Off
- default discount percent (1–50%)
- number of successful booking sessions required before an opportunity opens
- offer expiration (24 hours through 7 days)

A host dashboard alert appears while ASK-mode opportunities are waiting.
"Booking recovery" is added to desktop and mobile host navigation.

## Email preference safety

Recovery marketing has its own unsubscribe flow:
`/booking/recovery-unsubscribe`

Opting out stops missed-booking reminders and recovery discounts only. It does
not suppress booking confirmations, receipts, trip-critical messages, or the
host's existing pre-arrival/post-stay transactional automations.

The unsubscribe GET does not mutate anything; the guest confirms with a POST,
so email-security link scanners cannot accidentally opt someone out.

## Availability/payment boundaries

- Recovery checks canonical availability immediately before sending.
- ResNexus safety/readiness checks fail closed.
- If dates close before the guest opens the offer, the offer page refuses to
  continue and sends the guest back to the stay.
- The existing hold endpoint still performs the authoritative availability
  check before a reservation can be held.
- No Stripe/payment amount code was replaced. Recovery discounts use the
  existing Find A Place promotion engine and existing promotion redemption
  transaction.
- Existing immediate checkout recovery is not removed or changed.

## Cron

New route: `/api/cron/booking-recovery`

Vercel schedule: `12,27,42,57 * * * *` (every 15 minutes, staggered away from
other jobs).

## Production database status

These migrations have ALREADY been applied to production Supabase and are in
migration history:

- `20261007222730_booking_recovery_campaigns.sql`
- `20261007222827_booking_recovery_hardening.sql`

Do not manually re-apply them to production. Keep the files in the repo so the
repo migration history matches production.

No host has been opted in automatically. Production tables are empty/inert
until the application overlay is deployed and a host enables recovery.

## Verification performed

- SQL migration executed inside a transaction and rolled back successfully
  before production apply.
- Both production migrations applied successfully.
- All four new tables verified with RLS enabled.
- Permission check verified anon has no table access; recipient/suppression
  tables have no authenticated access; hosts only get settings CRUD needed for
  their properties and read-only access to their own opportunities.
- Supabase security advisor has no findings for the new booking-recovery
  objects after hardening.
- Remaining performance advisor notes are only expected `unused_index` INFO
  notices because the new tables have no production rows yet.
- Existing production booking-attempt data was checked: successful estimate
  request events contain `unitId`, `checkIn`, `checkOut`, and guest count, so
  the recovery grouping uses real tracked data already emitted by the site.
- Existing expired LIVE reservations were checked and contain the lodging
  pricing snapshot used to calculate a recovery discount from what the guest
  actually saw.
- Overlay TypeScript was checked in strict mode with dependency shims and all
  TS/TSX files were independently transpiled for syntax/isolated-module errors.
- A complete repository `npm run typecheck` / `npm run build` still needs to
  run after overlaying because the GitHub connector does not provide a mounted
  repo/node_modules here.

## Existing files replaced

Expected GitHub base blobs when this overlay was prepared:

- `components/DashboardShell.tsx` — `8c06fdb5b9fd896c1bec6ff88b8ea20c47319c67`
- `components/HostSidebar.tsx` — `fcdb9e042fb186e1b9081b2c43ba4864decff1b1`
- `components/HostMobileNav.tsx` — `0010d32d2b5223067dada12692a068dc11e350bc`
- `vercel.json` — `099571546ef90e65830fd2ca2ec0dd643f7b8586`

All other application files in this overlay are new.
