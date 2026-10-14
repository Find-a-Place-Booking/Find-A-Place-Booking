-- Anonymous aggregate-only counters for optional external insurance resource links.
-- The application uses a server-side redirect; this table contains no visitor identifiers.
create table if not exists public.insurance_resource_clicks (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('faye', 'proper')),
  placement text not null check (placement in (
    'checkout', 'booking_confirmed', 'my_trip', 'host_help',
    'footer_guest', 'footer_host', 'unknown'
  )),
  occurred_at timestamptz not null default now()
);
create index if not exists insurance_resource_clicks_analytics_idx
  on public.insurance_resource_clicks (provider, occurred_at desc);
alter table public.insurance_resource_clicks enable row level security;
revoke all on public.insurance_resource_clicks from public, anon, authenticated;
-- Only the server's service-role Supabase client may insert/read these counters.
grant select, insert on public.insurance_resource_clicks to service_role;
