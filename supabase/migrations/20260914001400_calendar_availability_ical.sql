-- Find A Place Booking
-- Milestone 9B: canonical unit availability + owner blocks + iCal/ICS foundation.
--
-- Availability is deliberately independent from pricing, taxes, reservations,
-- payment processors and payouts. Every block is anchored to an immutable unit
-- UUID. Imported sources retain their own connection identity so one sync can
-- never delete another source's availability.

begin;

create type public.calendar_connection_kind as enum ('ICAL', 'PMS_API');
create type public.calendar_sync_status as enum ('NEVER_SYNCED', 'SYNCING', 'HEALTHY', 'ERROR', 'DISABLED');
create type public.availability_block_type as enum ('OWNER_BLOCK', 'EXTERNAL_BLOCK', 'INTERNAL_HOLD', 'INTERNAL_RESERVATION');
create type public.availability_block_state as enum ('ACTIVE', 'CANCELLED');

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.property_units(id) on delete cascade,
  provider text not null,
  connection_kind public.calendar_connection_kind not null default 'ICAL',
  label text not null,
  feed_url text,
  external_calendar_id text,
  is_active boolean not null default true,
  sync_status public.calendar_sync_status not null default 'NEVER_SYNCED',
  last_sync_attempt_at timestamptz,
  last_synced_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(provider)) between 2 and 40),
  check (char_length(trim(label)) between 1 and 120),
  check (feed_url is null or char_length(feed_url) <= 2000),
  check (last_error is null or char_length(last_error) <= 1000),
  check (connection_kind <> 'ICAL' or feed_url is not null),
  unique (id, unit_id)
);

create unique index calendar_connections_active_feed_unique
  on public.calendar_connections(feed_url)
  where is_active and feed_url is not null;
create index calendar_connections_unit_idx
  on public.calendar_connections(unit_id, is_active, created_at);

create table public.calendar_export_tokens (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.property_units(id) on delete cascade,
  exclude_connection_id uuid,
  token uuid not null default gen_random_uuid() unique,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (exclude_connection_id, unit_id)
    references public.calendar_connections(id, unit_id) on delete cascade
);

create unique index calendar_export_tokens_generic_active_unique
  on public.calendar_export_tokens(unit_id)
  where is_active and exclude_connection_id is null;
create unique index calendar_export_tokens_connection_active_unique
  on public.calendar_export_tokens(unit_id, exclude_connection_id)
  where is_active and exclude_connection_id is not null;

create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.property_units(id) on delete cascade,
  connection_id uuid,
  block_type public.availability_block_type not null,
  state public.availability_block_state not null default 'ACTIVE',
  start_date date not null,
  end_date date not null,
  label text,
  external_event_key text,
  external_uid text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (connection_id, unit_id)
    references public.calendar_connections(id, unit_id) on delete cascade,
  check (end_date > start_date),
  check (label is null or char_length(label) <= 180),
  check (external_event_key is null or char_length(external_event_key) <= 500),
  check (external_uid is null or char_length(external_uid) <= 500),
  check (block_type <> 'EXTERNAL_BLOCK' or (connection_id is not null and external_event_key is not null)),
  check (block_type <> 'OWNER_BLOCK' or connection_id is null),
  check (block_type not in ('INTERNAL_HOLD', 'INTERNAL_RESERVATION') or connection_id is null)
);

create unique index availability_blocks_external_event_unique
  on public.availability_blocks(connection_id, external_event_key)
  where connection_id is not null and external_event_key is not null;
create index availability_blocks_unit_dates_idx
  on public.availability_blocks(unit_id, start_date, end_date)
  where state = 'ACTIVE';
create index availability_blocks_connection_idx
  on public.availability_blocks(connection_id, state, updated_at)
  where connection_id is not null;

create table public.calendar_sync_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  status text not null check (status in ('SUCCESS', 'ERROR')),
  imported_count integer not null default 0 check (imported_count >= 0),
  deactivated_count integer not null default 0 check (deactivated_count >= 0),
  error_message text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  check (error_message is null or char_length(error_message) <= 1000)
);

