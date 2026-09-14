-- Find A Place Booking
-- Milestone 9B.1: calendar safety, privacy and query hardening.
--
-- This is a follow-up migration. Do not edit/re-run migration 014 on a database
-- where it is already applied.

begin;

-- Calendar connection rows contain private external feed URLs, and export-token
-- rows contain bearer URLs. Restrict direct SELECT access to organization
-- owners/managers plus active admins. Staff can still see canonical availability
-- blocks without receiving private connection credentials/tokens.
drop policy if exists calendar_connections_select_member_or_admin on public.calendar_connections;
create policy calendar_connections_select_manager_or_admin
on public.calendar_connections
for select to authenticated
using (public.is_active_admin() or public.can_manage_unit_calendar(unit_id));

drop policy if exists calendar_export_tokens_select_member_or_admin on public.calendar_export_tokens;
create policy calendar_export_tokens_select_manager_or_admin
on public.calendar_export_tokens
for select to authenticated
using (public.is_active_admin() or public.can_manage_unit_calendar(unit_id));

-- Future-facing counts are common on host/Admin calendar health views. Keep
-- those scans bounded as the platform accumulates historical imported blocks.
create index if not exists availability_blocks_active_connection_end_idx
  on public.availability_blocks(connection_id, end_date)
  where state = 'ACTIVE' and connection_id is not null;

create index if not exists availability_blocks_active_type_end_idx
  on public.availability_blocks(block_type, end_date)
  where state = 'ACTIVE';

-- Avoid transferring every historical external block to the host calendar page
-- just to count blocks per source. Aggregate in PostgreSQL instead.
create or replace function public.calendar_connection_active_block_counts(target_unit_id uuid)
returns table (connection_id uuid, active_block_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.is_active_admin() and not public.can_manage_unit_calendar(target_unit_id) then
    raise exception 'Calendar manager access required';
  end if;

  return query
  select blocks.connection_id, count(*)::bigint
  from public.availability_blocks blocks
  where blocks.unit_id = target_unit_id
    and blocks.connection_id is not null
    and blocks.block_type = 'EXTERNAL_BLOCK'
    and blocks.state = 'ACTIVE'
    and blocks.end_date > current_date
  group by blocks.connection_id;
end;
$$;

-- Collapse the Admin calendar-health screen to a single bounded RPC instead of
-- loading all platform availability rows into Next.js and resolving ownership
-- with several follow-up queries.
create or replace function public.admin_calendar_health_bundle()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  connections_payload jsonb := '[]'::jsonb;
  owner_count bigint := 0;
  external_count bigint := 0;
begin
  if (select auth.uid()) is null or not public.is_active_admin() then
    raise exception 'Active admin access required';
  end if;

  with block_counts as (
    select blocks.connection_id, count(*)::bigint as active_block_count
    from public.availability_blocks blocks
    where blocks.state = 'ACTIVE'
      and blocks.block_type = 'EXTERNAL_BLOCK'
      and blocks.connection_id is not null
      and blocks.end_date > current_date
    group by blocks.connection_id
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', connections.id,
      'unit_id', connections.unit_id,
      'provider', connections.provider,
      'label', connections.label,
      'connection_kind', connections.connection_kind,
      'sync_status', connections.sync_status,
      'last_sync_attempt_at', connections.last_sync_attempt_at,
      'last_success_at', connections.last_success_at,
      'last_error', connections.last_error,
      'is_active', connections.is_active,
      'active_block_count', coalesce(block_counts.active_block_count, 0),
      'property_id', properties.id,
      'property_name', properties.name,
      'property_status', properties.status,
      'organization_id', organizations.id,
      'organization_name', organizations.name,
      'unit_name', units.name
    ) order by connections.last_success_at desc nulls last, connections.created_at
  ), '[]'::jsonb)
  into connections_payload
  from public.calendar_connections connections
  join public.property_units units on units.id = connections.unit_id
  join public.properties properties on properties.id = units.property_id
  join public.organizations organizations on organizations.id = properties.organization_id
  left join block_counts on block_counts.connection_id = connections.id
  where connections.is_active;

  select
    count(*) filter (where blocks.block_type = 'OWNER_BLOCK'),
    count(*) filter (where blocks.block_type = 'EXTERNAL_BLOCK')
  into owner_count, external_count
  from public.availability_blocks blocks
  where blocks.state = 'ACTIVE'
    and blocks.end_date > current_date;

  return jsonb_build_object(
    'connections', connections_payload,
    'owner_blocks', owner_count,
    'external_blocks', external_count
  );
end;
$$;

-- Keep exported feeds useful without allowing years of old availability history
-- to grow every subscription response indefinitely. Current/future blocks plus
-- 30 days of recent history are sufficient for calendar reconciliation.
create or replace function public.calendar_export_payload(requested_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  token_row public.calendar_export_tokens%rowtype;
  calendar_name text;
  events jsonb;
begin
  select tokens.* into token_row
  from public.calendar_export_tokens tokens
  where tokens.token = requested_token
    and tokens.is_active;
  if not found then return null; end if;

  select coalesce(properties.name, units.name, 'Find A Place availability')
  into calendar_name
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where units.id = token_row.unit_id
    and units.is_active;
  if calendar_name is null then return null; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'uid', 'fap-' || replace(blocks.id::text, '-', '') || '@findaplacear.com',
      'start_date', blocks.start_date,
      'end_date', blocks.end_date,
      'summary', case when blocks.block_type = 'INTERNAL_RESERVATION' then 'Reserved' else 'Unavailable' end,
      'updated_at', blocks.updated_at
    ) order by blocks.start_date, blocks.id
  ), '[]'::jsonb)
  into events
  from public.availability_blocks blocks
  where blocks.unit_id = token_row.unit_id
    and blocks.state = 'ACTIVE'
    and blocks.block_type in ('OWNER_BLOCK', 'EXTERNAL_BLOCK', 'INTERNAL_RESERVATION')
    and blocks.end_date >= current_date - 30
    and (
      token_row.exclude_connection_id is null
      or blocks.connection_id is distinct from token_row.exclude_connection_id
    );

  return jsonb_build_object(
    'name', calendar_name,
    'unit_id', token_row.unit_id,
    'events', events
  );
end;
$$;

create or replace function public.calendar_hardening_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'calendar-availability-hardening-v1'::text;
$$;

revoke all on function public.calendar_connection_active_block_counts(uuid) from public;
revoke all on function public.admin_calendar_health_bundle() from public;
revoke all on function public.calendar_hardening_version() from public;

grant execute on function public.calendar_connection_active_block_counts(uuid) to authenticated;
grant execute on function public.admin_calendar_health_bundle() to authenticated;
grant execute on function public.calendar_hardening_version() to anon, authenticated;

comment on function public.calendar_connection_active_block_counts(uuid) is
  'Bounded server-side count of active imported blocks per calendar connection for one managed unit.';
comment on function public.admin_calendar_health_bundle() is
  'Admin-only calendar source ownership, health and active-block counts without exposing private feed URLs.';

commit;
