-- Find A Place Booking
-- Temporary ResNexus persistent-browser availability connector.

begin;

create table if not exists public.resnexus_browser_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  unit_id uuid not null unique
    references public.property_units(id) on delete cascade,
  calendar_connection_id uuid not null unique
    references public.calendar_connections(id) on delete cascade,

  login_ciphertext text not null,
  password_ciphertext text not null,
  session_ciphertext text,
  challenge_ciphertext text,
  challenge_expires_at timestamptz,

  resource_match text,
  discovered_resources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(discovered_resources) = 'array'),
  diagnostic jsonb not null default '{}'::jsonb
    check (jsonb_typeof(diagnostic) = 'object'),

  status text not null default 'PENDING'
    check (
      status in (
        'PENDING',
        'REFRESHING',
        'CONNECTED',
        'NEEDS_ATTENTION',
        'ERROR',
        'DISABLED'
      )
    ),
  attention_code text,
  attention_message text,
  sync_interval_minutes integer not null default 60
    check (sync_interval_minutes between 15 and 240),
  next_sync_at timestamptz not null default now(),
  lease_owner text,
  lease_until timestamptz,

  last_attempt_at timestamptz,
  last_login_at timestamptz,
  last_session_refresh_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,

  empty_snapshot_count integer not null default 0,
  empty_snapshot_first_at timestamptz,

  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint resnexus_browser_login_check
    check (char_length(login_ciphertext) between 20 and 12000),
  constraint resnexus_browser_password_check
    check (char_length(password_ciphertext) between 20 and 12000),
  constraint resnexus_browser_session_check
    check (
      session_ciphertext is null
      or char_length(session_ciphertext) between 20 and 1000000
    ),
  constraint resnexus_browser_resource_match_check
    check (
      resource_match is null
      or char_length(trim(resource_match)) between 1 and 240
    ),
  constraint resnexus_browser_error_check
    check (last_error is null or char_length(last_error) <= 1000),
  constraint resnexus_browser_attention_check
    check (
      attention_message is null
      or char_length(attention_message) <= 1000
    )
);

create index if not exists resnexus_browser_due_idx
  on public.resnexus_browser_connections(
    status,
    next_sync_at,
    lease_until
  )
  where status <> 'DISABLED';

create index if not exists resnexus_browser_org_idx
  on public.resnexus_browser_connections(organization_id, status);

drop trigger if exists resnexus_browser_connections_set_updated_at
  on public.resnexus_browser_connections;
create trigger resnexus_browser_connections_set_updated_at
before update on public.resnexus_browser_connections
for each row execute function public.set_updated_at();

alter table public.resnexus_browser_connections enable row level security;
revoke all on table public.resnexus_browser_connections from public;
revoke all on table public.resnexus_browser_connections from anon;
revoke all on table public.resnexus_browser_connections from authenticated;
grant all on table public.resnexus_browser_connections to service_role;

create table if not exists public.resnexus_browser_runs (
  id uuid primary key default gen_random_uuid(),
  browser_connection_id uuid not null
    references public.resnexus_browser_connections(id) on delete cascade,
  calendar_connection_id uuid not null
    references public.calendar_connections(id) on delete cascade,
  status text not null
    check (status in ('SUCCESS', 'EMPTY_CONFIRMATION', 'ERROR', 'NEEDS_ATTENTION')),
  imported_count integer not null default 0,
  deactivated_count integer not null default 0,
  worker_id text,
  diagnostic jsonb not null default '{}'::jsonb
    check (jsonb_typeof(diagnostic) = 'object'),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  constraint resnexus_browser_runs_error_check
    check (error_message is null or char_length(error_message) <= 1000)
);

create index if not exists resnexus_browser_runs_connection_idx
  on public.resnexus_browser_runs(browser_connection_id, completed_at desc);

alter table public.resnexus_browser_runs enable row level security;
revoke all on table public.resnexus_browser_runs from public, anon, authenticated;
grant all on table public.resnexus_browser_runs to service_role;