create index calendar_sync_runs_connection_idx
  on public.calendar_sync_runs(connection_id, completed_at desc);

create trigger calendar_connections_set_updated_at
before update on public.calendar_connections
for each row execute function public.set_updated_at();

create trigger calendar_export_tokens_set_updated_at
before update on public.calendar_export_tokens
for each row execute function public.set_updated_at();

create trigger availability_blocks_set_updated_at
before update on public.availability_blocks
for each row execute function public.set_updated_at();

alter table public.calendar_connections enable row level security;
alter table public.calendar_export_tokens enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.calendar_sync_runs enable row level security;

create policy calendar_connections_select_member_or_admin
on public.calendar_connections
for select to authenticated
using (public.can_access_unit(unit_id));

create policy calendar_export_tokens_select_member_or_admin
on public.calendar_export_tokens
for select to authenticated
using (public.can_access_unit(unit_id));

create policy availability_blocks_select_member_or_admin
on public.availability_blocks
for select to authenticated
using (public.can_access_unit(unit_id));

create policy calendar_sync_runs_select_member_or_admin
on public.calendar_sync_runs
for select to authenticated
using (
  exists (
    select 1
    from public.calendar_connections connections
    where connections.id = calendar_sync_runs.connection_id
      and public.can_access_unit(connections.unit_id)
  )
);

create or replace function public.can_manage_unit_calendar(target_unit_id uuid)
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
      and units.is_active
      and properties.status <> 'ARCHIVED'
      and public.can_manage_property(properties.id)
  );
$$;

create or replace function public.ensure_calendar_export_token(
  target_unit_id uuid,
  target_exclude_connection_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result_token uuid;
  created_token_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_calendar(target_unit_id) then raise exception 'Calendar manager access required'; end if;

  if target_exclude_connection_id is not null and not exists (
    select 1 from public.calendar_connections connections
    where connections.id = target_exclude_connection_id
      and connections.unit_id = target_unit_id
      and connections.is_active
  ) then
    raise exception 'Calendar connection does not belong to this unit';
  end if;

  select tokens.token
  into result_token
  from public.calendar_export_tokens tokens
  where tokens.unit_id = target_unit_id
    and tokens.is_active
    and tokens.exclude_connection_id is not distinct from target_exclude_connection_id
  order by tokens.created_at desc
  limit 1;

  if result_token is not null then return result_token; end if;

  insert into public.calendar_export_tokens (
    unit_id, exclude_connection_id, created_by
  ) values (
    target_unit_id, target_exclude_connection_id, actor_id
  )
  returning id, token into created_token_id, result_token;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, metadata
  ) values (
    actor_id,
    'calendar.export.created',
    'calendar_export_token',
    created_token_id,
    'Host created a tokenized Find A Place calendar export.',
    jsonb_build_object(
      'unit_id', target_unit_id,
      'exclude_connection_id', target_exclude_connection_id
    )
  );

  return result_token;
end;
$$;

create or replace function public.rotate_calendar_export_token(
  target_unit_id uuid,
  target_export_token_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result_token uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_calendar(target_unit_id) then raise exception 'Calendar manager access required'; end if;

  update public.calendar_export_tokens tokens
  set token = gen_random_uuid(),
      rotated_at = now(),
      updated_at = now()
  where tokens.id = target_export_token_id
    and tokens.unit_id = target_unit_id
    and tokens.is_active
  returning tokens.token into result_token;

  if result_token is null then raise exception 'Calendar export token not found'; end if;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, metadata
  ) values (
    actor_id,
    'calendar.export.rotated',
    'calendar_export_token',
    target_export_token_id,
    'Host rotated a tokenized Find A Place calendar export.',
    jsonb_build_object('unit_id', target_unit_id)
  );

  return result_token;
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
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  provider_value text := upper(regexp_replace(trim(coalesce(provider_name, 'OTHER_ICAL')), '[^A-Za-z0-9_]+', '_', 'g'));
  label_value text := left(nullif(trim(coalesce(connection_label, '')), ''), 120);
  url_value text := left(nullif(trim(coalesce(source_url, '')), ''), 2000);
  result_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_calendar(target_unit_id) then raise exception 'Calendar manager access required'; end if;
  if provider_value = '' then provider_value := 'OTHER_ICAL'; end if;
  if label_value is null then raise exception 'Calendar label is required'; end if;
  if url_value is null or url_value !~* '^https://' then raise exception 'A secure HTTPS iCal feed URL is required'; end if;

  if exists (
    select 1 from public.calendar_connections connections
    where connections.is_active
      and connections.feed_url = url_value
  ) then
    raise exception 'That calendar feed is already connected to a rentable unit';
  end if;

  insert into public.calendar_connections (
    unit_id, provider, connection_kind, label, feed_url, created_by
  ) values (
    target_unit_id, left(provider_value, 40), 'ICAL', label_value, url_value, actor_id
  ) returning id into result_id;

  perform public.ensure_calendar_export_token(target_unit_id, result_id);

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, metadata
  ) values (
    actor_id,
    'calendar.connection.created',
    'calendar_connection',
    result_id,
    'Host connected an external iCal availability source.',
    jsonb_build_object('unit_id', target_unit_id, 'provider', provider_value)
  );

  return result_id;
