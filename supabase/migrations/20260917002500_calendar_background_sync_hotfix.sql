-- Find A Place Booking
-- Calendar integration production hotfix.
--
-- Does NOT change booking/payment creation, Stripe, reservation confirmation,
-- pricing or tax logic.
--
-- Fixes:
-- 1) owner blocks now use the same unit advisory lock as checkout availability
--    mutations and cannot silently overlap an already-active canonical block;
-- 2) adds service-role-only iCal reconciliation functions so an external
--    scheduler can refresh inbound channel feeds without impersonating a host.

begin;

-- ---------------------------------------------------------------------------
-- Canonical manual-block serialization
-- ---------------------------------------------------------------------------

create or replace function public.create_owner_availability_block(
  target_unit_id uuid,
  block_start date,
  block_end date,
  block_label text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result_id uuid;
  clean_label text := left(
    nullif(trim(coalesce(block_label, '')), ''),
    180
  );
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_unit_calendar(target_unit_id) then
    raise exception 'Calendar manager access required';
  end if;

  if block_start is null or block_end is null then
    raise exception 'Start and end dates are required';
  end if;

  if block_end <= block_start then
    raise exception 'End date must be after the start date';
  end if;

  if block_end > block_start + 730 then
    raise exception 'A manual block cannot span more than 730 days';
  end if;

  -- Booking holds/reservations already serialize on this exact unit lock.
  -- Take it BEFORE checking for conflicts so a manual host block and a guest
  -- checkout can never both pass availability checks concurrently.
  perform pg_advisory_xact_lock(
    hashtextextended(target_unit_id::text, 0)
  );

  if exists (
    select 1
    from public.availability_blocks blocks
    where blocks.unit_id = target_unit_id
      and blocks.state = 'ACTIVE'
      and blocks.start_date < block_end
      and blocks.end_date > block_start
      and (
        blocks.block_type <> 'INTERNAL_HOLD'
        or blocks.expires_at is null
        or blocks.expires_at > now()
      )
  ) then
    raise exception
      'Those dates are already unavailable on the canonical calendar';
  end if;

  insert into public.availability_blocks (
    unit_id,
    block_type,
    state,
    start_date,
    end_date,
    label,
    created_by,
    metadata
  ) values (
    target_unit_id,
    'OWNER_BLOCK',
    'ACTIVE',
    block_start,
    block_end,
    coalesce(clean_label, 'Owner block'),
    actor_id,
    jsonb_build_object('source', 'host_calendar')
  )
  returning id into result_id;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    actor_id,
    'calendar.owner_block.created',
    'availability_block',
    result_id,
    'Host blocked dates on the canonical unit calendar.',
    jsonb_build_object(
      'unit_id', target_unit_id,
      'start_date', block_start,
      'end_date', block_end
    )
  );

  return result_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Service-role iCal reconciliation
-- ---------------------------------------------------------------------------

