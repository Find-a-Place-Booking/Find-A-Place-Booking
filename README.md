# Find A Place Booking — Overlay Patch (October 13, 2026)

**Ready-to-overlay files. No installer or terminal commands.**

Extract into the **root of the Find-A-Place-Booking repository**, keeping the folder structure and allowing these paths to replace/create files:

- `lib/supabase/server.ts` — **replace** the existing file
- `app/host/error.tsx` — **add** this new file

The original Supabase server client on GitHub `main` had blob SHA `14ff6420337c5045f1d8e2a8e8efb85bd3dc9b2c`. If `lib/supabase/server.ts` has changed since this patch was created, review the diff rather than overwrite those later changes. This ZIP contains only the two project files and this README, not an installation script.

## What it does

- On a transient Supabase HTTP 555/5xx/408 response, the **user-scoped server client** retries *GET/HEAD reads only*, once after 250 ms. Network failures on these reads get the same one retry. This addresses the precise failure recorded for Lone Cedar.
- POST/PATCH/PUT/DELETE requests are **never retried**, protecting booking, checkout, calendar writes, payments, and auth mutations from accidental duplicates.
- A host error boundary gives hosts **Try again** and **Return to reservations** actions if an outage persists.
- The underlying database queries, Stripe logic, checkout state machine, calendar sync logic, and RLS policies are unchanged.

This does not prevent an upstream service from becoming unavailable. It minimizes short transient outages and makes prolonged failures recoverable for users. It also cannot substitute for checking actual booking records or external PMS calendars.

## Verification after overlay/deployment

- Build and deploy from your normal existing GitHub/Vercel workflow.
- As a signed-in host, open Reservations, a reservation detail, the calendar, and dashboard; confirm navigation still works.
- Confirm the **October 18–20** Lone Cedar confirmed booking (E706D13F81) still blocks October 18 and 19 on Find A Place.
- **Action still required:** ThinkReservations has an active inbound-only connection without a configured return iCal feed. The October 18–20 booking has no matching imported ThinkReservations block. Lone Cedar must manually block October 18–19 on ThinkReservations and verify any downstream channels, or a separate carefully verified outbound integration must be implemented. Do not rebook using a payment-taking API.
- November 22–24 reservation C844AFB14A is **EXPIRED** and the internal checkout hold is CANCELLED; do not re-block those dates for that hold.

**Status:** Overlay created offline; the connected GitHub integration has no repository-write permission. This ZIP has not been deployed, and no production reservations, blocks or payments were modified.