end;
$$;

create or replace function public.disable_calendar_connection(
  target_unit_id uuid,
  target_connection_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  changed_count integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_calendar(target_unit_id) then raise exception 'Calendar manager access required'; end if;

  update public.calendar_connections connections
  set is_active = false,
      sync_status = 'DISABLED',
      updated_at = now()
  where connections.id = target_connection_id
    and connections.unit_id = target_unit_id
    and connections.is_active;
  get diagnostics changed_count = row_count;
  if changed_count = 0 then raise exception 'Calendar connection not found'; end if;

  update public.availability_blocks blocks
  set state = 'CANCELLED', updated_at = now()
  where blocks.connection_id = target_connection_id
    and blocks.unit_id = target_unit_id
    and blocks.block_type = 'EXTERNAL_BLOCK'
    and blocks.state = 'ACTIVE';

  update public.calendar_export_tokens tokens
  set is_active = false, updated_at = now()
  where tokens.unit_id = target_unit_id
    and tokens.exclude_connection_id = target_connection_id
    and tokens.is_active;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, metadata
  ) values (
    actor_id,
    'calendar.connection.disabled',
    'calendar_connection',
    target_connection_id,
    'Host disconnected an external availability source.',
    jsonb_build_object('unit_id', target_unit_id)
  );
end;
$$;

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
  clean_label text := left(nullif(trim(coalesce(block_label, '')), ''), 180);
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_calendar(target_unit_id) then raise exception 'Calendar manager access required'; end if;
  if block_start is null or block_end is null then raise exception 'Start and end dates are required'; end if;
  if block_end <= block_start then raise exception 'End date must be after the start date'; end if;
  if block_end > block_start + 730 then raise exception 'A manual block cannot span more than 730 days'; end if;

  if exists (
    select 1 from public.availability_blocks blocks
    where blocks.unit_id = target_unit_id
      and blocks.block_type = 'OWNER_BLOCK'
      and blocks.state = 'ACTIVE'
      and blocks.start_date < block_end
      and blocks.end_date > block_start
  ) then
    raise exception 'Those dates overlap an existing owner block';
  end if;

  insert into public.availability_blocks (
    unit_id, block_type, state, start_date, end_date, label, created_by,
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
  ) returning id into result_id;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, metadata
  ) values (
    actor_id,
    'calendar.owner_block.created',
    'availability_block',
    result_id,
    'Host blocked dates on the canonical unit calendar.',
    jsonb_build_object('unit_id', target_unit_id, 'start_date', block_start, 'end_date', block_end)
  );

  return result_id;
end;
$$;

create or replace function public.cancel_owner_availability_block(
  target_unit_id uuid,
  target_block_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  changed_count integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_calendar(target_unit_id) then raise exception 'Calendar manager access required'; end if;

  update public.availability_blocks blocks
  set state = 'CANCELLED', updated_at = now()
  where blocks.id = target_block_id
    and blocks.unit_id = target_unit_id
    and blocks.block_type = 'OWNER_BLOCK'
    and blocks.state = 'ACTIVE';
  get diagnostics changed_count = row_count;
  if changed_count = 0 then raise exception 'Owner block not found'; end if;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, metadata
  ) values (
    actor_id,
    'calendar.owner_block.cancelled',
    'availability_block',
    target_block_id,
    'Host removed a manual block from the canonical unit calendar.',
    jsonb_build_object('unit_id', target_unit_id)
  );
