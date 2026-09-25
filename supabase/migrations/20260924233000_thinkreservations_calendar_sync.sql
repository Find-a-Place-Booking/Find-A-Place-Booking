-- Find A Place Booking
-- ThinkReservations read-only calendar/PMS integration.
--
-- Scope:
-- - encrypted server-only hotel credential storage
-- - unit -> ThinkReservations room mapping
-- - canonical EXTERNAL_BLOCK reconciliation
-- - NO rate, fee, tax, payment or reservation-write synchronization

begin;

create table if not exists public.pms_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  external_account_id text not null,
  display_name text,
  credential_ciphertext text not null,
  credential_version integer not null default 1,
  resource_cache jsonb not null default '{}'::jsonb
    check (jsonb_typeof(resource_cache) = 'object'),
  status text not null default 'CONNECTED'
    check (status in ('CONNECTED', 'ERROR', 'DISABLED')),
  last_verified_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (provider in ('THINKRESERVATIONS')),
  check (char_length(trim(external_account_id)) between 1 and 240),
  check (display_name is null or char_length(display_name) <= 240),
  check (char_length(credential_ciphertext) between 20 and 12000),
  check (last_error is null or char_length(last_error) <= 1000),
  unique (organization_id, provider, external_account_id)
);

create trigger pms_integrations_set_updated_at
before update on public.pms_integrations
for each row execute function public.set_updated_at();

alter table public.pms_integrations enable row level security;

-- Credentials are deliberately service-role only. Host-facing UI obtains safe
-- metadata through server code after organization membership is verified.
revoke all on table public.pms_integrations from public;
revoke all on table public.pms_integrations from anon;
revoke all on table public.pms_integrations from authenticated;
grant all on table public.pms_integrations to service_role;

alter table public.calendar_connections
  add column if not exists pms_integration_id uuid
    references public.pms_integrations(id) on delete cascade,
  add column if not exists external_room_type_id text;

alter table public.calendar_connections
  drop constraint if exists calendar_connections_pms_mapping_check;

alter table public.calendar_connections
  add constraint calendar_connections_pms_mapping_check
  check (
    connection_kind <> 'PMS_API'
    or (
      pms_integration_id is not null
      and external_calendar_id is not null
    )
  );

create unique index if not exists calendar_connections_active_pms_room_unique
  on public.calendar_connections(pms_integration_id, external_calendar_id)
  where is_active
    and connection_kind = 'PMS_API'
    and pms_integration_id is not null
    and external_calendar_id is not null;

create index if not exists calendar_connections_pms_integration_idx
  on public.calendar_connections(pms_integration_id, is_active)
  where pms_integration_id is not null;

create or replace function public.service_apply_pms_sync(
  target_connection_id uuid,
  source_blocks jsonb,
  sync_window_start date,
  sync_window_end date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  connection_row public.calendar_connections%rowtype;
  block_row jsonb;
  key_value text;
  uid_value text;
  start_value date;
  end_value date;
  metadata_value jsonb;
  seen_keys text[] := '{}'::text[];
  imported_count integer := 0;
  deactivated_count integer := 0;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if sync_window_start is null or sync_window_end is null then
    raise exception 'PMS sync window is required';
  end if;

  if sync_window_end <= sync_window_start then
    raise exception 'PMS sync window is invalid';
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

  if connection_row.connection_kind <> 'PMS_API' then
    raise exception 'This connection is not a PMS API source';
  end if;

  if connection_row.pms_integration_id is null
     or connection_row.external_calendar_id is null then
    raise exception 'PMS room mapping is incomplete';
  end if;

  if source_blocks is null or jsonb_typeof(source_blocks) <> 'array' then
    raise exception 'PMS sync payload must be an array';
  end if;

  if jsonb_array_length(source_blocks) > 10000 then
    raise exception 'PMS sync payload contains too many blocks';
  end if;

  if octet_length(source_blocks::text) > 2000000 then
    raise exception 'PMS sync payload is too large';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(connection_row.unit_id::text, 0)
  );

  update public.calendar_connections connections
  set sync_status = 'SYNCING',
      last_sync_attempt_at = now(),
      updated_at = now()
  where connections.id = target_connection_id;

  for block_row in
    select value from jsonb_array_elements(source_blocks)
  loop
    key_value := left(
      nullif(trim(coalesce(block_row ->> 'key', '')), ''),
      500
    );
    uid_value := left(
      nullif(trim(coalesce(block_row ->> 'uid', '')), ''),
      500
    );

    if key_value is null or uid_value is null then
      raise exception 'Imported PMS block is missing its stable identifier';
    end if;

    begin
      start_value := (block_row ->> 'start')::date;
      end_value := (block_row ->> 'end')::date;
    exception when others then
      raise exception 'Imported PMS block has invalid dates';
    end;

    if end_value <= start_value then
      raise exception 'Imported PMS block must end after it starts';
    end if;

    if end_value <= sync_window_start or start_value >= sync_window_end then
      continue;
    end if;

    if key_value = any(seen_keys) then
      continue;
    end if;

    seen_keys := array_append(seen_keys, key_value);
    metadata_value := coalesce(block_row -> 'metadata', '{}'::jsonb);

    if jsonb_typeof(metadata_value) <> 'object' then
      metadata_value := '{}'::jsonb;
    end if;

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
      'ThinkReservations unavailable',
      key_value,
      uid_value,
      metadata_value || jsonb_build_object(
        'provider', connection_row.provider,
        'source', 'pms_api'
      ),
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
    and blocks.start_date < sync_window_end
    and blocks.end_date > sync_window_start
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
    'calendar.pms.auto_synced',
    'calendar_connection',
    connection_row.id,
    'Find A Place synchronized booked/blocked dates from a PMS API.',
    jsonb_build_object(
      'unit_id', connection_row.unit_id,
      'provider', connection_row.provider,
      'imported_count', imported_count,
      'deactivated_count', deactivated_count,
      'sync_window_start', sync_window_start,
      'sync_window_end', sync_window_end
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

revoke all on function public.service_apply_pms_sync(uuid,jsonb,date,date)
from public;
grant execute on function public.service_apply_pms_sync(uuid,jsonb,date,date)
to service_role;

comment on table public.pms_integrations is
  'Server-only PMS credentials and safe cached resource metadata. Credential ciphertext is never exposed through host RLS.';
comment on column public.calendar_connections.external_calendar_id is
  'For PMS_API connections this stores the provider room/resource id mapped to the Find A Place unit.';
comment on column public.calendar_connections.external_room_type_id is
  'Optional PMS room-type id used for room-type-scoped blocks when the provider does not return an exact room id.';
comment on function public.service_apply_pms_sync(uuid,jsonb,date,date) is
  'Service-role-only PMS availability reconciliation. It can mutate only EXTERNAL_BLOCK rows owned by the target calendar connection and only inside the supplied sync window.';

commit;
