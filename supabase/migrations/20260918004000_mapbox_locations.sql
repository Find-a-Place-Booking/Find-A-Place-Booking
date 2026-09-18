-- Find A Place Booking
-- Public map-location foundation.
-- Exact geocoded coordinates remain private on properties. Guest-facing RPCs
-- expose only public_map_* coordinates, which are exact only when the host has
-- explicitly allowed the exact address to be public.

begin;

alter table public.properties
  add column if not exists public_map_latitude numeric(9,6),
  add column if not exists public_map_longitude numeric(9,6),
  add column if not exists geocoded_address_key text,
  add column if not exists geocoded_at timestamptz;

create index if not exists properties_public_map_idx
  on public.properties(status, public_map_latitude, public_map_longitude)
  where public_map_latitude is not null and public_map_longitude is not null;

create or replace function public.public_listing_map_coordinates()
returns table (
  property_id uuid,
  map_latitude numeric,
  map_longitude numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    properties.id,
    properties.public_map_latitude,
    properties.public_map_longitude
  from public.properties properties
  join public.property_units units
    on units.property_id = properties.id
   and units.is_primary
   and units.is_active
  where properties.status = 'PUBLISHED'
    and properties.public_map_latitude between -90 and 90
    and properties.public_map_longitude between -180 and 180;
$$;

create or replace function public.public_map_listing_index()
returns table (
  property_id uuid,
  slug text,
  name text,
  public_area text,
  city text,
  region_code text,
  weeknight_cents integer,
  map_latitude numeric,
  map_longitude numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    properties.id,
    units.slug,
    properties.name,
    properties.public_area,
    properties.city,
    properties.region_code,
    rates.weeknight_cents,
    properties.public_map_latitude,
    properties.public_map_longitude
  from public.properties properties
  join public.property_units units
    on units.property_id = properties.id
   and units.is_primary
   and units.is_active
  left join public.unit_rate_settings rates on rates.unit_id = units.id
  where properties.status = 'PUBLISHED'
    and properties.public_map_latitude between -90 and 90
    and properties.public_map_longitude between -180 and 180
  order by properties.published_at desc nulls last, properties.updated_at desc;
$$;

revoke all on function public.public_listing_map_coordinates() from public;
revoke all on function public.public_map_listing_index() from public;
grant execute on function public.public_listing_map_coordinates() to anon, authenticated;
grant execute on function public.public_map_listing_index() to anon, authenticated;

comment on column public.properties.latitude is
  'Private exact latitude from permanent geocoding. Never expose directly through guest-facing RPCs unless the host has explicitly allowed exact location.';
comment on column public.properties.longitude is
  'Private exact longitude from permanent geocoding. Never expose directly through guest-facing RPCs unless the host has explicitly allowed exact location.';
comment on column public.properties.public_map_latitude is
  'Guest-safe map latitude. Exact only when exact_address_public=true; otherwise deterministic approximate location.';
comment on column public.properties.public_map_longitude is
  'Guest-safe map longitude. Exact only when exact_address_public=true; otherwise deterministic approximate location.';
comment on function public.public_listing_map_coordinates() is
  'Guest-safe map coordinates for published listings only. Never returns private exact coordinates.';
comment on function public.public_map_listing_index() is
  'Lightweight guest-safe map feed for all published stays.';

commit;
