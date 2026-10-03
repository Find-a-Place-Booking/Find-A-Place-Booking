-- Production migration already applied on 2026-10-03.
-- Makes calendar readiness part of the normal publication-readiness list and
-- gives generic duplicate iCal labels provider-specific names.

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
  cancellation_text text;
  healthy_calendar_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_access_property(target_property_id) then
    raise exception 'Property access required';
  end if;

  select properties.*
  into property_row
  from public.properties properties
  where properties.id = target_property_id;

  if not found then
    raise exception 'Property not found';
  end if;

  select units.*
  into unit_row
  from public.property_units units
  where units.property_id = target_property_id
    and units.is_primary;

  if nullif(trim(coalesce(property_row.name, '')), '') is null then
    issues := array_append(issues, 'Property name');
  end if;
  if nullif(trim(coalesce(property_row.description, '')), '') is null then
    issues := array_append(issues, 'Description');
  end if;
  if nullif(trim(coalesce(property_row.property_type, '')), '') is null then
    issues := array_append(issues, 'Property type');
  end if;
  if nullif(trim(coalesce(property_row.public_area, property_row.city, '')), '') is null then
    issues := array_append(issues, 'Public area or city');
  end if;
  if nullif(trim(coalesce(property_row.region_code, '')), '') is null then
    issues := array_append(issues, 'State / region');
  end if;

  if unit_row.id is null then
    issues := array_append(issues, 'Primary rentable unit');
    return issues;
  end if;

  if not unit_row.is_active then
    issues := array_append(issues, 'Active rentable unit');
  end if;
  if unit_row.max_guests is null or unit_row.max_guests < 1 then
    issues := array_append(issues, 'Maximum guests');
  end if;

  cancellation_text := lower(trim(coalesce(unit_row.cancellation_policy, '')));
  if cancellation_text = ''
     or cancellation_text in ('flexible','moderate','firm','strict')
     or char_length(cancellation_text) < 20 then
    issues := array_append(
      issues,
      'Specific cancellation/refund terms (not just a policy label)'
    );
  end if;

  select rates.*
  into rate_row
  from public.unit_rate_settings rates
  where rates.unit_id = unit_row.id;

  if rate_row.weeknight_cents is null or rate_row.weeknight_cents < 1 then
    issues := array_append(issues, 'Weeknight rate');
  end if;

  select count(*)
  into image_count
  from public.property_images images
  where images.unit_id = unit_row.id;

  if image_count < 1 then
    issues := array_append(issues, 'At least one property photo');
  end if;

  if property_row.calendar_preference = 'UNSET' then
    issues := array_append(
      issues,
      'Availability setup: choose iCal, PMS / channel manager, or Find A Place only'
    );
  elsif property_row.calendar_preference = 'ICAL' then
    select count(*)
    into healthy_calendar_count
    from public.calendar_connections connections
    where connections.unit_id = unit_row.id
      and connections.is_active
      and connections.connection_kind = 'ICAL'
      and connections.sync_status = 'HEALTHY'
      and connections.last_success_at is not null;

    if healthy_calendar_count < 1 then
      issues := array_append(
        issues,
        'Availability setup: connect and successfully sync at least one iCal calendar'
      );
    end if;
  elsif property_row.calendar_preference = 'PMS' then
    select count(*)
    into healthy_calendar_count
    from public.calendar_connections connections
    where connections.unit_id = unit_row.id
      and connections.is_active
      and connections.connection_kind in ('PMS_API', 'BROWSER_WORKER')
      and connections.sync_status = 'HEALTHY'
      and connections.last_success_at is not null;

    if healthy_calendar_count < 1 then
      issues := array_append(
        issues,
        'Availability setup: connect and successfully sync the PMS / channel manager'
      );
    end if;
  end if;

  return issues;
end;
$$;

