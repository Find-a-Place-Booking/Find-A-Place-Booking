Find A Place Booking — Message Speed + Timestamp Fix

LIVE DATABASE
The production Supabase project was already updated before this ZIP was built:
reservation_messages has been added to the supabase_realtime publication.

The included migration mirrors that live change in source and is idempotent.

WHAT THIS FIXES

1. HOST INBOX WAIT
- Hosts now subscribe to reservation_messages INSERT events through Supabase
  Realtime.
- A guest message refreshes the host shell/inbox immediately.
- When the host is on Messages, a light 5-second visible-tab fallback refresh
  remains in place in case a realtime connection drops.
- Focus, reconnect and returning to the tab also refresh the host view.
- Realtime still obeys the existing reservation_messages RLS.

2. GUEST WAIT
- My Trip no longer waits up to 15 seconds between message refreshes.
- Only the lightweight messages endpoint is polled every 4 seconds while the
  page is visible.
- The heavier review/change/cancellation endpoints are NOT polled every 4
  seconds; they still refresh only when needed.
- Focus, reconnect and returning to the tab also refresh messages.

3. SEND-BUTTON / EMAIL PROVIDER WAIT
- The reservation message remains committed first and is the source of truth.
- Message email notification delivery now runs with Next.js after(), so a slow
  email provider does not make the guest or host wait for the Send action.
- Existing notification_deliveries idempotency remains unchanged.

4. TIMESTAMPS
- Guest message timestamps explicitly use the property's saved timezone.
- Message notification email bodies include the same property-local timestamp
  with a zone label such as CDT/CST.
- instrumentation.ts sets the Node server-rendered default to America/Chicago
  (or FAP_SERVER_TIME_ZONE if one is configured). This corrects the existing
  Vercel/UTC drift in host pages for the platform's current Central-time
  inventory without rewriting unrelated reservation screens.

NOT CHANGED
- Reservation/payment/Stripe logic
- Booking holds
- Tax logic
- Message database schema or message body
- Message email recipients
- Scheduled pre-arrival/post-stay cron cadence (still every 5 minutes)
- Existing email idempotency/retry system

EXPECTED BEHAVIOR
- Guest -> host: host inbox should normally update almost immediately; 5 seconds
  is the fallback ceiling while the host is actively on Messages.
- Host -> guest: guest My Trip should normally show the reply within 0-4 seconds.
- Sender should no longer wait on Resend/provider latency after the DB message is
  successfully stored.
- Message times should no longer appear five hours apart between the host portal,
  guest trip page and the explicit timestamp shown inside message emails.

FILES
NEW:
- components/HostReservationMessageLiveRefresh.tsx
- lib/time/property-time.ts
- instrumentation.ts
- supabase/migrations/20261005211500_realtime_reservation_messages.sql

REPLACE:
- components/DashboardShell.tsx
- components/GuestTripTools.tsx
- app/trip/[confirmation]/page.tsx
- lib/notifications/message-emails.ts
