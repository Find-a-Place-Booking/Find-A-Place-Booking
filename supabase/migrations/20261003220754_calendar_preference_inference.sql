-- Production migration already applied on 2026-10-03.
-- Keeps a property's availability preference aligned with the connection
-- the host actually creates. Explicit host choices are never overwritten.

create or replace function public.infer_property_calendar_preference_from_connection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_property_id uuid;
begin
  if coalesce(new.is_active, false) is not true then
    return new;
  end if;

  select units.property_id
  into target_property_id
  from public.property_units units
  where units.id = new.unit_id
  limit 1;

  if target_property_id is null then
    return new;
  end if;

  if new.connection_kind = 'ICAL' then
    update public.properties properties
    set calendar_preference = 'ICAL',
        updated_at = now()
    where properties.id = target_property_id
      and properties.calendar_preference = 'UNSET';
  elsif new.connection_kind in ('PMS_API', 'BROWSER_WORKER') then
    update public.properties properties
    set calendar_preference = 'PMS',
        updated_at = now()
    where properties.id = target_property_id
      and properties.calendar_preference = 'UNSET';
  end if;

  return new;
end;
$$;

drop trigger if exists calendar_connection_infer_property_preference
on public.calendar_connections;

create trigger calendar_connection_infer_property_preference
after insert or update of connection_kind, is_active
on public.calendar_connections
for each row
execute function public.infer_property_calendar_preference_from_connection();

-- Backfill only when the active connection kind is unambiguous.
-- Mixed iCal + PMS listings stay UNSET so the host can explicitly choose.
update public.properties properties
set calendar_preference = 'ICAL',
    updated_at = now()
where properties.calendar_preference = 'UNSET'
  and exists (
    select 1
    from public.property_units units
    join public.calendar_connections connections
      on connections.unit_id = units.id
    where units.property_id = properties.id
      and units.is_primary
      and units.is_active
      and connections.is_active
      and connections.connection_kind = 'ICAL'
  )
  and not exists (
    select 1
    from public.property_units units
    join public.calendar_connections connections
      on connections.unit_id = units.id
    where units.property_id = properties.id
      and units.is_primary
      and units.is_active
      and connections.is_active
      and connections.connection_kind in ('PMS_API', 'BROWSER_WORKER')
  );

update public.properties properties
set calendar_preference = 'PMS',
    updated_at = now()
where properties.calendar_preference = 'UNSET'
  and exists (
    select 1
    from public.property_units units
    join public.calendar_connections connections
      on connections.unit_id = units.id
    where units.property_id = properties.id
      and units.is_primary
      and units.is_active
      and connections.is_active
      and connections.connection_kind in ('PMS_API', 'BROWSER_WORKER')
  )
  and not exists (
    select 1
    from public.property_units units
    join public.calendar_connections connections
      on connections.unit_id = units.id
    where units.property_id = properties.id
      and units.is_primary
      and units.is_active
      and connections.is_active
      and connections.connection_kind = 'ICAL'
  );
