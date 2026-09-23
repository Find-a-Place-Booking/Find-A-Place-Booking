begin;

create table if not exists public.ical_test_feeds (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  provider text not null default 'AIRBNB'
    check (provider in (
      'AIRBNB','VRBO','BOOKING_COM','RESNEXUS',
      'OWNEREZ','LODGIFY','GOOGLE','OTHER_ICAL'
    )),
  label text not null,
  mode text not null default 'NORMAL'
    check (mode in ('NORMAL','EMPTY','INVALID','RECURRING_UNSAFE')),
  time_zone text not null default 'America/Chicago',
  is_enabled boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ical_test_events (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.ical_test_feeds(id) on delete cascade,
  uid text not null,
  summary text not null default 'Reserved',
  start_date date not null,
  end_date date not null,
  event_style text not null default 'ALL_DAY'
    check (event_style in ('ALL_DAY','TIMED_LOCAL')),
  status text not null default 'CONFIRMED'
    check (status in ('CONFIRMED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feed_id, uid),
  check (end_date > start_date)
);

create index if not exists ical_test_events_feed_start_idx
  on public.ical_test_events(feed_id, start_date, end_date);

alter table public.ical_test_feeds enable row level security;
alter table public.ical_test_events enable row level security;

revoke all on table public.ical_test_feeds from public, anon, authenticated;
revoke all on table public.ical_test_events from public, anon, authenticated;
grant all on table public.ical_test_feeds to service_role;
grant all on table public.ical_test_events to service_role;

comment on table public.ical_test_feeds is
  'Admin-only provider-like iCal simulator feeds used to test calendar import/reconciliation. Never stores real guest reservations.';
comment on table public.ical_test_events is
  'Synthetic events belonging to admin iCal simulator feeds. Safe to edit/remove for sync testing.';

commit;