create or replace function public.save_resnexus_browser_connection(
  target_unit_id uuid,
  connection_label text,
  encrypted_login text,
  encrypted_password text,
  requested_resource_match text default null,
  requested_sync_interval integer default 60
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  target_org_id uuid;
  existing_row public.resnexus_browser_connections%rowtype;
  connection_id uuid;
  browser_id uuid;
  safe_label text := left(
    coalesce(nullif(trim(connection_label), ''), 'ResNexus browser sync'),
    120
  );
  safe_resource text := left(nullif(trim(requested_resource_match), ''), 240);
  safe_interval integer := greatest(15, least(coalesce(requested_sync_interval, 60), 240));
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if encrypted_login is null or char_length(encrypted_login) < 20 then
    raise exception 'Encrypted ResNexus login is required';
  end if;

  if encrypted_password is null or char_length(encrypted_password) < 20 then
    raise exception 'Encrypted ResNexus password is required';
  end if;

  select properties.organization_id
  into target_org_id
  from public.property_units units
  join public.properties properties
    on properties.id = units.property_id
  where units.id = target_unit_id
    and units.is_active;

  if target_org_id is null then
    raise exception 'Rentable unit not found';
  end if;

  if not public.can_manage_organization(target_org_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_unit_id::text, 0));

  select browser.*
  into existing_row
  from public.resnexus_browser_connections browser
  where browser.unit_id = target_unit_id
  for update;

  if found then
    update public.resnexus_browser_connections browser
    set login_ciphertext = encrypted_login,
        password_ciphertext = encrypted_password,
        session_ciphertext = null,
        challenge_ciphertext = null,
        challenge_expires_at = null,
        resource_match = safe_resource,
        status = 'PENDING',
        attention_code = null,
        attention_message = null,
        sync_interval_minutes = safe_interval,
        next_sync_at = now(),
        lease_owner = null,
        lease_until = null,
        last_error = null,
        last_error_at = null,
        consecutive_failures = 0,
        empty_snapshot_count = 0,
        empty_snapshot_first_at = null,
        updated_at = now()
    where browser.id = existing_row.id;

    update public.calendar_connections connections
    set label = safe_label,
        is_active = true,
        sync_status = 'NEVER_SYNCED',
        last_error = null,
        last_error_at = null,
        updated_at = now()
    where connections.id = existing_row.calendar_connection_id;

    return existing_row.id;
  end if;

  insert into public.calendar_connections (
    unit_id,
    provider,
    connection_kind,
    label,
    feed_url,
    external_calendar_id,
    is_active,
    sync_status,
    created_by
  ) values (
    target_unit_id,
    'RESNEXUS',
    'BROWSER_WORKER',
    safe_label,
    null,
    null,
    true,
    'NEVER_SYNCED',
    actor_id
  )
  returning id into connection_id;

  insert into public.resnexus_browser_connections (
    organization_id,
    unit_id,
    calendar_connection_id,
    login_ciphertext,
    password_ciphertext,
    resource_match,
    sync_interval_minutes,
    created_by
  ) values (
    target_org_id,
    target_unit_id,
    connection_id,
    encrypted_login,
    encrypted_password,
    safe_resource,
    safe_interval,
    actor_id
  )
  returning id into browser_id;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    actor_id,
    'calendar.resnexus_browser.connected',
    'calendar_connection',
    connection_id,
    'Host connected the temporary read-only ResNexus persistent-browser availability worker.',
    jsonb_build_object(
      'organization_id', target_org_id,
      'unit_id', target_unit_id,
      'browser_connection_id', browser_id
    )
  );

  return browser_id;
end;
$function$;

revoke all on function public.save_resnexus_browser_connection(
  uuid, text, text, text, text, integer
) from public;
grant execute on function public.save_resnexus_browser_connection(
  uuid, text, text, text, text, integer
) to authenticated;

