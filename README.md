# Find A Place Booking — Milestone 9B.1 Calendar Hardening

Baseline: `841d98c` — `Calander Initial Commit` on remote `main`.

This follow-up hardens the accepted 9B calendar/availability architecture before reservation and payment work. It does **not** add live reservations, taxes, Stripe/Square, payouts or live money.

## What this hardens

- iCal synchronization now fails closed when recurring or malformed VEVENTs cannot be normalized safely; existing imported availability is preserved instead of being reconciled away.
- Duplicate external event keys are removed before the database sync payload is built.
- Calendar fetching now bounds DNS resolution, keeps the fetch timeout active through body streaming, and stops reading immediately at the 2 MB feed limit even when Content-Length is absent.
- Private external feed URLs and tokenized outbound calendar URLs are readable only by organization owners/managers and active admins, not ordinary organization staff.
- Host source block counts are aggregated in PostgreSQL instead of transferring every historical imported block to Next.js.
- Admin calendar health is returned by one bounded admin-only RPC rather than loading all active platform blocks and resolving ownership with several application queries.
- Exported iCalendar lines are folded to the RFC 5545 75-octet line limit.
- Export feeds omit availability that ended more than 30 days ago so subscription responses do not grow forever.
- Health schema becomes `calendar-availability-hardening-v1`.

## Supabase

Run **only** the new migration on a database already current through migration 014:

`supabase/migrations/20260914001500_calendar_hardening_performance.sql`

Never edit or rerun migration 014 to apply these changes.

## Verify

```powershell
npm run typecheck
npm run build
npm run dev
```

Then open `/api/health/supabase` and confirm:

```json
{"ok":true,"service":"supabase","configured":true,"schema":"calendar-availability-hardening-v1"}
```

See `docs/APPLY_MILESTONE_9B_1.md` and `docs/MILESTONE_9B_1_HARDENING.md`.
