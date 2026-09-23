begin;

-- Host owners/managers need to maintain a listing after it is live. Keep
-- PENDING_REVIEW and APPROVED protected so an admin decision cannot be changed
-- underneath review, but allow normal editing for live and paused properties.
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
      and properties.status in (
        'DRAFT',
        'CHANGES_REQUESTED',
        'REJECTED',
        'PUBLISHED',
        'PAUSED'
      )
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

-- Property details have a single owner here. Operational pricing/fees are
-- deliberately NOT written by this RPC; those remain owned by Rates & fees.
create or replace function public.save_property_listing(
  target_property_id uuid,
  listing_data jsonb,
  selected_amenities text[] default '{}'::text[],
  selected_policies text[] default '{}'::text[]
)
returns table (
  property_id uuid,
  slug text,
  status public.property_status,
  saved_at timestamptz
)
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
  issues text[];
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(listing_data) <> 'object' then
    raise exception 'Invalid property payload';
  end if;

  if octet_length(listing_data::text) > 70000 then
    raise exception 'Property payload is too large';
  end if;

  if not public.can_manage_property(target_property_id) then
    raise exception 'Property owner or manager access required';
  end if;

  select properties.*
  into before_property
  from public.properties properties
  where properties.id = target_property_id
  for update;

  if not found then
    raise exception 'Property not found';
  end if;

  if before_property.status not in (
    'DRAFT',
    'CHANGES_REQUESTED',
    'REJECTED',
    'PUBLISHED',
    'PAUSED'
  ) then
    raise exception 'This listing is locked while under review or awaiting publication';
  end if;

  select units.*
  into unit_row
  from public.property_units units
  where units.property_id = target_property_id
    and units.is_primary
  for update;

  if unit_row.id is null then
    raise exception 'Primary rentable unit not found';
  end if;

  property_name := nullif(trim(coalesce(listing_data ->> 'name', '')), '');
  if property_name is null then
    raise exception 'Property name is required';
  end if;

  requested_slug :=
    coalesce(nullif(trim(listing_data ->> 'slug'), ''), property_name);
  normalized_slug := left(public.normalize_listing_slug(requested_slug), 96);

  if normalized_slug = '' then
    raise exception 'Listing URL is invalid';
  end if;

  if normalized_slug in (
    'admin','api','auth','checkout','host','hosts','stays',
    'trip','booking','support','settings'
  ) then
    raise exception 'That listing URL is reserved';
  end if;

  if lower(normalized_slug) <> lower(unit_row.slug) then
    if exists (
      select 1
      from public.property_units units
      where lower(units.slug) = lower(normalized_slug)
        and units.id <> unit_row.id
    ) or exists (
      select 1
      from public.listing_slug_history history
      where lower(history.slug) = lower(normalized_slug)
    ) then
      raise exception 'That listing URL is already in use';
    end if;

    insert into public.listing_slug_history (slug, unit_id)
    values (unit_row.slug, unit_row.id)
    on conflict (slug) do nothing;

    update public.property_units units
    set slug = normalized_slug,
        updated_at = now()
    where units.id = unit_row.id;
  end if;

  calendar_value :=
    case upper(trim(coalesce(listing_data ->> 'calendarPreference', 'UNSET')))
      when 'ICAL' then 'ICAL'::public.calendar_source_preference
      when 'PMS' then 'PMS'::public.calendar_source_preference
      when 'NONE' then 'NONE'::public.calendar_source_preference
      else 'UNSET'::public.calendar_source_preference
    end;

  update public.properties properties
  set
    name = left(property_name, 180),
    description = left(
      nullif(trim(coalesce(listing_data ->> 'description', '')), ''),
      10000
    ),
    property_type = left(
      nullif(trim(coalesce(listing_data ->> 'propertyType', '')), ''),
      80
    ),
    public_area = left(
      nullif(trim(coalesce(listing_data ->> 'publicArea', '')), ''),
      180
    ),
    street_address = left(
      nullif(trim(coalesce(listing_data ->> 'street', '')), ''),
      240
    ),
    city = left(
      nullif(trim(coalesce(listing_data ->> 'city', '')), ''),
      120
    ),
    region_code = upper(
      left(nullif(trim(coalesce(listing_data ->> 'state', '')), ''), 40)
    ),
    postal_code = left(
      nullif(trim(coalesce(listing_data ->> 'postal', '')), ''),
      24
    ),
    exact_address_public =
      coalesce((listing_data ->> 'exactAddressPublic')::boolean, false),
    notification_email = left(
      nullif(lower(trim(coalesce(listing_data ->> 'notificationEmail', ''))), ''),
      320
    ),
    operations_email = left(
      nullif(lower(trim(coalesce(listing_data ->> 'operationsEmail', ''))), ''),
      320
    ),
    calendar_preference = calendar_value,
    custom_amenities = left(
      nullif(trim(coalesce(listing_data ->> 'customAmenities', '')), ''),
      5000
    ),
    custom_policies = left(
      nullif(trim(coalesce(listing_data ->> 'customPolicies', '')), ''),
      5000
    ),
    updated_at = now()
  where properties.id = target_property_id;

  update public.property_units units
  set
    name = left(property_name, 180),
    max_guests = public.safe_integer(listing_data ->> 'maxGuests'),
    bedrooms = public.safe_integer(listing_data ->> 'bedrooms'),
    beds = public.safe_integer(listing_data ->> 'beds'),
    bathrooms = public.safe_numeric(listing_data ->> 'bathrooms'),
    minimum_stay_nights = greatest(
      coalesce(public.safe_integer(listing_data ->> 'minStay'), 1),
      1
    ),
    check_in =
      nullif(trim(coalesce(listing_data ->> 'checkIn', '')), '')::time,
    checkout =
      nullif(trim(coalesce(listing_data ->> 'checkout', '')), '')::time,
    cancellation_policy = left(
      nullif(trim(coalesce(listing_data ->> 'cancellation', '')), ''),
      5000
    ),
    updated_at = now()
  where units.id = unit_row.id;

  delete from public.unit_amenities amenities
  where amenities.unit_id = unit_row.id;

  insert into public.unit_amenities (unit_id, amenity_code)
  select unit_row.id, catalog.code
  from public.amenity_catalog catalog
  where catalog.label = any(coalesce(selected_amenities, '{}'::text[]));

  delete from public.unit_policies policies
  where policies.unit_id = unit_row.id;

  insert into public.unit_policies (unit_id, policy_code, configuration)
  select
    unit_row.id,
    catalog.code,
    case catalog.code
      when 'quiet-hours' then jsonb_build_object(
        'start', listing_data ->> 'quietStart',
        'end', listing_data ->> 'quietEnd'
      )
      when 'pets-allowed' then jsonb_build_object(
        'max_pets', listing_data ->> 'maxPets'
      )
      when 'minimum-booking-age' then jsonb_build_object(
        'minimum_age', listing_data ->> 'minimumAge'
      )
      else '{}'::jsonb
    end
  from public.policy_catalog catalog
  where catalog.label = any(coalesce(selected_policies, '{}'::text[]));

  -- A live property must remain minimally guest-ready. If a host attempts to
  -- clear a required field, the exception rolls the whole save back.
  if before_property.status = 'PUBLISHED' then
    issues := public.property_submission_issues(target_property_id);

    if cardinality(issues) > 0 then
      raise exception
        'Published listings must remain booking-ready. Fix: %',
        array_to_string(issues, ', ');
    end if;
  end if;

  select properties.*
  into after_property
  from public.properties properties
  where properties.id = target_property_id;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    before_state,
    after_state,
    metadata
  ) values (
    actor_id,
    case
      when before_property.status = 'PUBLISHED'
        then 'property.live_updated'
      when before_property.status = 'PAUSED'
        then 'property.paused_updated'
      else 'property.updated'
    end,
    'property',
    target_property_id,
    case
      when before_property.status = 'PUBLISHED'
        then 'Host updated a live property/listing record.'
      when before_property.status = 'PAUSED'
        then 'Host updated a paused property/listing record.'
      else 'Host saved property/listing details.'
    end,
    to_jsonb(before_property),
    to_jsonb(after_property),
    jsonb_build_object(
      'unit_id', unit_row.id,
      'slug', normalized_slug,
      'status_preserved', before_property.status,
      'pricing_mutated', false
    )
  );

  return query
  select
    after_property.id,
    normalized_slug,
    after_property.status,
    now();
