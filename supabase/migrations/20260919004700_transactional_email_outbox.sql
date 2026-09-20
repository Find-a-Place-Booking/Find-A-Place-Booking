-- Find A Place Booking
-- Transactional email outbox hardening.
--
-- Existing notification_deliveries already provides idempotency/audit rows.
-- This migration persists the exact rendered email payload so failed booking,
-- refund, payout and dispute emails can be retried without reconstructing an
-- older event from current reservation state.
--
-- No booking totals, payment math, Stripe routing, tax or payout timing changes.

begin;

alter table public.notification_deliveries
  add column if not exists subject text,
  add column if not exists text_body text,
  add column if not exists html_body text;

comment on column public.notification_deliveries.subject is
  'Rendered subject retained for idempotent transactional-email retries.';
comment on column public.notification_deliveries.text_body is
  'Rendered plain-text body retained for idempotent transactional-email retries.';
comment on column public.notification_deliveries.html_body is
  'Rendered HTML body retained for idempotent transactional-email retries. Access remains admin-only under notification_deliveries RLS.';

create index if not exists notification_deliveries_retry_idx
  on public.notification_deliveries(status, attempt_count, updated_at)
  where status = 'FAILED';

commit;
