-- Find A Place Booking
-- Milestone 8B: property review, approval and publication foundation
--
-- Run after 20260909000900_add_changes_requested_status.sql. Adds host
-- submission, admin review/change requests/approval/publication, append-only
-- review history, safe public listing RPCs and public image signing for
-- PUBLISHED inventory only. Booking, availability, payment and tax systems
-- remain intentionally disconnected.

begin;

alter table public.properties
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists published_by uuid references public.profiles(id) on delete set null;

create table if not exists public.property_review_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in (
    'SUBMITTED',
    'CHANGES_REQUESTED',
    'APPROVED',
    'REJECTED',
    'PUBLISHED',
    'PAUSED'
  )),
  from_status public.property_status,
  to_status public.property_status not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists property_review_events_property_idx
  on public.property_review_events(property_id, created_at desc);

alter table public.property_review_events enable row level security;

create policy property_review_events_select_member_or_admin
on public.property_review_events
for select to authenticated
using (public.can_access_property(property_id));

create or replace function public.prevent_property_review_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'property_review_events are append-only';
end;
$$;

drop trigger if exists property_review_events_prevent_update on public.property_review_events;
create trigger property_review_events_prevent_update
before update on public.property_review_events
for each row execute function public.prevent_property_review_event_mutation();

drop trigger if exists property_review_events_prevent_delete on public.property_review_events;
create trigger property_review_events_prevent_delete
before delete on public.property_review_events
for each row execute function public.prevent_property_review_event_mutation();

create or replace function public.can_edit_property(target_property_id uuid)
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
      and properties.status in ('DRAFT', 'CHANGES_REQUESTED', 'REJECTED')
      and public.can_manage_organization(properties.organization_id)
  );
$$;

create or replace function public.can_edit_unit(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.property_units units
    where units.id = target_unit_id
      and public.can_edit_property(units.property_id)
  );
$$;