create or replace function public.create_ical_connection(
  target_unit_id uuid,
  provider_name text,
  connection_label text,
  source_url text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  provider_value text := upper(regexp_replace(trim(coalesce(provider_name, 'OTHER_ICAL')), '[^A-Za-z0-9_]+', '_', 'g'));
  label_value text := left(nullif(trim(coalesce(connection_label, '')), ''), 120);
  url_value text := left(nullif(trim(coalesce(source_url, '')), ''), 2000);
  provider_label text;
  generated_label text;
  provider_count integer := 0;
  result_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_calendar(target_unit_id) then raise exception 'Calendar manager access required'; end if;
  if provider_value = '' then provider_value := 'OTHER_ICAL'; end if;

  provider_label := case provider_value
    when 'AIRBNB' then 'Airbnb'
    when 'VRBO' then 'Vrbo'
    when 'BOOKING_COM' then 'Booking.com'
    when 'GOOGLE' then 'Google Calendar'
    when 'LODGIFY' then 'Lodgify'
    when 'OWNEREZ' then 'OwnerRez'
    when 'GUESTY' then 'Guesty'
    when 'HOSTIFY' then 'Hostify'
    else 'iCal'
  end;

  if label_value is null
     or lower(label_value) in ('main calendar', 'calendar', 'ical calendar', 'main') then
    select count(*)
    into provider_count
    from public.calendar_connections connections
    where connections.unit_id = target_unit_id
      and connections.is_active
      and connections.connection_kind = 'ICAL'
      and connections.provider = left(provider_value, 40);

    generated_label := provider_label || ' calendar';
    if provider_count > 0 then
      generated_label := generated_label || ' ' || (provider_count + 1)::text;
    end if;
    label_value := left(generated_label, 120);
  end if;

  if url_value is null or url_value !~* '^https://' then
    raise exception 'A secure HTTPS iCal feed URL is required';
  end if;

  if exists (
    select 1
    from public.calendar_connections connections
    where connections.is_active
      and connections.feed_url = url_value
  ) then
    raise exception 'That calendar feed is already connected to a rentable unit';
  end if;

  insert into public.calendar_connections (
    unit_id, provider, connection_kind, label, feed_url, created_by
  ) values (
    target_unit_id, left(provider_value, 40), 'ICAL', label_value, url_value, actor_id
  )
  returning id into result_id;

  perform public.ensure_calendar_export_token(target_unit_id, result_id);

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, metadata
  ) values (
    actor_id,
    'calendar.connection.created',
    'calendar_connection',
    result_id,
    'Host connected an external iCal availability source.',
    jsonb_build_object(
      'unit_id', target_unit_id,
      'provider', provider_value,
      'label', label_value
    )
  );

  return result_id;
end;
$$;

with duplicate_generic as (
  select
    connections.id,
    connections.unit_id,
    connections.provider,
    row_number() over (
      partition by connections.unit_id, connections.provider
      order by connections.created_at, connections.id
    ) as provider_sequence
  from public.calendar_connections connections
  where connections.is_active
    and connections.connection_kind = 'ICAL'
    and lower(trim(connections.label)) in ('main calendar', 'calendar', 'ical calendar', 'main')
    and exists (
      select 1
      from public.calendar_connections other
      where other.unit_id = connections.unit_id
        and other.id <> connections.id
        and other.is_active
        and other.connection_kind = 'ICAL'
        and lower(trim(other.label)) = lower(trim(connections.label))
    )
)
update public.calendar_connections connections
set label =
  case duplicate_generic.provider
    when 'AIRBNB' then 'Airbnb calendar'
    when 'VRBO' then 'Vrbo calendar'
    when 'BOOKING_COM' then 'Booking.com calendar'
    when 'GOOGLE' then 'Google Calendar'
    when 'LODGIFY' then 'Lodgify calendar'
    when 'OWNEREZ' then 'OwnerRez calendar'
    when 'GUESTY' then 'Guesty calendar'
    when 'HOSTIFY' then 'Hostify calendar'
    else 'iCal calendar'
  end ||
  case
    when duplicate_generic.provider_sequence > 1
      then ' ' || duplicate_generic.provider_sequence::text
    else ''
  end,
  updated_at = now()
from duplicate_generic
where connections.id = duplicate_generic.id;
