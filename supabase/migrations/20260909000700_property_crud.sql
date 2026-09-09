-- Find A Place Booking
-- Milestone 7: real property CRUD foundation
--
-- Converts the saved host-onboarding property draft into real property +
-- rentable-unit records, establishes stable shareable slugs/history, stores
-- structured amenities/policies/rates/fees, and adds private Supabase Storage
-- support for property photos. Booking, calendar sync, payments and public
-- publication/approval remain intentionally out of scope.

begin;

create type public.property_status as enum (
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'PAUSED',
  'REJECTED',
  'ARCHIVED'
);

create type public.calendar_source_preference as enum (
  'UNSET',
  'ICAL',
  'PMS',
  'NONE'
);

create type public.property_fee_type as enum (
  'CLEANING',
  'PET',
  'EXTRA_GUEST',
  'OTHER'
);

create type public.property_fee_calculation as enum (
  'FLAT_PER_STAY',
  'PER_NIGHT',
  'PER_GUEST_PER_NIGHT',
  'PER_PET_PER_STAY'
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  property_type text,
  status public.property_status not null default 'DRAFT',
  public_area text,
  street_address text,
  city text,
  region_code text,
  postal_code text,
  country_code text not null default 'US',
  latitude numeric(9,6),
  longitude numeric(9,6),
  exact_address_public boolean not null default false,
  notification_email text,
  operations_email text,
  calendar_preference public.calendar_source_preference not null default 'UNSET',
  custom_amenities text,
  custom_policies text,
  source_onboarding_draft_id uuid unique references public.host_onboarding_drafts(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  submitted_at timestamptz,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.property_units (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  slug text not null,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  max_guests integer check (max_guests is null or max_guests between 1 and 100),
  bedrooms integer check (bedrooms is null or bedrooms between 0 and 100),
  beds integer check (beds is null or beds between 0 and 200),
  bathrooms numeric(4,1) check (bathrooms is null or bathrooms between 0 and 100),
  minimum_stay_nights integer not null default 1 check (minimum_stay_nights between 1 and 365),
  check_in time,
  checkout time,
  cancellation_policy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index property_units_slug_unique_idx on public.property_units(lower(slug));
create unique index property_units_one_primary_idx on public.property_units(property_id) where is_primary;
create index properties_organization_idx on public.properties(organization_id, created_at desc);
create index properties_status_idx on public.properties(status, updated_at desc);
create index properties_location_idx on public.properties(region_code, city, public_area);
create index property_units_property_idx on public.property_units(property_id);

create table public.listing_slug_history (
  slug text primary key,
  unit_id uuid not null references public.property_units(id) on delete cascade,
  replaced_at timestamptz not null default now()
);

create index listing_slug_history_unit_idx on public.listing_slug_history(unit_id, replaced_at desc);

create table public.amenity_catalog (
  code text primary key,
  label text not null unique,
  category text not null,
  active boolean not null default true
);

create table public.unit_amenities (
  unit_id uuid not null references public.property_units(id) on delete cascade,
  amenity_code text not null references public.amenity_catalog(code),
  primary key (unit_id, amenity_code)
);

create table public.policy_catalog (
  code text primary key,
  label text not null unique,
  category text not null,
  active boolean not null default true
);

create table public.unit_policies (
  unit_id uuid not null references public.property_units(id) on delete cascade,
  policy_code text not null references public.policy_catalog(code),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  primary key (unit_id, policy_code)
);

create table public.unit_rate_settings (
  unit_id uuid primary key references public.property_units(id) on delete cascade,
  currency text not null default 'USD',
  weeknight_cents integer check (weeknight_cents is null or weeknight_cents >= 0),
  weekend_cents integer check (weekend_cents is null or weekend_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.unit_fees (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.property_units(id) on delete cascade,
  fee_type public.property_fee_type not null,
  label text not null,
  amount_cents integer not null check (amount_cents >= 0),
  calculation public.property_fee_calculation not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, fee_type)
);

create table public.property_images (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.property_units(id) on delete cascade,
  storage_path text not null unique,
  original_name text,
  content_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  sort_order integer not null default 0,
  alt_text text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index property_images_unit_idx on public.property_images(unit_id, sort_order, created_at);

alter table public.host_onboarding_drafts
  add column created_property_id uuid unique references public.properties(id) on delete set null;

insert into public.amenity_catalog (code, label, category) values
  ('wifi', 'Wi-Fi', 'Popular'),
  ('hot-tub', 'Hot tub', 'Popular'),
  ('pet-friendly', 'Pet friendly', 'Popular'),
  ('fire-pit', 'Fire pit', 'Popular'),
  ('waterfront', 'Waterfront', 'Popular'),
  ('full-kitchen', 'Full kitchen', 'Popular'),
  ('refrigerator', 'Refrigerator', 'Kitchen & dining'),
  ('oven-stove', 'Oven / stove', 'Kitchen & dining'),
  ('dishwasher', 'Dishwasher', 'Kitchen & dining'),
  ('microwave', 'Microwave', 'Kitchen & dining'),
  ('coffee-maker', 'Coffee maker', 'Kitchen & dining'),
  ('grill', 'Grill', 'Kitchen & dining'),
  ('dining-table', 'Dining table', 'Kitchen & dining'),
  ('air-conditioning', 'Air conditioning', 'Comfort & entertainment'),
  ('heating', 'Heating', 'Comfort & entertainment'),
  ('fireplace', 'Fireplace', 'Comfort & entertainment'),
  ('washer-dryer', 'Washer / dryer', 'Comfort & entertainment'),
  ('tv', 'TV', 'Comfort & entertainment'),
  ('game-room', 'Game room', 'Comfort & entertainment'),
  ('workspace', 'Workspace', 'Comfort & entertainment'),
  ('outdoor-seating', 'Outdoor seating', 'Outdoor & location'),
  ('private-deck-patio', 'Private deck / patio', 'Outdoor & location'),
  ('dock', 'Dock', 'Outdoor & location'),
  ('lake-access', 'Lake access', 'Outdoor & location'),
  ('river-access', 'River access', 'Outdoor & location'),
  ('mountain-view', 'Mountain view', 'Outdoor & location'),
  ('private-acreage', 'Private acreage', 'Outdoor & location'),
  ('free-parking', 'Free parking', 'Parking & access'),
  ('boat-parking', 'Boat parking', 'Parking & access'),
  ('ev-charging', 'EV charging', 'Parking & access'),
  ('self-check-in', 'Self check-in', 'Parking & access'),
  ('smart-lock', 'Smart lock', 'Parking & access'),
  ('step-free-entrance', 'Step-free entrance', 'Parking & access'),
  ('accessible-parking', 'Accessible parking', 'Parking & access')
on conflict (code) do nothing;

insert into public.policy_catalog (code, label, category) values
  ('no-smoking-indoors', 'No smoking indoors', 'House rules'),
  ('no-parties', 'No parties or unauthorized events', 'House rules'),
  ('registered-guests-only', 'Registered guests only', 'House rules'),
  ('designated-parking', 'Parking limited to designated areas', 'House rules'),
  ('quiet-hours', 'Quiet hours apply', 'Noise, safety & property'),
  ('no-fireworks', 'No fireworks', 'Noise, safety & property'),
  ('no-glass-pool-hot-tub', 'No glass near pool / hot tub', 'Noise, safety & property'),
  ('security-cameras-disclosed', 'Exterior security cameras disclosed', 'Noise, safety & property'),
  ('excessive-damage', 'Guests responsible for excessive damage', 'Noise, safety & property'),
  ('pets-allowed', 'Pets allowed', 'Guests & pets'),
  ('children-supervised', 'Children must be supervised', 'Guests & pets'),
  ('minimum-booking-age', 'Minimum booking age applies', 'Guests & pets')
on conflict (code) do nothing;

create trigger properties_set_updated_at
before update on public.properties
for each row execute function public.set_updated_at();

create trigger property_units_set_updated_at
before update on public.property_units
for each row execute function public.set_updated_at();

create trigger unit_rate_settings_set_updated_at
before update on public.unit_rate_settings
for each row execute function public.set_updated_at();

create trigger unit_fees_set_updated_at
before update on public.unit_fees
for each row execute function public.set_updated_at();

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members members
    where members.organization_id = target_organization_id
      and members.profile_id = (select auth.uid())
      and members.status = 'ACTIVE'
      and members.role in ('OWNER', 'MANAGER')
  );
$$;

create or replace function public.can_access_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_admin() or exists (
    select 1
    from public.properties properties
    where properties.id = target_property_id
      and public.is_organization_member(properties.organization_id)
  );
$$;

create or replace function public.can_manage_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties properties
    where properties.id = target_property_id
      and public.can_manage_organization(properties.organization_id)
  );
$$;

create or replace function public.can_access_unit(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_admin() or exists (
    select 1
    from public.property_units units
    join public.properties properties on properties.id = units.property_id
    where units.id = target_unit_id
      and public.is_organization_member(properties.organization_id)
  );
$$;

create or replace function public.can_manage_unit(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.property_units units
    join public.properties properties on properties.id = units.property_id
    where units.id = target_unit_id
      and public.can_manage_organization(properties.organization_id)
  );
$$;

create or replace function public.normalize_listing_slug(raw_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(trim(coalesce(raw_value, ''))), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.safe_integer(raw_value text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  if trim(coalesce(raw_value, '')) !~ '^[0-9]+$' then return null; end if;
  return trim(raw_value)::integer;
exception when others then
  return null;
end;
$$;

create or replace function public.safe_numeric(raw_value text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if trim(coalesce(raw_value, '')) !~ '^[0-9]+([.][0-9]+)?$' then return null; end if;
  return trim(raw_value)::numeric;
exception when others then
  return null;
end;
$$;

create or replace function public.money_text_to_cents(raw_value text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text := trim(coalesce(raw_value, ''));
begin
  if normalized = '' then return null; end if;
  if normalized !~ '^[0-9]+([.][0-9]{1,2})?$' then return null; end if;
  return round(normalized::numeric * 100)::integer;
exception when others then
  return null;
end;
$$;

create or replace function public.unique_listing_slug(raw_value text, target_unit_id uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base_slug text := public.normalize_listing_slug(raw_value);
  candidate text;
  suffix integer := 1;
begin
  if base_slug = '' then base_slug := 'stay'; end if;
  if base_slug in ('admin','api','auth','checkout','host','hosts','stays','trip','booking','support','settings') then
    base_slug := base_slug || '-stay';
  end if;

  candidate := left(base_slug, 90);
  while exists (
    select 1 from public.property_units units
    where lower(units.slug) = lower(candidate)
      and (target_unit_id is null or units.id <> target_unit_id)
  ) or exists (
    select 1 from public.listing_slug_history history
    where lower(history.slug) = lower(candidate)
      and (target_unit_id is null or history.unit_id <> target_unit_id)
  ) loop
    suffix := suffix + 1;
    candidate := left(base_slug, 82) || '-' || suffix::text;
  end loop;

  return candidate;
end;
$$;

create or replace function public.create_property_from_onboarding(target_organization_id uuid)
returns table (property_id uuid, unit_id uuid, slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  draft_row public.host_onboarding_drafts%rowtype;
  form jsonb;
  new_property_id uuid;
  new_unit_id uuid;
  new_slug text;
  property_name text;
  calendar_value public.calendar_source_preference := 'UNSET';
  rate_weeknight integer;
  rate_weekend integer;
  fee_cleaning integer;
  fee_pet integer;
  fee_extra integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_organization(target_organization_id) then raise exception 'Organization owner or manager access required'; end if;

  select drafts.* into draft_row
  from public.host_onboarding_drafts drafts
  where drafts.organization_id = target_organization_id
  for update;

  if not found then raise exception 'Host onboarding draft not found'; end if;
  if draft_row.status <> 'READY_FOR_PROPERTY' or not draft_row.authority_confirmed then
    raise exception 'Finish host setup before creating the property';
  end if;

  if draft_row.created_property_id is not null then
    select properties.id, units.id, units.slug
    into new_property_id, new_unit_id, new_slug
    from public.properties properties
    join public.property_units units on units.property_id = properties.id and units.is_primary
    where properties.id = draft_row.created_property_id;

    return query select new_property_id, new_unit_id, new_slug;
    return;
  end if;

  form := coalesce(draft_row.form_data, '{}'::jsonb);
  property_name := nullif(trim(coalesce(form ->> 'propertyName', '')), '');
  if property_name is null then raise exception 'Property name is required'; end if;

  calendar_value := case lower(trim(coalesce(form ->> 'calendarPreference', '')))
    when 'ical' then 'ICAL'::public.calendar_source_preference
    when 'pms' then 'PMS'::public.calendar_source_preference
    when 'none' then 'NONE'::public.calendar_source_preference
    else 'UNSET'::public.calendar_source_preference
  end;

  insert into public.properties (
    organization_id, name, description, property_type, status, public_area,
    street_address, city, region_code, postal_code, country_code,
    notification_email, operations_email, calendar_preference,
    custom_amenities, custom_policies, source_onboarding_draft_id, created_by
  ) values (
    target_organization_id,
    left(property_name, 180),
    left(nullif(trim(coalesce(form ->> 'description', '')), ''), 10000),
    left(nullif(trim(coalesce(form ->> 'propertyType', '')), ''), 80),
    'DRAFT',
    left(nullif(trim(coalesce(form ->> 'publicArea', '')), ''), 180),
    left(nullif(trim(coalesce(form ->> 'street', '')), ''), 240),
    left(nullif(trim(coalesce(form ->> 'city', '')), ''), 120),
    upper(left(nullif(trim(coalesce(form ->> 'state', '')), ''), 40)),
    left(nullif(trim(coalesce(form ->> 'postal', '')), ''), 24),
    'US',
    left(nullif(lower(trim(coalesce(form ->> 'email', ''))), ''), 320),
    left(nullif(lower(trim(coalesce(form ->> 'email', ''))), ''), 320),
    calendar_value,
    left(nullif(trim(coalesce(form ->> 'customAmenities', '')), ''), 5000),
    left(nullif(trim(coalesce(form ->> 'customPolicies', '')), ''), 5000),
    draft_row.id,
    actor_id
  ) returning id into new_property_id;

  new_slug := public.unique_listing_slug(property_name, null);

  insert into public.property_units (
    property_id, name, slug, is_primary, max_guests, bedrooms, beds, bathrooms,
    minimum_stay_nights, check_in, checkout, cancellation_policy
  ) values (
    new_property_id,
    left(property_name, 180),
    new_slug,
    true,
    public.safe_integer(form ->> 'maxGuests'),
    public.safe_integer(form ->> 'bedrooms'),
    public.safe_integer(form ->> 'beds'),
    public.safe_numeric(form ->> 'bathrooms'),
    greatest(coalesce(public.safe_integer(form ->> 'minStay'), 1), 1),
    nullif(trim(coalesce(form ->> 'checkIn', '')), '')::time,
    nullif(trim(coalesce(form ->> 'checkout', '')), '')::time,
    left(nullif(trim(coalesce(form ->> 'cancellation', '')), ''), 5000)
  ) returning id into new_unit_id;

  insert into public.unit_amenities (unit_id, amenity_code)
  select new_unit_id, catalog.code
  from public.amenity_catalog catalog
  where catalog.label = any(coalesce(draft_row.amenities, '{}'::text[]));

  insert into public.unit_policies (unit_id, policy_code, configuration)
  select
    new_unit_id,
    catalog.code,
    case catalog.code
      when 'quiet-hours' then jsonb_build_object('start', form ->> 'quietStart', 'end', form ->> 'quietEnd')
      when 'pets-allowed' then jsonb_build_object('max_pets', form ->> 'maxPets')
      when 'minimum-booking-age' then jsonb_build_object('minimum_age', form ->> 'minimumAge')
      else '{}'::jsonb
    end
  from public.policy_catalog catalog
  where catalog.label = any(coalesce(draft_row.policies, '{}'::text[]));

  rate_weeknight := public.money_text_to_cents(form ->> 'weeknight');
  rate_weekend := public.money_text_to_cents(form ->> 'weekend');
  insert into public.unit_rate_settings (unit_id, weeknight_cents, weekend_cents)
  values (new_unit_id, rate_weeknight, rate_weekend);

  fee_cleaning := public.money_text_to_cents(form ->> 'cleaning');
  fee_pet := public.money_text_to_cents(form ->> 'pet');
  fee_extra := public.money_text_to_cents(form ->> 'extraGuest');

  if fee_cleaning is not null and fee_cleaning > 0 then
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (new_unit_id, 'CLEANING', 'Cleaning fee', fee_cleaning, 'FLAT_PER_STAY');
  end if;
  if fee_pet is not null and fee_pet > 0 then
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (new_unit_id, 'PET', 'Pet fee', fee_pet, 'PER_PET_PER_STAY');
  end if;
  if fee_extra is not null and fee_extra > 0 then
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (new_unit_id, 'EXTRA_GUEST', 'Extra guest fee', fee_extra, 'PER_GUEST_PER_NIGHT');
  end if;

  update public.host_onboarding_drafts drafts
  set created_property_id = new_property_id,
      updated_at = now()
  where drafts.id = draft_row.id;

  update public.organizations organizations
  set status = case when organizations.status = 'ARCHIVED' then organizations.status else 'ACTIVE'::public.organization_status end,
      updated_at = now()
  where organizations.id = target_organization_id;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, metadata
  ) values (
    actor_id,
    'property.created_from_onboarding',
    'property',
    new_property_id,
    'Created first real property/listing from the saved host onboarding draft.',
    jsonb_build_object('organization_id', target_organization_id, 'unit_id', new_unit_id, 'slug', new_slug)
  );

  return query select new_property_id, new_unit_id, new_slug;
end;
$$;

create or replace function public.create_blank_property(
  target_organization_id uuid,
  property_name text,
  property_type text default null,
  public_area text default null
)
returns table (property_id uuid, unit_id uuid, slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  clean_name text := nullif(trim(coalesce(property_name, '')), '');
  new_property_id uuid;
  new_unit_id uuid;
  new_slug text;
  organization_email text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_organization(target_organization_id) then raise exception 'Organization owner or manager access required'; end if;
  if clean_name is null then raise exception 'Property name is required'; end if;

  if not exists (select 1 from public.properties properties where properties.organization_id = target_organization_id and properties.status <> 'ARCHIVED')
    and exists (select 1 from public.host_onboarding_drafts drafts where drafts.organization_id = target_organization_id and drafts.status = 'READY_FOR_PROPERTY' and drafts.created_property_id is null) then
    raise exception 'Create the first property from the saved onboarding setup before adding another property';
  end if;

  select organizations.contact_email into organization_email
  from public.organizations organizations
  where organizations.id = target_organization_id;

  insert into public.properties (
    organization_id, name, property_type, public_area, notification_email, operations_email, created_by
  ) values (
    target_organization_id, left(clean_name, 180), left(nullif(trim(property_type), ''), 80),
    left(nullif(trim(public_area), ''), 180), organization_email, organization_email, actor_id
  ) returning id into new_property_id;

  new_slug := public.unique_listing_slug(clean_name, null);
  insert into public.property_units (property_id, name, slug, is_primary)
  values (new_property_id, left(clean_name, 180), new_slug, true)
  returning id into new_unit_id;

  insert into public.unit_rate_settings (unit_id) values (new_unit_id);

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, reason, metadata)
  values (actor_id, 'property.created_blank', 'property', new_property_id, 'Created an additional draft property.', jsonb_build_object('organization_id', target_organization_id, 'unit_id', new_unit_id, 'slug', new_slug));

  return query select new_property_id, new_unit_id, new_slug;
end;
$$;

create or replace function public.save_property_listing(
  target_property_id uuid,
  listing_data jsonb,
  selected_amenities text[] default '{}'::text[],
  selected_policies text[] default '{}'::text[]
)
returns table (property_id uuid, slug text, status public.property_status, saved_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_property public.properties%rowtype;
  after_property public.properties%rowtype;
  unit_row public.property_units%rowtype;
  property_name text;
  requested_slug text;
  normalized_slug text;
  calendar_value public.calendar_source_preference;
  weeknight_value integer;
  weekend_value integer;
  cleaning_value integer;
  pet_value integer;
  extra_value integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(listing_data) <> 'object' then raise exception 'Invalid property payload'; end if;
  if octet_length(listing_data::text) > 70000 then raise exception 'Property payload is too large'; end if;
  if not public.can_manage_property(target_property_id) then raise exception 'Property owner or manager access required'; end if;

  select properties.* into before_property
  from public.properties properties
  where properties.id = target_property_id
  for update;

  select units.* into unit_row
  from public.property_units units
  where units.property_id = target_property_id and units.is_primary
  for update;

  if unit_row.id is null then raise exception 'Primary rentable unit not found'; end if;

  property_name := nullif(trim(coalesce(listing_data ->> 'name', '')), '');
  if property_name is null then raise exception 'Property name is required'; end if;

  requested_slug := coalesce(nullif(trim(listing_data ->> 'slug'), ''), property_name);
  normalized_slug := left(public.normalize_listing_slug(requested_slug), 96);
  if normalized_slug = '' then raise exception 'Listing URL is invalid'; end if;
  if normalized_slug in ('admin','api','auth','checkout','host','hosts','stays','trip','booking','support','settings') then
    raise exception 'That listing URL is reserved';
  end if;

  if lower(normalized_slug) <> lower(unit_row.slug) then
    if exists (select 1 from public.property_units units where lower(units.slug) = lower(normalized_slug) and units.id <> unit_row.id)
      or exists (select 1 from public.listing_slug_history history where lower(history.slug) = lower(normalized_slug)) then
      raise exception 'That listing URL is already in use';
    end if;

    insert into public.listing_slug_history (slug, unit_id)
    values (unit_row.slug, unit_row.id)
    on conflict (slug) do nothing;

    update public.property_units units
    set slug = left(normalized_slug, 96)
    where units.id = unit_row.id;
  end if;

  calendar_value := case upper(trim(coalesce(listing_data ->> 'calendarPreference', 'UNSET')))
    when 'ICAL' then 'ICAL'::public.calendar_source_preference
    when 'PMS' then 'PMS'::public.calendar_source_preference
    when 'NONE' then 'NONE'::public.calendar_source_preference
    else 'UNSET'::public.calendar_source_preference
  end;

  update public.properties properties
  set name = left(property_name, 180),
      description = left(nullif(trim(coalesce(listing_data ->> 'description', '')), ''), 10000),
      property_type = left(nullif(trim(coalesce(listing_data ->> 'propertyType', '')), ''), 80),
      public_area = left(nullif(trim(coalesce(listing_data ->> 'publicArea', '')), ''), 180),
      street_address = left(nullif(trim(coalesce(listing_data ->> 'street', '')), ''), 240),
      city = left(nullif(trim(coalesce(listing_data ->> 'city', '')), ''), 120),
      region_code = upper(left(nullif(trim(coalesce(listing_data ->> 'state', '')), ''), 40)),
      postal_code = left(nullif(trim(coalesce(listing_data ->> 'postal', '')), ''), 24),
      exact_address_public = coalesce((listing_data ->> 'exactAddressPublic')::boolean, false),
      notification_email = left(nullif(lower(trim(coalesce(listing_data ->> 'notificationEmail', ''))), ''), 320),
      operations_email = left(nullif(lower(trim(coalesce(listing_data ->> 'operationsEmail', ''))), ''), 320),
      calendar_preference = calendar_value,
      custom_amenities = left(nullif(trim(coalesce(listing_data ->> 'customAmenities', '')), ''), 5000),
      custom_policies = left(nullif(trim(coalesce(listing_data ->> 'customPolicies', '')), ''), 5000)
  where properties.id = target_property_id;

  update public.property_units units
  set name = left(property_name, 180),
      max_guests = public.safe_integer(listing_data ->> 'maxGuests'),
      bedrooms = public.safe_integer(listing_data ->> 'bedrooms'),
      beds = public.safe_integer(listing_data ->> 'beds'),
      bathrooms = public.safe_numeric(listing_data ->> 'bathrooms'),
      minimum_stay_nights = greatest(coalesce(public.safe_integer(listing_data ->> 'minStay'), 1), 1),
      check_in = nullif(trim(coalesce(listing_data ->> 'checkIn', '')), '')::time,
      checkout = nullif(trim(coalesce(listing_data ->> 'checkout', '')), '')::time,
      cancellation_policy = left(nullif(trim(coalesce(listing_data ->> 'cancellation', '')), ''), 5000)
  where units.id = unit_row.id;

  delete from public.unit_amenities amenities where amenities.unit_id = unit_row.id;
  insert into public.unit_amenities (unit_id, amenity_code)
  select unit_row.id, catalog.code
  from public.amenity_catalog catalog
  where catalog.label = any(coalesce(selected_amenities, '{}'::text[]));

  delete from public.unit_policies policies where policies.unit_id = unit_row.id;
  insert into public.unit_policies (unit_id, policy_code, configuration)
  select
    unit_row.id,
    catalog.code,
    case catalog.code
      when 'quiet-hours' then jsonb_build_object('start', listing_data ->> 'quietStart', 'end', listing_data ->> 'quietEnd')
      when 'pets-allowed' then jsonb_build_object('max_pets', listing_data ->> 'maxPets')
      when 'minimum-booking-age' then jsonb_build_object('minimum_age', listing_data ->> 'minimumAge')
      else '{}'::jsonb
    end
  from public.policy_catalog catalog
  where catalog.label = any(coalesce(selected_policies, '{}'::text[]));

  weeknight_value := public.money_text_to_cents(listing_data ->> 'weeknight');
  weekend_value := public.money_text_to_cents(listing_data ->> 'weekend');
  insert into public.unit_rate_settings (unit_id, weeknight_cents, weekend_cents)
  values (unit_row.id, weeknight_value, weekend_value)
  on conflict (unit_id) do update
    set weeknight_cents = excluded.weeknight_cents,
        weekend_cents = excluded.weekend_cents,
        updated_at = now();

  delete from public.unit_fees fees
  where fees.unit_id = unit_row.id and fees.fee_type in ('CLEANING','PET','EXTRA_GUEST');

  cleaning_value := public.money_text_to_cents(listing_data ->> 'cleaning');
  pet_value := public.money_text_to_cents(listing_data ->> 'pet');
  extra_value := public.money_text_to_cents(listing_data ->> 'extraGuest');

  if cleaning_value is not null and cleaning_value > 0 then
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (unit_row.id, 'CLEANING', 'Cleaning fee', cleaning_value, 'FLAT_PER_STAY');
  end if;
  if pet_value is not null and pet_value > 0 then
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (unit_row.id, 'PET', 'Pet fee', pet_value, 'PER_PET_PER_STAY');
  end if;
  if extra_value is not null and extra_value > 0 then
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (unit_row.id, 'EXTRA_GUEST', 'Extra guest fee', extra_value, 'PER_GUEST_PER_NIGHT');
  end if;

  select properties.* into after_property
  from public.properties properties
  where properties.id = target_property_id;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, before_state, after_state, metadata
  ) values (
    actor_id,
    'property.updated',
    'property',
    target_property_id,
    'Host saved property/listing details.',
    to_jsonb(before_property),
    to_jsonb(after_property),
    jsonb_build_object('unit_id', unit_row.id, 'slug', normalized_slug)
  );

  return query select after_property.id, normalized_slug, after_property.status, now();
end;
$$;


create or replace function public.archive_property(target_property_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_property public.properties%rowtype;
  after_property public.properties%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_property(target_property_id) then raise exception 'Property owner or manager access required'; end if;

  select properties.* into before_property from public.properties properties where properties.id = target_property_id for update;
  if not found then raise exception 'Property not found'; end if;

  update public.properties properties set status = 'ARCHIVED', updated_at = now() where properties.id = target_property_id returning * into after_property;
  update public.property_units units set is_active = false, updated_at = now() where units.property_id = target_property_id;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, reason, before_state, after_state, metadata)
  values (actor_id, 'property.archived', 'property', target_property_id, 'Host archived the property record.', to_jsonb(before_property), to_jsonb(after_property), jsonb_build_object('source', 'host_property_editor'));
end;
$$;

-- RLS: host members/admins may read their property data. Core mutations are
-- funneled through audited RPCs; photo rows/storage permit member CRUD.
alter table public.properties enable row level security;
alter table public.property_units enable row level security;
alter table public.listing_slug_history enable row level security;
alter table public.amenity_catalog enable row level security;
alter table public.unit_amenities enable row level security;
alter table public.policy_catalog enable row level security;
alter table public.unit_policies enable row level security;
alter table public.unit_rate_settings enable row level security;
alter table public.unit_fees enable row level security;
alter table public.property_images enable row level security;

create policy properties_select_member_or_admin on public.properties
for select to authenticated
using (public.is_organization_member(organization_id) or public.is_active_admin());

create policy property_units_select_member_or_admin on public.property_units
for select to authenticated
using (public.can_access_property(property_id));

create policy listing_slug_history_select_member_or_admin on public.listing_slug_history
for select to authenticated
using (public.can_access_unit(unit_id));

create policy amenity_catalog_select_authenticated on public.amenity_catalog
for select to authenticated using (true);

create policy unit_amenities_select_member_or_admin on public.unit_amenities
for select to authenticated using (public.can_access_unit(unit_id));

create policy policy_catalog_select_authenticated on public.policy_catalog
for select to authenticated using (true);

create policy unit_policies_select_member_or_admin on public.unit_policies
for select to authenticated using (public.can_access_unit(unit_id));

create policy unit_rates_select_member_or_admin on public.unit_rate_settings
for select to authenticated using (public.can_access_unit(unit_id));

create policy unit_fees_select_member_or_admin on public.unit_fees
for select to authenticated using (public.can_access_unit(unit_id));

create policy property_images_select_member_or_admin on public.property_images
for select to authenticated using (public.can_access_unit(unit_id));

create policy property_images_insert_manager on public.property_images
for insert to authenticated
with check (created_by = (select auth.uid()) and public.can_manage_unit(unit_id));

create policy property_images_update_manager on public.property_images
for update to authenticated
using (public.can_manage_unit(unit_id))
with check (public.can_manage_unit(unit_id));

create policy property_images_delete_manager on public.property_images
for delete to authenticated
using (public.can_manage_unit(unit_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-images',
  'property-images',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy property_storage_select_member_or_admin on storage.objects
for select to authenticated
using (
  bucket_id = 'property-images'
  and (
    public.is_active_admin()
    or public.is_organization_member(((storage.foldername(name))[1])::uuid)
  )
);

create policy property_storage_insert_manager on storage.objects
for insert to authenticated
with check (
  bucket_id = 'property-images'
  and public.can_manage_organization(((storage.foldername(name))[1])::uuid)
);

create policy property_storage_update_manager on storage.objects
for update to authenticated
using (
  bucket_id = 'property-images'
  and public.can_manage_organization(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'property-images'
  and public.can_manage_organization(((storage.foldername(name))[1])::uuid)
);

create policy property_storage_delete_manager on storage.objects
for delete to authenticated
using (
  bucket_id = 'property-images'
  and public.can_manage_organization(((storage.foldername(name))[1])::uuid)
);

-- Admin summary now includes real property count while bookings/payments stay 0/out of scope.
create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_active_admin() then raise exception 'Admin access required'; end if;

  select jsonb_build_object(
    'host_profiles', (
      select count(*) from public.profiles profiles
      where not exists (select 1 from public.admin_users admins where admins.profile_id = profiles.id)
        or exists (select 1 from public.organization_members members where members.profile_id = profiles.id)
    ),
    'organizations', (select count(*) from public.organizations),
    'properties', (select count(*) from public.properties where status <> 'ARCHIVED'),
    'partner_pending', (select count(*) from public.organizations where partner_status = 'PARTNER_PENDING'),
    'audit_events', (select count(*) from public.audit_logs)
  ) into result;

  return result;
end;
$$;

revoke all on function public.can_manage_organization(uuid) from public;
revoke all on function public.can_access_property(uuid) from public;
revoke all on function public.can_manage_property(uuid) from public;
revoke all on function public.can_access_unit(uuid) from public;
revoke all on function public.can_manage_unit(uuid) from public;
revoke all on function public.unique_listing_slug(text, uuid) from public;
revoke all on function public.create_property_from_onboarding(uuid) from public;
revoke all on function public.create_blank_property(uuid, text, text, text) from public;
revoke all on function public.save_property_listing(uuid, jsonb, text[], text[]) from public;
revoke all on function public.archive_property(uuid) from public;

grant execute on function public.can_manage_organization(uuid) to authenticated;
grant execute on function public.can_access_property(uuid) to authenticated;
grant execute on function public.can_manage_property(uuid) to authenticated;
grant execute on function public.can_access_unit(uuid) to authenticated;
grant execute on function public.can_manage_unit(uuid) to authenticated;
grant execute on function public.create_property_from_onboarding(uuid) to authenticated;
grant execute on function public.create_blank_property(uuid, text, text, text) to authenticated;
grant execute on function public.save_property_listing(uuid, jsonb, text[], text[]) to authenticated;
grant execute on function public.archive_property(uuid) to authenticated;

comment on table public.properties is
  'Host-managed property/location record. A property may contain multiple rentable units; Milestone 7 creates one primary unit initially.';
comment on table public.property_units is
  'Rentable listing/unit identity. Every unit has an immutable UUID plus stable current slug; old slugs remain in listing_slug_history.';
comment on table public.unit_rate_settings is
  'Host-entered listing rates only. Future booking creation snapshots actual nightly amounts and computes platform commission from lodging subtotal only.';
comment on table public.unit_fees is
  'Structured host fees kept separate from nightly lodging so legitimate cleaning/pet/add-on fees can remain outside the platform commission base.';
comment on function public.create_property_from_onboarding(uuid) is
  'Creates the first real property + primary rentable unit exactly once from a READY_FOR_PROPERTY onboarding draft.';
comment on function public.save_property_listing(uuid, jsonb, text[], text[]) is
  'Audited owner/manager save for the Step 7 property editor, including slug history, structured amenities/policies and basic rates/fees.';

commit;