create or replace function public.retry_resnexus_browser_connection(
  target_browser_connection_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  row_data public.resnexus_browser_connections%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  select browser.*
  into row_data
  from public.resnexus_browser_connections browser
  where browser.id = target_browser_connection_id
  for update;

  if not found then raise exception 'ResNexus connection not found'; end if;

  if not public.can_manage_organization(row_data.organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  update public.resnexus_browser_connections browser
  set status = 'PENDING',
      attention_code = null,
      attention_message = null,
      next_sync_at = now(),
      lease_owner = null,
      lease_until = null,
      last_error = null,
      last_error_at = null,
      updated_at = now()
  where browser.id = row_data.id;

  update public.calendar_connections connections
  set sync_status = case
        when connections.last_success_at is null then 'NEVER_SYNCED'
        else 'SYNCING'
      end,
      last_error = null,
      last_error_at = null,
      updated_at = now()
  where connections.id = row_data.calendar_connection_id;
end;
$function$;

revoke all on function public.retry_resnexus_browser_connection(uuid)
from public;
grant execute on function public.retry_resnexus_browser_connection(uuid)
to authenticated;

create or replace function public.submit_resnexus_browser_challenge(
  target_browser_connection_id uuid,
  encrypted_challenge text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  row_data public.resnexus_browser_connections%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  if encrypted_challenge is null or char_length(encrypted_challenge) < 20 then
    raise exception 'Encrypted verification code is required';
  end if;

  select browser.*
  into row_data
  from public.resnexus_browser_connections browser
  where browser.id = target_browser_connection_id
  for update;

  if not found then raise exception 'ResNexus connection not found'; end if;

  if not public.can_manage_organization(row_data.organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  update public.resnexus_browser_connections browser
  set challenge_ciphertext = encrypted_challenge,
      challenge_expires_at = now() + interval '10 minutes',
      status = 'PENDING',
      attention_code = null,
      attention_message = null,
      last_error = null,
      last_error_at = null,
      next_sync_at = now(),
      lease_owner = null,
      lease_until = null,
      updated_at = now()
  where browser.id = row_data.id;
end;
$function$;

revoke all on function public.submit_resnexus_browser_challenge(uuid, text)
from public;
grant execute on function public.submit_resnexus_browser_challenge(uuid, text)
to authenticated;

create or replace function public.disable_resnexus_browser_connection(
  target_browser_connection_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  row_data public.resnexus_browser_connections%rowtype;
  removed_count integer := 0;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  select browser.*
  into row_data
  from public.resnexus_browser_connections browser
  where browser.id = target_browser_connection_id
  for update;

  if not found then raise exception 'ResNexus connection not found'; end if;

  if not public.can_manage_organization(row_data.organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(row_data.unit_id::text, 0));

  update public.availability_blocks blocks
  set state = 'CANCELLED',
      updated_at = now()
  where blocks.connection_id = row_data.calendar_connection_id
    and blocks.block_type = 'EXTERNAL_BLOCK'
    and blocks.state = 'ACTIVE';

  get diagnostics removed_count = row_count;

  update public.calendar_connections connections
  set is_active = false,
      sync_status = 'DISABLED',
      updated_at = now()
  where connections.id = row_data.calendar_connection_id;

  update public.resnexus_browser_connections browser
  set status = 'DISABLED',
      login_ciphertext = 'DISABLED',
      password_ciphertext = 'DISABLED',
      session_ciphertext = null,
      challenge_ciphertext = null,
      challenge_expires_at = null,
      lease_owner = null,
      lease_until = null,
      updated_at = now()
  where browser.id = row_data.id;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    actor_id,
    'calendar.resnexus_browser.disabled',
    'calendar_connection',
    row_data.calendar_connection_id,
    'Host disabled the temporary ResNexus browser connector and removed its active imported blocks.',
    jsonb_build_object(
      'browser_connection_id', row_data.id,
      'unit_id', row_data.unit_id,
      'deactivated_blocks', removed_count
    )
  );

  return removed_count;
end;
$function$;

revoke all on function public.disable_resnexus_browser_connection(uuid)
from public;
grant execute on function public.disable_resnexus_browser_connection(uuid)
to authenticated;

create or replace function public.service_claim_resnexus_browser_connection(
  worker_id text,
  lease_seconds integer default 180
)
returns table (
  browser_connection_id uuid,
  organization_id uuid,
  unit_id uuid,
  calendar_connection_id uuid,
  login_ciphertext text,
  password_ciphertext text,
  session_ciphertext text,
  challenge_ciphertext text,
  challenge_expires_at timestamptz,
  resource_match text,
  sync_interval_minutes integer,
  property_time_zone text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  claimed public.resnexus_browser_connections%rowtype;
  safe_lease integer := greatest(60, least(coalesce(lease_seconds, 180), 900));
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select browser.*
  into claimed
  from public.resnexus_browser_connections browser
  where browser.status <> 'DISABLED'
    and (
      browser.next_sync_at <= now()
      or (
        browser.status = 'NEEDS_ATTENTION'
        and browser.challenge_ciphertext is not null
        and browser.challenge_expires_at > now()
      )
    )
    and (
      browser.lease_until is null
      or browser.lease_until < now()
    )
  order by browser.next_sync_at asc, browser.created_at asc
  for update skip locked
  limit 1;

  if not found then return; end if;

  update public.resnexus_browser_connections browser
  set status = 'REFRESHING',
      lease_owner = left(worker_id, 200),
      lease_until = now() + make_interval(secs => safe_lease),
      last_attempt_at = now(),
      updated_at = now()
  where browser.id = claimed.id;

  update public.calendar_connections connections
  set sync_status = 'SYNCING',
      last_sync_attempt_at = now(),
      updated_at = now()
  where connections.id = claimed.calendar_connection_id
    and connections.is_active;

  return query
  select
    claimed.id,
    claimed.organization_id,
    claimed.unit_id,
    claimed.calendar_connection_id,
    claimed.login_ciphertext,
    claimed.password_ciphertext,
    claimed.session_ciphertext,
    claimed.challenge_ciphertext,
    claimed.challenge_expires_at,
    claimed.resource_match,
    claimed.sync_interval_minutes,
    (
      select properties.time_zone
      from public.property_units units
      join public.properties properties
        on properties.id = units.property_id
      where units.id = claimed.unit_id
      limit 1
    );
end;
$function$;

revoke all on function public.service_claim_resnexus_browser_connection(text, integer)
from public;
grant execute on function public.service_claim_resnexus_browser_connection(text, integer)
to service_role;


create or replace function public.service_apply_resnexus_browser_sync(
  target_browser_connection_id uuid,
  source_blocks jsonb,
  sync_window_start date,
  sync_window_end date,
  encrypted_session text,
  resource_names jsonb,
  worker_id text,
  run_diagnostic jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  browser public.resnexus_browser_connections%rowtype;
  connection public.calendar_connections%rowtype;
  block_row jsonb;
  key_value text;
  uid_value text;
  start_value date;
  end_value date;
  metadata_value jsonb;
  seen_keys text[] := '{}'::text[];
  imported_count integer := 0;
  deactivated_count integer := 0;
  active_count integer := 0;
  empty_age interval;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if source_blocks is null or jsonb_typeof(source_blocks) <> 'array' then
    raise exception 'ResNexus browser sync payload must be an array';
  end if;

  if jsonb_array_length(source_blocks) > 10000 then
    raise exception 'ResNexus browser sync payload contains too many blocks';
  end if;

  if octet_length(source_blocks::text) > 2000000 then
    raise exception 'ResNexus browser sync payload is too large';
  end if;

  if sync_window_start is null
     or sync_window_end is null
     or sync_window_end <= sync_window_start then
    raise exception 'ResNexus browser sync window is invalid';
  end if;

  if encrypted_session is null
     or char_length(encrypted_session) < 20
     or char_length(encrypted_session) > 1000000 then
    raise exception 'Encrypted ResNexus browser session is invalid';
  end if;

  select rows.*
  into browser
  from public.resnexus_browser_connections rows
  where rows.id = target_browser_connection_id
  for update;

  if not found or browser.status = 'DISABLED' then
    raise exception 'ResNexus browser connection is not active';
  end if;

  if browser.lease_owner is distinct from left(worker_id, 200)
     or browser.lease_until is null
     or browser.lease_until < now() then
    raise exception 'ResNexus browser worker lease is not valid';
  end if;

  select connections.*
  into connection
  from public.calendar_connections connections
  where connections.id = browser.calendar_connection_id
    and connections.is_active
    and connections.provider = 'RESNEXUS'
    and connections.connection_kind = 'BROWSER_WORKER'
  for update;

  if not found then
    raise exception 'ResNexus calendar connection is not active';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(connection.unit_id::text, 0));

  -- Empty snapshots are dangerous with a browser scraper. If active imported
  -- blocks already exist, require a second empty result after five minutes
  -- before clearing them.
  if jsonb_array_length(source_blocks) = 0 then
    select count(*)
    into active_count
    from public.availability_blocks blocks
    where blocks.connection_id = connection.id
      and blocks.block_type = 'EXTERNAL_BLOCK'
      and blocks.state = 'ACTIVE'
      and blocks.start_date < sync_window_end
      and blocks.end_date > sync_window_start;

    if active_count > 0 then
      empty_age := now() - coalesce(browser.empty_snapshot_first_at, now());

      if browser.empty_snapshot_count < 1
         or browser.empty_snapshot_first_at is null
         or empty_age > interval '2 hours' then
        update public.resnexus_browser_connections rows
        set empty_snapshot_count = 1,
            empty_snapshot_first_at = now(),
            status = 'ERROR',
            session_ciphertext = encrypted_session,
            discovered_resources = case
              when jsonb_typeof(coalesce(resource_names, '[]'::jsonb)) = 'array'
                then coalesce(resource_names, '[]'::jsonb)
              else '[]'::jsonb
            end,
            diagnostic = case
              when jsonb_typeof(coalesce(run_diagnostic, '{}'::jsonb)) = 'object'
                then coalesce(run_diagnostic, '{}'::jsonb)
              else '{}'::jsonb
            end,
            last_error_at = now(),
            last_error = 'ResNexus returned an empty availability snapshot while imported blocks still exist. Existing dates were preserved; a second empty snapshot after five minutes is required before clearing.',
            next_sync_at = now() + interval '5 minutes',
            lease_owner = null,
            lease_until = null,
            challenge_ciphertext = null,
            challenge_expires_at = null,
            updated_at = now()
        where rows.id = browser.id;

        update public.calendar_connections connections
        set sync_status = 'ERROR',
            last_error_at = now(),
            last_error = 'ResNexus returned an unexpected empty snapshot. Existing imported dates were preserved pending confirmation.',
            updated_at = now()
        where connections.id = connection.id;

        insert into public.resnexus_browser_runs (
          browser_connection_id,
          calendar_connection_id,
          status,
          imported_count,
          deactivated_count,
          worker_id,
          diagnostic,
          error_message
        ) values (
          browser.id,
          connection.id,
          'EMPTY_CONFIRMATION',
          0,
          0,
          left(worker_id, 200),
          case
            when jsonb_typeof(coalesce(run_diagnostic, '{}'::jsonb)) = 'object'
              then coalesce(run_diagnostic, '{}'::jsonb)
            else '{}'::jsonb
          end,
          'First empty snapshot preserved existing availability.'
        );

        return jsonb_build_object(
          'requires_empty_confirmation', true,
          'preserved_blocks', active_count
        );
      end if;

      if empty_age < interval '5 minutes' then
        update public.resnexus_browser_connections rows
        set status = 'ERROR',
            session_ciphertext = encrypted_session,
            next_sync_at = browser.empty_snapshot_first_at + interval '5 minutes',
            lease_owner = null,
            lease_until = null,
            challenge_ciphertext = null,
            challenge_expires_at = null,
            updated_at = now()
        where rows.id = browser.id;

        return jsonb_build_object(
          'requires_empty_confirmation', true,
          'preserved_blocks', active_count
        );
      end if;
    end if;
  end if;

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
      raise exception 'Imported ResNexus block is missing a stable identifier';
    end if;

    begin
      start_value := (block_row ->> 'start')::date;
      end_value := (block_row ->> 'end')::date;
    exception when others then
      raise exception 'Imported ResNexus block has invalid dates';
    end;

    if end_value <= start_value then
      raise exception 'Imported ResNexus block must end after it starts';
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
      connection.unit_id,
      connection.id,
      'EXTERNAL_BLOCK',
      'ACTIVE',
      start_value,
      end_value,
      'ResNexus unavailable',
      key_value,
      uid_value,
      metadata_value || jsonb_build_object(
        'provider', 'RESNEXUS',
        'source', 'persistent_browser'
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
  where blocks.connection_id = connection.id
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
  where connections.id = connection.id;

  update public.resnexus_browser_connections rows
  set status = 'CONNECTED',
      session_ciphertext = encrypted_session,
      challenge_ciphertext = null,
      challenge_expires_at = null,
      discovered_resources = case
        when jsonb_typeof(coalesce(resource_names, '[]'::jsonb)) = 'array'
          then coalesce(resource_names, '[]'::jsonb)
        else '[]'::jsonb
      end,
      diagnostic = case
        when jsonb_typeof(coalesce(run_diagnostic, '{}'::jsonb)) = 'object'
          then coalesce(run_diagnostic, '{}'::jsonb)
        else '{}'::jsonb
      end,
      attention_code = null,
      attention_message = null,
      last_success_at = now(),
      last_session_refresh_at = now(),
      last_error_at = null,
      last_error = null,
      consecutive_failures = 0,
      empty_snapshot_count = 0,
      empty_snapshot_first_at = null,
      next_sync_at = now() + make_interval(mins => browser.sync_interval_minutes),
      lease_owner = null,
      lease_until = null,
      updated_at = now()
  where rows.id = browser.id;

  insert into public.resnexus_browser_runs (
    browser_connection_id,
    calendar_connection_id,
    status,
    imported_count,
    deactivated_count,
    worker_id,
    diagnostic
  ) values (
    browser.id,
    connection.id,
    'SUCCESS',
    imported_count,
    deactivated_count,
    left(worker_id, 200),
    case
      when jsonb_typeof(coalesce(run_diagnostic, '{}'::jsonb)) = 'object'
        then coalesce(run_diagnostic, '{}'::jsonb)
      else '{}'::jsonb
    end
  );

  insert into public.calendar_sync_runs (
    connection_id,
    status,
    imported_count,
    deactivated_count,
    actor_profile_id
  ) values (
    connection.id,
    'SUCCESS',
    imported_count,
    deactivated_count,
    null
  );

  return jsonb_build_object(
    'connection_id', connection.id,
    'unit_id', connection.unit_id,
    'imported_count', imported_count,
    'deactivated_count', deactivated_count,
    'requires_empty_confirmation', false,
    'synced_at', now()
  );
end;
$function$;

revoke all on function public.service_apply_resnexus_browser_sync(
  uuid, jsonb, date, date, text, jsonb, text, jsonb
) from public;
grant execute on function public.service_apply_resnexus_browser_sync(
  uuid, jsonb, date, date, text, jsonb, text, jsonb
) to service_role;


create or replace function public.service_finish_resnexus_browser_attempt(
  target_browser_connection_id uuid,
  worker_id text,
  result_status text,
  error_message text,
  attention_reason_code text default null,
  attention_reason_message text default null,
  encrypted_session text default null,
  resource_names jsonb default '[]'::jsonb,
  run_diagnostic jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  browser public.resnexus_browser_connections%rowtype;
  next_time timestamptz;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if result_status not in ('ERROR', 'NEEDS_ATTENTION') then
    raise exception 'Unsupported ResNexus worker result status';
  end if;

  select rows.*
  into browser
  from public.resnexus_browser_connections rows
  where rows.id = target_browser_connection_id
  for update;

  if not found then
    raise exception 'ResNexus browser connection not found';
  end if;

  if browser.lease_owner is distinct from left(worker_id, 200) then
    raise exception 'ResNexus browser worker lease owner does not match';
  end if;

  if result_status = 'NEEDS_ATTENTION' then
    next_time := now() + interval '24 hours';
  else
    next_time := now() + make_interval(
      mins => least(60, greatest(10, (browser.consecutive_failures + 1) * 10))
    );
  end if;

  update public.resnexus_browser_connections rows
  set status = result_status,
      session_ciphertext = coalesce(encrypted_session, rows.session_ciphertext),
      discovered_resources = case
        when jsonb_typeof(coalesce(resource_names, '[]'::jsonb)) = 'array'
          then coalesce(resource_names, '[]'::jsonb)
        else rows.discovered_resources
      end,
      diagnostic = case
        when jsonb_typeof(coalesce(run_diagnostic, '{}'::jsonb)) = 'object'
          then coalesce(run_diagnostic, '{}'::jsonb)
        else rows.diagnostic
      end,
      attention_code = case
        when result_status = 'NEEDS_ATTENTION'
          then left(attention_reason_code, 120)
        else null
      end,
      attention_message = case
        when result_status = 'NEEDS_ATTENTION'
          then left(attention_reason_message, 1000)
        else null
      end,
      last_error_at = now(),
      last_error = left(
        coalesce(error_message, 'ResNexus browser sync failed.'),
        1000
      ),
      consecutive_failures = rows.consecutive_failures + 1,
      next_sync_at = next_time,
      lease_owner = null,
      lease_until = null,
      -- Verification codes are one-time. Never spin/retry a consumed or bad code.
      challenge_ciphertext = null,
      challenge_expires_at = null,
      updated_at = now()
  where rows.id = browser.id;

  update public.calendar_connections connections
  set sync_status = 'ERROR',
      last_error_at = now(),
      last_error = left(
        coalesce(error_message, 'ResNexus browser sync failed.'),
        1000
      ),
      updated_at = now()
  where connections.id = browser.calendar_connection_id;

  insert into public.resnexus_browser_runs (
    browser_connection_id,
    calendar_connection_id,
    status,
    imported_count,
    deactivated_count,
    worker_id,
    diagnostic,
    error_message
  ) values (
    browser.id,
    browser.calendar_connection_id,
    result_status,
    0,
    0,
    left(worker_id, 200),
    case
      when jsonb_typeof(coalesce(run_diagnostic, '{}'::jsonb)) = 'object'
        then coalesce(run_diagnostic, '{}'::jsonb)
      else '{}'::jsonb
    end,
    left(coalesce(error_message, 'ResNexus browser sync failed.'), 1000)
  );
end;
$function$;

revoke all on function public.service_finish_resnexus_browser_attempt(
  uuid, text, text, text, text, text, text, jsonb, jsonb
) from public;
grant execute on function public.service_finish_resnexus_browser_attempt(
  uuid, text, text, text, text, text, text, jsonb, jsonb
) to service_role;


create or replace function public.guard_resnexus_browser_hold_freshness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  stale record;
begin
  if new.status not in ('HOLD', 'PAYMENT_PENDING') then
    return new;
  end if;

  select
    connections.id,
    connections.last_success_at,
    connections.sync_status,
    browser.sync_interval_minutes
  into stale
  from public.calendar_connections connections
  join public.resnexus_browser_connections browser
    on browser.calendar_connection_id = connections.id
  where connections.unit_id = new.unit_id
    and connections.provider = 'RESNEXUS'
    and connections.connection_kind = 'BROWSER_WORKER'
    and connections.is_active
    and browser.status <> 'DISABLED'
    and (
      connections.sync_status <> 'HEALTHY'
      or connections.last_success_at is null
      or connections.last_success_at <
        now() - make_interval(
          mins => greatest(90, browser.sync_interval_minutes * 2 + 15)
        )
    )
  limit 1;

  if found then
    raise exception
      'We could not verify the ResNexus calendar availability source. Please try booking again in a moment.';
  end if;

  return new;
end;
$function$;

drop trigger if exists reservations_resnexus_browser_freshness_guard
  on public.reservations;
create trigger reservations_resnexus_browser_freshness_guard
before insert or update of unit_id, status
on public.reservations
for each row execute function public.guard_resnexus_browser_hold_freshness();

comment on table public.resnexus_browser_connections is
  'Service-role-only encrypted ResNexus login/session state for the temporary persistent browser worker.';
comment on function public.guard_resnexus_browser_hold_freshness() is
  'Fail-closed booking guard for units with an active ResNexus persistent-browser connection whose last successful availability observation is stale.';

commit;
