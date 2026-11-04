-- Find A Place Booking: automatic exact-listing, exact-dates Airbnb comparisons.
-- Read/write only through service role; never expose secret Airbnb iCal feeds.
-- No automatic guesses or channel-wide percentage markups.
-- Applying this migration makes no bookings, charges, or outbound API requests.

create table if not exists public.airbnb_price_comparisons (
  unit_id uuid not null references public.property_units(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  guests integer not null check (guests between 1 and 16),
  listing_id text,
  currency text not null default 'USD',
  total_cents bigint check (total_cents > 0),
  price_basis text not null default 'BEFORE_TAXES'
    check (price_basis = 'BEFORE_TAXES'),
  source text,
  observed_at timestamptz,
  last_attempt_at timestamptz,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint airbnb_price_comparisons_dates_ok check (check_out > check_in),
  primary key (unit_id, check_in, check_out, guests)
);

create index if not exists idx_airbnb_comparisons_last_attempt
  on public.airbnb_price_comparisons(last_attempt_at);

alter table public.airbnb_price_comparisons enable row level security;
revoke all on public.airbnb_price_comparisons from public, anon, authenticated;
grant select, insert, update on public.airbnb_price_comparisons to service_role;

-- Claim one lookup per 30 minutes per listing/dates/party combination.
-- Limit provider traffic across the whole platform and per unit per hour.
-- This prevents browser refreshes, crawlers, and concurrent requests from
-- creating runaway third-party API bills.
create or replace function public.claim_airbnb_price_comparison(
  target_unit_id uuid,
  target_check_in date,
  target_check_out date,
  target_guests integer
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  claimed uuid;
  unit_requests integer;
  global_requests integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if target_guests not between 1 and 16
    or target_check_out <= target_check_in
    or target_check_out - target_check_in > 28
    or target_check_in < current_date
    or target_check_in > current_date + 365 then
    return false;
  end if;

  select count(*) into unit_requests
  from public.airbnb_price_comparisons c
  where c.unit_id = target_unit_id
    and c.last_attempt_at >= now() - interval '1 hour';
  select count(*) into global_requests
  from public.airbnb_price_comparisons c
  where c.last_attempt_at >= now() - interval '1 hour';
  if unit_requests >= 6 or global_requests >= 120 then
    return false;
  end if;

  insert into public.airbnb_price_comparisons (
    unit_id, check_in, check_out, guests, last_attempt_at
  ) values (
    target_unit_id, target_check_in, target_check_out,
    target_guests, now()
  )
  on conflict (unit_id, check_in, check_out, guests)
  do update set last_attempt_at = now(), updated_at = now()
  where public.airbnb_price_comparisons.last_attempt_at is null
     or public.airbnb_price_comparisons.last_attempt_at < now() - interval '30 minutes'
  returning unit_id into claimed;

  return claimed is not null;
end;
$$;
revoke all on function public.claim_airbnb_price_comparison(uuid,date,date,integer)
  from public, anon, authenticated;
grant execute on function public.claim_airbnb_price_comparison(uuid,date,date,integer)
  to service_role;
