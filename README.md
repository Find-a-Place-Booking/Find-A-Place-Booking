# Calendar cron TypeScript fix

This overlay replaces only:

- app/api/cron/calendar-sync/route.ts

Why the build failed:
The generic `runWithConcurrency()` call inferred the richer ThinkReservations
result type from one callback branch, then rejected the simpler iCal result
type from the other branch.

Fix:
- adds an explicit `CalendarSyncTask` union
- adds an explicit `CalendarSyncResult` union derived from the real return
  types of both sync functions
- passes both generic types to `runWithConcurrency`
- makes the callback explicitly return `Promise<CalendarSyncResult>`

No booking, payment, calendar reconciliation, Supabase schema, or Think logic
is changed by this patch.
