# Human-readable Admin Activity Log

The existing admin `/admin/audit` screen only read `audit_logs`, which meant the
screen mainly showed raw internal action codes and JSON. The booking engine
already had a richer append-only `reservation_events` history, but that history
was not surfaced as a normal operations timeline.

This overlay turns the existing Audit screen into **Activity log**.

## What is shown

The timeline can now include:

- profile created
- property added / edited / reviewed / published
- booking created / hold created
- booking confirmed
- payment succeeded / failed / dispute events already written by the booking engine
- cancellation requested
- cancellation approved / declined / completed
- refund events written by the reservation lifecycle
- guest policy acceptance
- booking/date-change events
- Stripe connected-account created
- Stripe account READY / RESTRICTED / DISABLED
- partner-rate decisions
- host policy acceptance
- site-copy updates
- platform-policy updates
- featured-placement/admin property actions

Unknown reservation event codes are still displayed with a readable title-case
fallback instead of being dumped as a database code.

## Booking data displayed to admins

Where available, a booking activity row shows normal operational information:

- confirmation code
- property name
- host organization
- guest/stay dates
- guest count / pets
- booking total
- reservation status
- payment status
- Find A Place commission on relevant payment/refund events
- event time
- person/admin responsible when one exists

Cancellation reasons/host responses are surfaced as readable details when they
are present in the event metadata.

Technical event codes and JSON are still available under a secondary
**Technical details** dropdown for debugging, but they are no longer the primary
admin experience.

## Historical data

Migration 068 backfills:

- existing `reservation_events`
- existing profiles
- payment-account current state
- property creation only when an older property has no creation audit event

Future reservation events are automatically mirrored into the append-only admin
timeline.

## No payment-path changes

This migration observes existing booking/payment state. It does not change:

- PaymentIntent creation
- Stripe webhook processing
- direct charges
- application fees
- refund calculations
- tax calculations
- reservation state functions

## Apply

```powershell
npx supabase db push
npm run typecheck
npm run build
```

New migration:

`20260922006800_human_admin_activity_log.sql`


## Migration 068 append-only fix

The first draft attempted to classify historical `audit_logs` rows with an
`UPDATE`. That conflicts with the existing `audit_logs_prevent_update` trigger,
which correctly enforces append-only history.

The corrected migration does **not** mutate any existing audit row. Older rows
are classified in the admin UI at read time. New mirrored activity rows include
their category when inserted.

If the first migration attempt failed inside its `BEGIN ... COMMIT` transaction,
Postgres rolled that attempt back. Re-run this corrected migration from the
beginning.