end;
$$;

-- Prevent a published listing from losing its final public photo. The host can
-- upload a replacement first and then remove the old one.
create or replace function public.prevent_published_property_last_image_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  property_status public.property_status;
  image_count integer;
begin
  select properties.status
  into property_status
  from public.property_units units
  join public.properties properties
    on properties.id = units.property_id
  where units.id = old.unit_id;

  if property_status = 'PUBLISHED' then
    select count(*)
    into image_count
    from public.property_images images
    where images.unit_id = old.unit_id;

    if image_count <= 1 then
      raise exception 'Published listings must keep at least one property photo';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists property_images_keep_last_published_photo
on public.property_images;

create trigger property_images_keep_last_published_photo
before delete on public.property_images
for each row
execute function public.prevent_published_property_last_image_delete();

revoke all on function public.can_edit_property(uuid) from public;
revoke all on function public.can_edit_unit(uuid) from public;
revoke all on function public.prevent_published_property_last_image_delete()
from public;

grant execute on function public.can_edit_property(uuid) to authenticated;
grant execute on function public.can_edit_unit(uuid) to authenticated;

comment on function public.can_edit_property(uuid) is
  'Host/admin edit eligibility. Published and paused listings remain editable; active review and approved-awaiting-publication states remain protected.';

comment on function public.save_property_listing(uuid,jsonb,text[],text[]) is
  'Saves host-owned listing details without mutating operational pricing/fees. Live listings remain published and edits are audit logged.';

commit;
