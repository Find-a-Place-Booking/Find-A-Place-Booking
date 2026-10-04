-- REFERENCE COPY ONLY.
-- These production changes were already applied on 2026-10-03.
-- Keep this file with the overlay so the repository has a record of the
-- database contract used by the onboarding bed-type quantity UI.

alter table public.property_units
  add column if not exists bed_configuration jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'property_units_bed_configuration_array'
      and conrelid = 'public.property_units'::regclass
  ) then
    alter table public.property_units
      add constraint property_units_bed_configuration_array
      check (jsonb_typeof(bed_configuration) = 'array');
  end if;
end
$$;

create or replace function public.normalize_bed_configuration(raw_config jsonb)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  bed_type text;
  bed_count integer;
  result jsonb := '[]'::jsonb;
  seen text[] := '{}'::text[];
  allowed constant text[] := array[
    'King','Queen','Full / double','Twin / single','Bunk bed','Sofa bed',
    'Futon','Murphy bed','Crib'
  ];
begin
  if raw_config is null then return '[]'::jsonb; end if;
  if jsonb_typeof(raw_config) <> 'array' then
    raise exception 'Bed configuration must be a list';
  end if;
  if jsonb_array_length(raw_config) > 12 then
    raise exception 'Too many bed types';
  end if;

  for item in select value from jsonb_array_elements(raw_config)
  loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Each bed configuration entry must be an object';
    end if;

    bed_type := trim(coalesce(item ->> 'type', ''));
    if bed_type = '' or not (bed_type = any(allowed)) then
      raise exception 'Unsupported bed type: %', bed_type;
    end if;
    if bed_type = any(seen) then
      raise exception 'Each bed type can only be listed once';
    end if;

    begin
      bed_count := (item ->> 'count')::integer;
    exception when others then
      raise exception 'Bed count for % must be a whole number', bed_type;
    end;

    if bed_count < 1 or bed_count > 20 then
      raise exception 'Bed count for % must be between 1 and 20', bed_type;
    end if;

    seen := array_append(seen, bed_type);
    result := result || jsonb_build_array(
      jsonb_build_object('type', bed_type, 'count', bed_count)
    );
  end loop;

  return result;
end;
$$;

create or replace function public.sync_onboarding_unit_details(
  target_organization_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  draft_row public.host_onboarding_drafts%rowtype;
  target_unit_id uuid;
  form jsonb;
  config_text text;
  normalized_config jsonb;
  configured_beds integer;
  legacy_beds integer;
  max_guests_value integer;
  bedrooms_value integer;
  bathrooms_value numeric;
  min_stay_value integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  select drafts.* into draft_row
  from public.host_onboarding_drafts drafts
  where drafts.organization_id = target_organization_id
  for update;

  if not found or draft_row.created_property_id is null then
    raise exception 'Onboarding property is not prepared';
  end if;

  select units.id into target_unit_id
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where properties.id = draft_row.created_property_id
    and properties.organization_id = target_organization_id
    and units.is_primary
  for update;

  if target_unit_id is null then
    raise exception 'Onboarding property unit not found';
  end if;

  form := coalesce(draft_row.form_data, '{}'::jsonb);
  config_text := nullif(trim(coalesce(form ->> 'bedConfiguration', '')), '');

  if config_text is not null then
    begin
      normalized_config := public.normalize_bed_configuration(config_text::jsonb);
    exception when others then
      raise exception 'Bed setup is invalid: %', sqlerrm;
    end;

    select coalesce(sum((entry ->> 'count')::integer), 0)
    into configured_beds
    from jsonb_array_elements(normalized_config) entry;
  else
    normalized_config := null;
    configured_beds := null;
  end if;

  max_guests_value := public.safe_integer(form ->> 'maxGuests');
  bedrooms_value := public.safe_integer(form ->> 'bedrooms');
  legacy_beds := public.safe_integer(form ->> 'beds');
  bathrooms_value := public.safe_numeric(form ->> 'bathrooms');
  min_stay_value := greatest(
    coalesce(public.safe_integer(form ->> 'minStay'), 1),
    1
  );

  update public.property_units units
  set
    max_guests = max_guests_value,
    bedrooms = bedrooms_value,
    beds = coalesce(configured_beds, legacy_beds),
    bed_configuration = coalesce(normalized_config, units.bed_configuration),
    bathrooms = bathrooms_value,
    minimum_stay_nights = min_stay_value,
    check_in = nullif(trim(coalesce(form ->> 'checkIn', '')), '')::time,
    checkout = nullif(trim(coalesce(form ->> 'checkout', '')), '')::time,
    cancellation_policy = left(
      nullif(trim(coalesce(form ->> 'cancellation', '')), ''),
      5000
    ),
    updated_at = now()
  where units.id = target_unit_id;
end;
$$;

revoke all on function public.sync_onboarding_unit_details(uuid) from public;
revoke all on function public.sync_onboarding_unit_details(uuid) from anon;
grant execute on function public.sync_onboarding_unit_details(uuid) to authenticated;
grant execute on function public.sync_onboarding_unit_details(uuid) to service_role;

-- create_property_from_onboarding was also updated in production to call:
--   perform public.sync_onboarding_unit_details(target_organization_id);
-- immediately after public.sync_onboarding_property(...).

-- Keep a previously saved structured bed setup from becoming misleading if an
-- older property editor changes only the legacy total-bed field. If both the
-- total and the structured configuration are changed together, leave them
-- alone; otherwise clear a now-inconsistent structured configuration.
create or replace function public.keep_bed_configuration_consistent()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  config_total integer := 0;
begin
  if new.beds is not distinct from old.beds then
    return new;
  end if;

  if new.bed_configuration is distinct from old.bed_configuration then
    return new;
  end if;

  if jsonb_typeof(coalesce(new.bed_configuration, '[]'::jsonb)) = 'array' then
    select coalesce(sum((entry ->> 'count')::integer), 0)
    into config_total
    from jsonb_array_elements(coalesce(new.bed_configuration, '[]'::jsonb)) entry
    where jsonb_typeof(entry) = 'object'
      and (entry ->> 'count') ~ '^[0-9]+$';
  end if;

  if config_total > 0 and new.beds is distinct from config_total then
    new.bed_configuration := '[]'::jsonb;
  end if;

  return new;
end;
$$;

drop trigger if exists property_units_keep_bed_configuration_consistent
on public.property_units;

create trigger property_units_keep_bed_configuration_consistent
before update of beds, bed_configuration
on public.property_units
for each row
execute function public.keep_bed_configuration_consistent();