end;
$$;

create or replace function public.apply_ical_sync(
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
  actor_id uuid := (select auth.uid());
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
  if actor_id is null then raise exception 'Authentication required'; end if;

  select connections.* into connection_row
  from public.calendar_connections connections
  where connections.id = target_connection_id
  for update;
  if not found then raise exception 'Calendar connection not found'; end if;
  if not public.can_manage_unit_calendar(connection_row.unit_id) then raise exception 'Calendar manager access required'; end if;
  if not connection_row.is_active then raise exception 'Calendar connection is disabled'; end if;
  if connection_row.connection_kind <> 'ICAL' then raise exception 'This connection is not an iCal source'; end if;
  if source_events is null or jsonb_typeof(source_events) <> 'array' then raise exception 'Calendar sync payload must be an array'; end if;
  if jsonb_array_length(source_events) > 10000 then raise exception 'Calendar feed contains too many events'; end if;
  if octet_length(source_events::text) > 2000000 then raise exception 'Calendar sync payload is too large'; end if;

  update public.calendar_connections connections
  set sync_status = 'SYNCING',
      last_sync_attempt_at = now(),
      updated_at = now()
  where connections.id = target_connection_id;

  for event_row in select value from jsonb_array_elements(source_events)
  loop
    key_value := left(nullif(trim(coalesce(event_row ->> 'key', '')), ''), 500);
    uid_value := left(nullif(trim(coalesce(event_row ->> 'uid', '')), ''), 500);
    if key_value is null or uid_value is null then raise exception 'Imported calendar event is missing its stable identifier'; end if;

    begin
      start_value := (event_row ->> 'start')::date;
      end_value := (event_row ->> 'end')::date;
    exception when others then
      raise exception 'Imported calendar event has invalid dates';
    end;
    if end_value <= start_value then raise exception 'Imported calendar event must end after it starts'; end if;

    if key_value = any(seen_keys) then continue; end if;
    seen_keys := array_append(seen_keys, key_value);

    insert into public.availability_blocks (
      unit_id, connection_id, block_type, state, start_date, end_date,
      label, external_event_key, external_uid, metadata, created_by
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
      actor_id
    )
    on conflict (connection_id, external_event_key)
      where connection_id is not null and external_event_key is not null
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
  set state = 'CANCELLED', updated_at = now()
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
    connection_id, status, imported_count, deactivated_count, actor_profile_id
  ) values (
    connection_row.id, 'SUCCESS', imported_count, deactivated_count, actor_id
  );

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, metadata
  ) values (
    actor_id,
    'calendar.ical.synced',
    'calendar_connection',
    connection_row.id,
    'Find A Place synchronized an external iCal availability source.',
    jsonb_build_object(
      'unit_id', connection_row.unit_id,
      'provider', connection_row.provider,
      'imported_count', imported_count,
      'deactivated_count', deactivated_count
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

create or replace function public.mark_calendar_sync_error(
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
  actor_id uuid := (select auth.uid());
  connection_row public.calendar_connections%rowtype;
  clean_error text := left(coalesce(nullif(trim(error_message), ''), 'Calendar synchronization failed.'), 1000);
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  select connections.* into connection_row
  from public.calendar_connections connections
  where connections.id = target_connection_id;
  if not found then raise exception 'Calendar connection not found'; end if;
  if not public.can_manage_unit_calendar(connection_row.unit_id) then raise exception 'Calendar manager access required'; end if;

  update public.calendar_connections connections
  set sync_status = 'ERROR',
      last_sync_attempt_at = now(),
      last_error_at = now(),
      last_error = clean_error,
      updated_at = now()
  where connections.id = target_connection_id;

  insert into public.calendar_sync_runs (
    connection_id, status, error_message, actor_profile_id
  ) values (
    target_connection_id, 'ERROR', clean_error, actor_id
  );
end;
$$;

create or replace function public.check_unit_availability(
  target_unit_id uuid,
  requested_check_in date,
  requested_check_out date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  public_unit boolean := false;
  conflict_count integer := 0;
begin
  if requested_check_in is null or requested_check_out is null then raise exception 'Check-in and check-out are required'; end if;
  if requested_check_out <= requested_check_in then raise exception 'Check-out must be after check-in'; end if;

  select exists (
    select 1
    from public.property_units units
    join public.properties properties on properties.id = units.property_id
    where units.id = target_unit_id
      and units.is_active
      and properties.status = 'PUBLISHED'
  ) into public_unit;

  if actor_id is null and not public_unit then raise exception 'Published unit required'; end if;
  if actor_id is not null and not public_unit and not public.can_access_unit(target_unit_id) then
    raise exception 'Unit access required';
  end if;

  select count(*)::integer into conflict_count
  from public.availability_blocks blocks
  where blocks.unit_id = target_unit_id
    and blocks.state = 'ACTIVE'
    and blocks.start_date < requested_check_out
    and blocks.end_date > requested_check_in
    and (
      blocks.block_type <> 'INTERNAL_HOLD'
      or blocks.expires_at is null
      or blocks.expires_at > now()
    );

  return jsonb_build_object(
    'unit_id', target_unit_id,
    'check_in', requested_check_in,
    'check_out', requested_check_out,
    'available', conflict_count = 0,
    'conflicting_block_count', conflict_count,
    'date_semantics', '[check_in, check_out)'
  );
end;
$$;

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

revoke all on function public.can_manage_unit_calendar(uuid) from public;
revoke all on function public.ensure_calendar_export_token(uuid,uuid) from public;
revoke all on function public.rotate_calendar_export_token(uuid,uuid) from public;
revoke all on function public.create_ical_connection(uuid,text,text,text) from public;
revoke all on function public.disable_calendar_connection(uuid,uuid) from public;
revoke all on function public.create_owner_availability_block(uuid,date,date,text) from public;
revoke all on function public.cancel_owner_availability_block(uuid,uuid) from public;
revoke all on function public.apply_ical_sync(uuid,jsonb) from public;
revoke all on function public.mark_calendar_sync_error(uuid,text) from public;
revoke all on function public.check_unit_availability(uuid,date,date) from public;
revoke all on function public.calendar_export_payload(uuid) from public;

grant execute on function public.can_manage_unit_calendar(uuid) to authenticated;
grant execute on function public.ensure_calendar_export_token(uuid,uuid) to authenticated;
grant execute on function public.rotate_calendar_export_token(uuid,uuid) to authenticated;
grant execute on function public.create_ical_connection(uuid,text,text,text) to authenticated;
grant execute on function public.disable_calendar_connection(uuid,uuid) to authenticated;
grant execute on function public.create_owner_availability_block(uuid,date,date,text) to authenticated;
grant execute on function public.cancel_owner_availability_block(uuid,uuid) to authenticated;
grant execute on function public.apply_ical_sync(uuid,jsonb) to authenticated;
grant execute on function public.mark_calendar_sync_error(uuid,text) to authenticated;
grant execute on function public.check_unit_availability(uuid,date,date) to anon, authenticated;
grant execute on function public.calendar_export_payload(uuid) to anon, authenticated;

comment on table public.calendar_connections is
  'Unit-scoped external calendar/PMS connections. Connection identity is preserved so one sync can only mutate its own imported availability blocks.';
comment on table public.availability_blocks is
  'Canonical unit-level unavailable ranges using exclusive checkout semantics [start_date, end_date). Owner, external and future reservation/hold sources remain distinct.';
comment on table public.calendar_export_tokens is
  'Tokenized iCal exports. Source-specific tokens can exclude the source connection to prevent a channel from receiving its own imported events back.';
comment on function public.check_unit_availability(uuid,date,date) is
  'Authoritative availability boundary. Pricing remains independent and is resolved by the Milestone 9A pricing functions.';

commit;
