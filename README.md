# Find A Place Booking — Host missed-checkout offers

## Purpose

Renea's request is for individual percentage-off emails from the **regular host dashboard**, not just the Admin → Reservations view or an aggregated 3-day automated recovery alert.

This is a **drop-in overlay**: extract into the repository root, preserving paths and overwriting `components/DashboardShell.tsx`. No Python script, SQL migration, build command hook, or patch runner is required.

## Contents

- `components/DashboardShell.tsx` — the same dashboard shell with one conditional, scoped panel on **Overview**, **Reservations**, and **Booking recovery** only.
- `components/HostMissedCheckoutOffers.tsx` and `.module.css` — safe, scoped list of recent incomplete checkouts with guest, stay dates, original total, status and a **Offer % off** action for viable review candidates. Groups duplicate reservation attempts for the *same email, unit and stay dates*. Does not claim all unfinished checkouts are contactable or available.
- `app/host/recovery/individual/[reservationId]/page.tsx` — host-facing preview of individual offer, reusing existing pricing and email form.
- `app/host/recovery/individual/[reservationId]/actions.ts` — host authenticated send action, reusing the existing individual targeted offer service and all of its database checks.

## Prerequisites

**The previous Individual Special Offer Overlay must be present** (the repo currently has it):
- `components/AdminRecoveryOfferForm.tsx`
- `lib/bookings/manual-targeted-offer.ts`

## Install

1. Unzip to the project root with **overwrite existing files**. `DashboardShell.tsx` is intentionally replaced by its drop-in updated copy.
2. Run `npx tsc --noEmit` and `npm run build` in the normal repository.
3. Commit and push. Vercel will deploy. No database migrations.
4. Sign in with Renea's **Fancy Hill host account**, not the tech or Gez admin accounts, and open `/host` (top panel), `/host/reservations` (complete list), or `/host/recovery`.
5. Choose **Offer % off** next to an eligible checkout. Review the actual guest and quote, select 5%, 10%, 15% or 20%, confirm, send. Check delivery on a controlled test before offering to guests.

## Safeguards

- Only `OWNER` or `MANAGER` organizations are loaded for the host-side list, and all rows are read under the host's RLS-scoped user session.
- Every send is authorized independently by `can_manage_property()` under the authenticated session through `loadManualOfferContext()`.
- Server validates prior payment/confirmation, published property, recovery opt-in, guest email, past stays, duplicate offers, unsubscribes, and current calendar availability.
- No emails are sent by opening the screen, no booking hold is created by sending an offer, and no payment, tax, Stripe, checkout, calendar, notification or existing recovery engine code is modified.
- Older attempts are visible for context, but past check-in dates and disabled recovery settings do not get an action. The `Offer % off` button opens a **review page**, not an immediate send.
- The panel fails silently if its optional list query fails, so the other host dashboard remains operational. Investigate error codes in logs rather than exposing details to hosts.

## Caveats

- The list includes only attempted reservations with a recorded guest email, not anonymous price-check events. Several checkout records may represent one traveler retrying the same stay/dates.
- The list uses the latest 120 days and shows up to 300 source rows / 100 guest-date combinations. Renea's claim of ~20 attempts does not necessarily equal 20 eligible email recipients.
- Availability is verified on the review page and again at send, not guaranteed by the list.
- This overlay's full application build and end-to-end email delivery must be verified in your repo/Vercel; they cannot be confirmed by static checks alone.

## Rollback

Delete the two new components and the two files under `app/host/recovery/individual/[reservationId]/`, and revert `components/DashboardShell.tsx` to its previous GitHub version. The preexisting admin individual-offer tool is unaffected.