create or replace function public.property_submission_issues(target_property_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  issues text[] := '{}'::text[];
  property_row public.properties%rowtype;
  unit_row public.property_units%rowtype;
  rate_row public.unit_rate_settings%rowtype;
  image_count integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.can_access_property(target_property_id) then raise exception 'Property access required'; end if;

  select properties.* into property_row
  from public.properties properties
  where properties.id = target_property_id;
  if not found then raise exception 'Property not found'; end if;

  select units.* into unit_row
  from public.property_units units
  where units.property_id = target_property_id and units.is_primary;

  if nullif(trim(coalesce(property_row.name, '')), '') is null then issues := array_append(issues, 'Property name'); end if;
  if nullif(trim(coalesce(property_row.description, '')), '') is null then issues := array_append(issues, 'Description'); end if;
  if nullif(trim(coalesce(property_row.property_type, '')), '') is null then issues := array_append(issues, 'Property type'); end if;
  if nullif(trim(coalesce(property_row.public_area, property_row.city, '')), '') is null then issues := array_append(issues, 'Public area or city'); end if;
  if nullif(trim(coalesce(property_row.region_code, '')), '') is null then issues := array_append(issues, 'State / region'); end if;

  if unit_row.id is null then
    issues := array_append(issues, 'Primary rentable unit');
    return issues;
  end if;

  if not unit_row.is_active then issues := array_append(issues, 'Active rentable unit'); end if;
  if unit_row.max_guests is null or unit_row.max_guests < 1 then issues := array_append(issues, 'Maximum guests'); end if;

  select rates.* into rate_row
  from public.unit_rate_settings rates
  where rates.unit_id = unit_row.id;
  if rate_row.weeknight_cents is null or rate_row.weeknight_cents < 1 then issues := array_append(issues, 'Weeknight rate'); end if;

  select count(*) into image_count
  from public.property_images images
  where images.unit_id = unit_row.id;
  if image_count < 1 then issues := array_append(issues, 'At least one property photo'); end if;

  return issues;
end;
$$;

create or replace function public.submit_property_for_review(target_property_id uuid)
returns table (property_id uuid, status public.property_status, submitted_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.properties%rowtype;
  after_row public.properties%rowtype;
  issues text[];
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_property(target_property_id) then raise exception 'Property owner or manager access required'; end if;

  select properties.* into before_row
  from public.properties properties
  where properties.id = target_property_id
  for update;
  if not found then raise exception 'Property not found'; end if;

  if before_row.status not in ('DRAFT', 'CHANGES_REQUESTED', 'REJECTED') then
    raise exception 'Only draft or returned listings can be submitted for review';
  end if;

  issues := public.property_submission_issues(target_property_id);
  if cardinality(issues) > 0 then
    raise exception 'Property is not ready for review: %', array_to_string(issues, ', ');
  end if;

  update public.properties properties
  set status = 'PENDING_REVIEW',
      submitted_at = now(),
      reviewed_by = null,
      reviewed_at = null,
      review_note = null,
      updated_at = now()
  where properties.id = target_property_id
  returning * into after_row;

  insert into public.property_review_events (
    property_id, actor_profile_id, event_type, from_status, to_status, note
  ) values (
    target_property_id, actor_id, 'SUBMITTED', before_row.status, after_row.status, 'Host submitted listing for review.'
  );

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, before_state, after_state, metadata
  ) values (
    actor_id,
    'property.review.submitted',
    'property',
    target_property_id,
    'Host submitted listing for review.',
    to_jsonb(before_row),
    to_jsonb(after_row),
    jsonb_build_object('source', 'host_property_editor')
  );

  return query select after_row.id, after_row.status, after_row.submitted_at;
end;
$$;

create or replace function public.admin_review_property(
  target_property_id uuid,
  decision text,
  review_note text default null
)
returns table (property_id uuid, status public.property_status, reviewed_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.properties%rowtype;
  after_row public.properties%rowtype;
  normalized_decision text := lower(trim(coalesce(decision, '')));
  cleaned_note text := nullif(trim(coalesce(review_note, '')), '');
  next_status public.property_status;
  event_name text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.admin_has_any_role(array['SUPER_ADMIN', 'OPERATIONS_ADMIN']::public.admin_role[]) then
    raise exception 'Property review role required';
  end if;

  select properties.* into before_row
  from public.properties properties
  where properties.id = target_property_id
  for update;
  if not found then raise exception 'Property not found'; end if;
  if before_row.status <> 'PENDING_REVIEW' then raise exception 'Property is not pending review'; end if;

  if normalized_decision = 'request_changes' then
    if cleaned_note is null then raise exception 'A change-request note is required'; end if;
    next_status := 'CHANGES_REQUESTED';
    event_name := 'CHANGES_REQUESTED';
  elsif normalized_decision = 'approve' then
    next_status := 'APPROVED';
    event_name := 'APPROVED';
  elsif normalized_decision = 'reject' then
    if cleaned_note is null then raise exception 'A rejection note is required'; end if;
    next_status := 'REJECTED';
    event_name := 'REJECTED';
  else
    raise exception 'Invalid property review decision';
  end if;

  update public.properties properties
  set status = next_status,
      reviewed_by = actor_id,
      reviewed_at = now(),
      review_note = cleaned_note,
      approved_by = case when next_status = 'APPROVED' then actor_id else null end,
      approved_at = case when next_status = 'APPROVED' then now() else null end,
      updated_at = now()
  where properties.id = target_property_id
  returning * into after_row;

  insert into public.property_review_events (
    property_id, actor_profile_id, event_type, from_status, to_status, note
  ) values (
    target_property_id, actor_id, event_name, before_row.status, after_row.status, cleaned_note
  );

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, before_state, after_state, metadata
  ) values (
    actor_id,
    case normalized_decision
      when 'request_changes' then 'property.review.changes_requested'
      when 'approve' then 'property.review.approved'
      else 'property.review.rejected'
    end,
    'property',
    target_property_id,
    cleaned_note,
    to_jsonb(before_row),
    to_jsonb(after_row),
    jsonb_build_object('source', 'admin_property_review')
  );

  return query select after_row.id, after_row.status, after_row.reviewed_at;
end;
$$;

create or replace function public.admin_set_property_publication(
  target_property_id uuid,
  publish boolean,
  publication_note text default null
)
returns table (property_id uuid, status public.property_status, published_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.properties%rowtype;
  after_row public.properties%rowtype;
  cleaned_note text := nullif(trim(coalesce(publication_note, '')), '');
  event_name text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.admin_has_any_role(array['SUPER_ADMIN', 'OPERATIONS_ADMIN']::public.admin_role[]) then
    raise exception 'Property publication role required';
  end if;

  select properties.* into before_row
  from public.properties properties
  where properties.id = target_property_id
  for update;
  if not found then raise exception 'Property not found'; end if;

  if publish then
    if before_row.status not in ('APPROVED', 'PAUSED') then raise exception 'Only approved or paused properties can be published'; end if;
    update public.properties properties
    set status = 'PUBLISHED', published_at = now(), published_by = actor_id, updated_at = now()
    where properties.id = target_property_id returning * into after_row;
    event_name := 'PUBLISHED';
  else
    if before_row.status <> 'PUBLISHED' then raise exception 'Only published properties can be paused'; end if;
    update public.properties properties
    set status = 'PAUSED', updated_at = now()
    where properties.id = target_property_id returning * into after_row;
    event_name := 'PAUSED';
  end if;

  insert into public.property_review_events (
    property_id, actor_profile_id, event_type, from_status, to_status, note
  ) values (
    target_property_id, actor_id, event_name, before_row.status, after_row.status, cleaned_note
  );

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, before_state, after_state, metadata
  ) values (
    actor_id,
    case when publish then 'property.publication.published' else 'property.publication.paused' end,
    'property',
    target_property_id,
    cleaned_note,
    to_jsonb(before_row),
    to_jsonb(after_row),
    jsonb_build_object('source', 'admin_property_review')
  );

  return query select after_row.id, after_row.status, after_row.published_at;
end;
$$;

create or replace function public.is_public_property(target_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.properties properties
    where properties.id = target_property_id
      and properties.status = 'PUBLISHED'
  );
$$;

create or replace function public.public_listing_index()
returns table (
  property_id uuid,
  unit_id uuid,
  slug text,
  name text,
  description text,
  property_type text,
  public_area text,
  city text,
  region_code text,
  max_guests integer,
  bedrooms integer,
  bathrooms numeric,
  weeknight_cents integer,
  weekend_cents integer,
  host_name text,
  amenity_labels text[],
  image_paths text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    properties.id,
    units.id,
    units.slug,
    properties.name,
    properties.description,
    properties.property_type,
    properties.public_area,
    properties.city,
    properties.region_code,
    units.max_guests,
    units.bedrooms,
    units.bathrooms,
    rates.weeknight_cents,
    rates.weekend_cents,
    organizations.name,
    coalesce((
      select array_agg(catalog.label order by catalog.label)
      from public.unit_amenities selected
      join public.amenity_catalog catalog on catalog.code = selected.amenity_code
      where selected.unit_id = units.id
    ), '{}'::text[]),
    coalesce((
      select array_agg(images.storage_path order by images.sort_order, images.created_at)
      from public.property_images images
      where images.unit_id = units.id
    ), '{}'::text[])
  from public.properties properties
  join public.organizations organizations on organizations.id = properties.organization_id
  join public.property_units units on units.property_id = properties.id and units.is_primary and units.is_active
  left join public.unit_rate_settings rates on rates.unit_id = units.id
  where properties.status = 'PUBLISHED'
  order by properties.published_at desc nulls last, properties.updated_at desc;
$$;

create or replace function public.public_listing_detail(requested_slug text)
returns table (
  property_id uuid,
  unit_id uuid,
  canonical_slug text,
  requested_is_history boolean,
  name text,
  description text,
  property_type text,
  public_area text,
  city text,
  region_code text,
  public_address text,
  max_guests integer,
  bedrooms integer,
  beds integer,
  bathrooms numeric,
  minimum_stay_nights integer,
  check_in time,
  checkout time,
  cancellation_policy text,
  weeknight_cents integer,
  weekend_cents integer,
  host_name text,
  amenity_labels text[],
  policy_labels text[],
  custom_amenities text,
  custom_policies text,
  image_paths text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized text := public.normalize_listing_slug(requested_slug);
  resolved_unit_id uuid;
  history_match boolean := false;
begin
  select units.id into resolved_unit_id
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where lower(units.slug) = lower(normalized)
    and units.is_active
    and properties.status = 'PUBLISHED'
  limit 1;

  if resolved_unit_id is null then
    select history.unit_id into resolved_unit_id
    from public.listing_slug_history history
    join public.property_units units on units.id = history.unit_id and units.is_active
    join public.properties properties on properties.id = units.property_id
    where lower(history.slug) = lower(normalized)
      and properties.status = 'PUBLISHED'
    limit 1;
    history_match := resolved_unit_id is not null;
  end if;

  if resolved_unit_id is null then return; end if;

  return query
  select
    properties.id,
    units.id,
    units.slug,
    history_match,
    properties.name,
    properties.description,
    properties.property_type,
    properties.public_area,
    properties.city,
    properties.region_code,
    case when properties.exact_address_public then concat_ws(', ', properties.street_address, properties.city, properties.region_code, properties.postal_code)
      else coalesce(properties.public_area, concat_ws(', ', properties.city, properties.region_code)) end,
    units.max_guests,
    units.bedrooms,
    units.beds,
    units.bathrooms,
    units.minimum_stay_nights,
    units.check_in,
    units.checkout,
    units.cancellation_policy,
    rates.weeknight_cents,
    rates.weekend_cents,
    organizations.name,
    coalesce((
      select array_agg(catalog.label order by catalog.label)
      from public.unit_amenities selected
      join public.amenity_catalog catalog on catalog.code = selected.amenity_code
      where selected.unit_id = units.id
    ), '{}'::text[]),
    coalesce((
      select array_agg(catalog.label order by catalog.label)
      from public.unit_policies selected
      join public.policy_catalog catalog on catalog.code = selected.policy_code
      where selected.unit_id = units.id
    ), '{}'::text[]),
    properties.custom_amenities,
    properties.custom_policies,
    coalesce((
      select array_agg(images.storage_path order by images.sort_order, images.created_at)
      from public.property_images images
      where images.unit_id = units.id
    ), '{}'::text[])
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  join public.organizations organizations on organizations.id = properties.organization_id
  left join public.unit_rate_settings rates on rates.unit_id = units.id
  where units.id = resolved_unit_id
    and units.is_active
    and properties.status = 'PUBLISHED';
end;
$$;

-- Harden the existing host save RPC so review/published records cannot be
-- silently changed underneath an admin decision or live guest-facing listing.
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
  if not found then raise exception 'Property not found'; end if;

  if before_property.status not in ('DRAFT', 'CHANGES_REQUESTED', 'REJECTED') then
    raise exception 'This listing is locked while under review, approved or published';
  end if;

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
  select unit_row.id, catalog.code,
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

-- Hosts may archive only while the listing is in an editable, non-live state.
-- Pending review, approved, published and paused records must first move through
-- the review/publication workflow so a live listing cannot disappear outside it.
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

  select properties.* into before_property
  from public.properties properties
  where properties.id = target_property_id
  for update;
  if not found then raise exception 'Property not found'; end if;

  if before_property.status not in ('DRAFT', 'CHANGES_REQUESTED', 'REJECTED') then
    raise exception 'Only editable draft or returned listings can be archived by the host';
  end if;

  update public.properties properties
  set status = 'ARCHIVED', updated_at = now()
  where properties.id = target_property_id
  returning * into after_property;

  update public.property_units units
  set is_active = false, updated_at = now()
  where units.property_id = target_property_id;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, before_state, after_state, metadata
  ) values (
    actor_id,
    'property.archived',
    'property',
    target_property_id,
    'Host archived an editable property record.',
    to_jsonb(before_property),
    to_jsonb(after_property),
    jsonb_build_object('source', 'host_property_editor')
  );
end;
$$;

-- Lock direct image mutation to editable host states as well.
drop policy if exists property_images_insert_manager on public.property_images;
drop policy if exists property_images_update_manager on public.property_images;
drop policy if exists property_images_delete_manager on public.property_images;

create policy property_images_insert_editable_manager on public.property_images
for insert to authenticated
with check (public.can_edit_unit(unit_id));

create policy property_images_update_editable_manager on public.property_images
for update to authenticated
using (public.can_edit_unit(unit_id))
with check (public.can_edit_unit(unit_id));

create policy property_images_delete_editable_manager on public.property_images
for delete to authenticated
using (public.can_edit_unit(unit_id));

drop policy if exists property_storage_insert_manager on storage.objects;
drop policy if exists property_storage_update_manager on storage.objects;
drop policy if exists property_storage_delete_manager on storage.objects;

create policy property_storage_insert_editable_manager on storage.objects
for insert to authenticated
with check (
  bucket_id = 'property-images'
  and public.can_edit_property(((storage.foldername(name))[2])::uuid)
);

create policy property_storage_update_editable_manager on storage.objects
for update to authenticated
using (
  bucket_id = 'property-images'
  and public.can_edit_property(((storage.foldername(name))[2])::uuid)
)
with check (
  bucket_id = 'property-images'
  and public.can_edit_property(((storage.foldername(name))[2])::uuid)
);

create policy property_storage_delete_editable_manager on storage.objects
for delete to authenticated
using (
  bucket_id = 'property-images'
  and public.can_edit_property(((storage.foldername(name))[2])::uuid)
);

-- Admin overview now exposes the new review/publication queue without
-- inventing any booking/payment metrics.
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
    'property_pending_review', (select count(*) from public.properties where status = 'PENDING_REVIEW'),
    'property_published', (select count(*) from public.properties where status = 'PUBLISHED'),
    'partner_pending', (select count(*) from public.organizations where partner_status = 'PARTNER_PENDING'),
    'audit_events', (select count(*) from public.audit_logs)
  ) into result;

  return result;
end;
$$;

-- Signed public image URLs remain possible only for an actually PUBLISHED
-- property. Draft/private photo objects keep the existing authenticated-only policy.
create policy property_storage_select_published
on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'property-images'
  and public.is_public_property(((storage.foldername(name))[2])::uuid)
);