create or replace function public.service_apply_ical_sync(
  target_connection_id uuid,
  source_events jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  connection_row public.calendar_connections%rowtype;
  event_row jsonb;
  key_value text;
  uid_value text;
  start_value date;
  end_value date;
  seen_keys text[] := '{}'::text[];
  imported_count integer := 0;
  deactivated_count integer := 0;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select connections.*
  into connection_row
  from public.calendar_connections connections
  where connections.id = target_connection_id
  for update;

  if not found then
    raise exception 'Calendar connection not found';
  end if;

  if not connection_row.is_active then
    raise exception 'Calendar connection is disabled';
  end if;

  if connection_row.connection_kind <> 'ICAL' then
    raise exception 'This connection is not an iCal source';
  end if;

  if source_events is null or jsonb_typeof(source_events) <> 'array' then
    raise exception 'Calendar sync payload must be an array';
  end if;

  if jsonb_array_length(source_events) > 10000 then
    raise exception 'Calendar feed contains too many events';
  end if;

  if octet_length(source_events::text) > 2000000 then
    raise exception 'Calendar sync payload is too large';
  end if;

  -- Serialize external availability mutation with checkout/manual blocks.
  perform pg_advisory_xact_lock(
    hashtextextended(connection_row.unit_id::text, 0)
  );

  update public.calendar_connections connections
  set sync_status = 'SYNCING',
      last_sync_attempt_at = now(),
      updated_at = now()
  where connections.id = target_connection_id;

  for event_row in
    select value from jsonb_array_elements(source_events)
  loop
    key_value := left(
      nullif(trim(coalesce(event_row ->> 'key', '')), ''),
      500
    );
    uid_value := left(
      nullif(trim(coalesce(event_row ->> 'uid', '')), ''),
      500
    );

    if key_value is null or uid_value is null then
      raise exception 'Imported calendar event is missing its stable identifier';
    end if;

    begin
      start_value := (event_row ->> 'start')::date;
      end_value := (event_row ->> 'end')::date;
    exception when others then
      raise exception 'Imported calendar event has invalid dates';
    end;

    if end_value <= start_value then
      raise exception 'Imported calendar event must end after it starts';
    end if;

    if key_value = any(seen_keys) then
      continue;
    end if;

    seen_keys := array_append(seen_keys, key_value);

    insert into public.availability_blocks (
      unit_id,
      connection_id,
      block_type,
      state,
      start_date,
      end_date,
      label,
      external_event_key,
      external_uid,
      metadata,
      created_by
    ) values (
      connection_row.unit_id,
      connection_row.id,
      'EXTERNAL_BLOCK',
      'ACTIVE',
      start_value,
      end_value,
      left(connection_row.provider || ' calendar block', 180),
      key_value,
      uid_value,
      jsonb_build_object('provider', connection_row.provider),
      null
    )
    on conflict (connection_id, external_event_key)
      where connection_id is not null
        and external_event_key is not null
    do update set
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      state = 'ACTIVE',
      label = excluded.label,
      external_uid = excluded.external_uid,
      metadata = excluded.metadata,
      updated_at = now();

    imported_count := imported_count + 1;
  end loop;

  update public.availability_blocks blocks
  set state = 'CANCELLED',
      updated_at = now()
  where blocks.connection_id = connection_row.id
    and blocks.block_type = 'EXTERNAL_BLOCK'
    and blocks.state = 'ACTIVE'
    and not (blocks.external_event_key = any(seen_keys));

  get diagnostics deactivated_count = row_count;

  update public.calendar_connections connections
  set sync_status = 'HEALTHY',
      last_synced_at = now(),
      last_success_at = now(),
      last_error_at = null,
      last_error = null,
      updated_at = now()
  where connections.id = connection_row.id;

  insert into public.calendar_sync_runs (
    connection_id,
    status,
    imported_count,
    deactivated_count,
    actor_profile_id
  ) values (
    connection_row.id,
    'SUCCESS',
    imported_count,
    deactivated_count,
    null
  );

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    null,
    'calendar.ical.auto_synced',
    'calendar_connection',
    connection_row.id,
    'Find A Place automatically synchronized an external iCal availability source.',
    jsonb_build_object(
      'unit_id', connection_row.unit_id,
      'provider', connection_row.provider,
      'imported_count', imported_count,
      'deactivated_count', deactivated_count,
      'source', 'calendar_sync_job'
    )
  );

  return jsonb_build_object(
    'connection_id', connection_row.id,
    'unit_id', connection_row.unit_id,
    'imported_count', imported_count,
    'deactivated_count', deactivated_count,
    'synced_at', now()
  );
end;
$$;

create or replace function public.service_mark_calendar_sync_error(
  target_connection_id uuid,
  error_message text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  connection_row public.calendar_connections%rowtype;
  clean_error text := left(
    coalesce(
      nullif(trim(error_message), ''),
      'Calendar synchronization failed.'
    ),
    1000
  );
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select connections.*
  into connection_row
  from public.calendar_connections connections
  where connections.id = target_connection_id;

  if not found then
    raise exception 'Calendar connection not found';
  end if;

  update public.calendar_connections connections
  set sync_status = 'ERROR',
      last_sync_attempt_at = now(),
      last_error_at = now(),
      last_error = clean_error,
      updated_at = now()
  where connections.id = target_connection_id;

  insert into public.calendar_sync_runs (
    connection_id,
    status,
    error_message,
    actor_profile_id
  ) values (
    target_connection_id,
    'ERROR',
    clean_error,
    null
  );
end;
$$;

revoke all on function public.service_apply_ical_sync(uuid,jsonb)
from public;
revoke all on function public.service_mark_calendar_sync_error(uuid,text)
from public;

grant execute on function public.service_apply_ical_sync(uuid,jsonb)
to service_role;
grant execute on function public.service_mark_calendar_sync_error(uuid,text)
to service_role;

comment on function public.service_apply_ical_sync(uuid,jsonb) is
  'Service-role-only background iCal reconciliation. Mutates only blocks owned by the target connection and serializes on the canonical unit availability lock.';

comment on function public.service_mark_calendar_sync_error(uuid,text) is
  'Service-role-only calendar sync error recorder for scheduled reconciliation jobs.';

commit;
