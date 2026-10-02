begin;

create table if not exists public.booking_attempts (
  id uuid primary key,
  unit_id uuid references public.property_units(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  payment_environment public.payment_environment not null default 'TEST',
  current_stage text not null default 'LISTING',
  last_event text not null default 'attempt_started',
  outcome text,
  landing_path text,
  referrer text,
  user_agent text,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists booking_attempts_last_seen_idx
  on public.booking_attempts (payment_environment, last_seen_at desc);

create index if not exists booking_attempts_unit_idx
  on public.booking_attempts (unit_id, last_seen_at desc);

create index if not exists booking_attempts_reservation_idx
  on public.booking_attempts (reservation_id)
  where reservation_id is not null;

create table if not exists public.booking_attempt_events (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.booking_attempts(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  event_name text not null,
  stage text not null,
  success boolean,
  status_code integer,
  error_code text,
  error_message text,
  path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint booking_attempt_event_name_length
    check (char_length(event_name) between 1 and 100),
  constraint booking_attempt_stage_length
    check (char_length(stage) between 1 and 60),
  constraint booking_attempt_error_length
    check (error_message is null or char_length(error_message) <= 1000)
);

create index if not exists booking_attempt_events_attempt_idx
  on public.booking_attempt_events (attempt_id, created_at);

create index if not exists booking_attempt_events_name_idx
  on public.booking_attempt_events (event_name, created_at desc);

create index if not exists booking_attempt_events_failure_idx
  on public.booking_attempt_events (created_at desc)
  where success is false;

alter table public.booking_attempts enable row level security;
alter table public.booking_attempt_events enable row level security;

drop policy if exists "booking_attempts_admin_read" on public.booking_attempts;

create policy "booking_attempts_admin_read"
on public.booking_attempts
for select
to authenticated
using (public.is_active_admin());

drop policy if exists "booking_attempt_events_admin_read"
on public.booking_attempt_events;

create policy "booking_attempt_events_admin_read"
on public.booking_attempt_events
for select
to authenticated
using (public.is_active_admin());

revoke all on public.booking_attempts from anon, authenticated;
revoke all on public.booking_attempt_events from anon, authenticated;

grant select on public.booking_attempts to authenticated;
grant select on public.booking_attempt_events to authenticated;

grant select, insert, update, delete
on public.booking_attempts
to service_role;

grant select, insert, update, delete
on public.booking_attempt_events
to service_role;

comment on table public.booking_attempts is
  'Durable anonymous booking-funnel sessions. Contains operational metadata only; guest PII stays on reservations.';

comment on table public.booking_attempt_events is
  'Append-only booking-funnel events used to diagnose guest drop-off, confusion, availability failures and checkout errors.';

commit;