revoke all on function public.can_edit_property(uuid) from public;
revoke all on function public.can_edit_unit(uuid) from public;
revoke all on function public.property_submission_issues(uuid) from public;
revoke all on function public.submit_property_for_review(uuid) from public;
revoke all on function public.admin_review_property(uuid, text, text) from public;
revoke all on function public.admin_set_property_publication(uuid, boolean, text) from public;
revoke all on function public.is_public_property(uuid) from public;
revoke all on function public.public_listing_index() from public;
revoke all on function public.public_listing_detail(text) from public;

-- Authenticated hosts/admins get the internal workflows.
grant execute on function public.can_edit_property(uuid) to authenticated;
grant execute on function public.can_edit_unit(uuid) to authenticated;
grant execute on function public.property_submission_issues(uuid) to authenticated;
grant execute on function public.submit_property_for_review(uuid) to authenticated;
grant execute on function public.admin_review_property(uuid, text, text) to authenticated;
grant execute on function public.admin_set_property_publication(uuid, boolean, text) to authenticated;

-- Public listing/read helpers return only deliberately guest-safe fields.
grant execute on function public.is_public_property(uuid) to anon, authenticated;
grant execute on function public.public_listing_index() to anon, authenticated;
grant execute on function public.public_listing_detail(text) to anon, authenticated;

comment on table public.property_review_events is
  'Append-only host/admin property review and publication timeline. Guest-facing listing data is exposed only through safe public RPCs.';

comment on function public.public_listing_index() is
  'Guest-safe published listing catalog. Does not expose exact private address, notification emails or internal host data.';

commit;
