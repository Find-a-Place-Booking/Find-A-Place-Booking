

begin;

create table if not exists public.resnexus_browser_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,

  label text not null default 'ResNexus',
  login_ciphertext text not null,
  password_ciphertext text not null,
  session_ciphertext text,
  challenge_ciphertext text,
  challenge_expires_at timestamptz,

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
  last_session_refresh_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0,

  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint resnexus_browser_accounts_label_check
    check (char_length(trim(label)) between 1 and 120),
  constraint resnexus_browser_accounts_login_check
    check (char_length(login_ciphertext) between 20 and 12000),
  constraint resnexus_browser_accounts_password_check
    check (char_length(password_ciphertext) between 20 and 12000),
  constraint resnexus_browser_accounts_session_check
    check (
      session_ciphertext is null
      or char_length(session_ciphertext) between 20 and 1000000
    ),
  constraint resnexus_browser_accounts_error_check
    check (last_error is null or char_length(last_error) <= 1000),
  constraint resnexus_browser_accounts_attention_check
    check (
      attention_message is null
      or char_length(attention_message) <= 1000
    )
);

create index if not exists resnexus_browser_accounts_due_idx
  on public.resnexus_browser_accounts(status, next_sync_at, lease_until)
  where status <> 'DISABLED';

create index if not exists resnexus_browser_accounts_org_idx
  on public.resnexus_browser_accounts(organization_id, status);

drop trigger if exists resnexus_browser_accounts_set_updated_at
  on public.resnexus_browser_accounts;
create trigger resnexus_browser_accounts_set_updated_at
before update on public.resnexus_browser_accounts
for each row execute function public.set_updated_at();

alter table public.resnexus_browser_accounts enable row level security;
revoke all on table public.resnexus_browser_accounts
  from public, anon, authenticated;
grant all on table public.resnexus_browser_accounts to service_role;


create table if not exists public.resnexus_resource_mappings (
  id uuid primary key default gen_random_uuid(),
  browser_account_id uuid not null
    references public.resnexus_browser_accounts(id) on delete cascade,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  unit_id uuid not null unique
    references public.property_units(id) on delete cascade,
  calendar_connection_id uuid not null unique
    references public.calendar_connections(id) on delete cascade,

  resource_key text not null,
  resource_label text not null,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'ERROR')),

  empty_snapshot_count integer not null default 0,
  empty_snapshot_first_at timestamptz,

  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint resnexus_resource_mappings_key_check
    check (char_length(trim(resource_key)) between 1 and 160),
  constraint resnexus_resource_mappings_label_check
    check (char_length(trim(resource_label)) between 1 and 240),
  constraint resnexus_resource_mappings_error_check
    check (last_error is null or char_length(last_error) <= 1000),
  constraint resnexus_resource_mappings_account_resource_unique
    unique (browser_account_id, resource_key)
);

create index if not exists resnexus_resource_mappings_account_idx
  on public.resnexus_resource_mappings(browser_account_id, status);

drop trigger if exists resnexus_resource_mappings_set_updated_at
  on public.resnexus_resource_mappings;
create trigger resnexus_resource_mappings_set_updated_at
before update on public.resnexus_resource_mappings
for each row execute function public.set_updated_at();

alter table public.resnexus_resource_mappings enable row level security;
revoke all on table public.resnexus_resource_mappings
  from public, anon, authenticated;
grant all on table public.resnexus_resource_mappings to service_role;


create table if not exists public.resnexus_account_runs (
  id uuid primary key default gen_random_uuid(),
  browser_account_id uuid not null
    references public.resnexus_browser_accounts(id) on delete cascade,
  status text not null
    check (status in ('SUCCESS', 'PARTIAL', 'ERROR', 'NEEDS_ATTENTION')),
  mapping_count integer not null default 0,
  imported_count integer not null default 0,
  deactivated_count integer not null default 0,
  worker_id text,
  diagnostic jsonb not null default '{}'::jsonb
    check (jsonb_typeof(diagnostic) = 'object'),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  constraint resnexus_account_runs_error_check
    check (error_message is null or char_length(error_message) <= 1000)
);

create index if not exists resnexus_account_runs_account_idx
  on public.resnexus_account_runs(browser_account_id, completed_at desc);

alter table public.resnexus_account_runs enable row level security;
revoke all on table public.resnexus_account_runs
  from public, anon, authenticated;
grant all on table public.resnexus_account_runs to service_role;


create or replace function public.save_resnexus_browser_account(
  target_organization_id uuid,
  account_label text,
  encrypted_login text,
  encrypted_password text,
  requested_sync_interval integer default 60,
  target_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  account_id uuid;
  safe_label text := left(
    coalesce(nullif(trim(account_label), ''), 'ResNexus'),
    120
  );
  safe_interval integer := greatest(
    15,
    least(coalesce(requested_sync_interval, 60), 240)
  );
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_organization(target_organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  if encrypted_login is null or char_length(encrypted_login) < 20 then
    raise exception 'Encrypted ResNexus login is required';
  end if;

  if encrypted_password is null or char_length(encrypted_password) < 20 then
    raise exception 'Encrypted ResNexus password is required';
  end if;

  if target_account_id is not null then
    select accounts.id
    into account_id
    from public.resnexus_browser_accounts accounts
    where accounts.id = target_account_id
      and accounts.organization_id = target_organization_id
    for update;

    if account_id is null then
      raise exception 'ResNexus account connection not found';
    end if;

    update public.resnexus_browser_accounts accounts
    set label = safe_label,
        login_ciphertext = encrypted_login,
        password_ciphertext = encrypted_password,
        session_ciphertext = null,
        challenge_ciphertext = null,
        challenge_expires_at = null,
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
        updated_at = now()
    where accounts.id = account_id;

    update public.calendar_connections connections
    set sync_status = 'SYNCING',
        last_error = null,
        last_error_at = null,
        updated_at = now()
    where connections.id in (
      select mappings.calendar_connection_id
      from public.resnexus_resource_mappings mappings
      where mappings.browser_account_id = account_id
    )
      and connections.is_active;

    return account_id;
  end if;

  insert into public.resnexus_browser_accounts (
    organization_id,
    label,
    login_ciphertext,
    password_ciphertext,
    sync_interval_minutes,
    created_by
  ) values (
    target_organization_id,
    safe_label,
    encrypted_login,
    encrypted_password,
    safe_interval,
    actor_id
  )
  returning id into account_id;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    actor_id,
    'calendar.resnexus_browser_account.connected',
    'resnexus_browser_account',
    account_id,
    'Host connected one ResNexus browser account for multi-property availability mapping.',
    jsonb_build_object('organization_id', target_organization_id)
  );

  return account_id;
end;
$function$;

revoke all on function public.save_resnexus_browser_account(
  uuid, text, text, text, integer, uuid
) from public;
grant execute on function public.save_resnexus_browser_account(
  uuid, text, text, text, integer, uuid
) to authenticated;


create or replace function public.replace_resnexus_resource_mappings(
  target_account_id uuid,
  requested_mappings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  account public.resnexus_browser_accounts%rowtype;
  requested_row jsonb;
  requested_unit_id uuid;
  requested_resource_key text;
  requested_resource_label text;
  existing_mapping public.resnexus_resource_mappings%rowtype;
  connection_id uuid;
  requested_unit_ids uuid[] := '{}'::uuid[];
  requested_resource_keys text[] := '{}'::text[];
  removed_count integer := 0;
  saved_count integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if requested_mappings is null
     or jsonb_typeof(requested_mappings) <> 'array' then
    raise exception 'ResNexus mappings must be an array';
  end if;

  if jsonb_array_length(requested_mappings) > 250 then
    raise exception 'Too many ResNexus mappings in one request';
  end if;

  select accounts.*
  into account
  from public.resnexus_browser_accounts accounts
  where accounts.id = target_account_id
  for update;

  if not found then
    raise exception 'ResNexus account connection not found';
  end if;

  if not public.can_manage_organization(account.organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  for requested_row in
    select value from jsonb_array_elements(requested_mappings)
  loop
    begin
      requested_unit_id := (requested_row ->> 'unit_id')::uuid;
    exception when others then
      raise exception 'A ResNexus mapping has an invalid unit id';
    end;

    requested_resource_key := left(
      nullif(trim(coalesce(requested_row ->> 'resource_key', '')), ''),
      160
    );

    if requested_resource_key is null then
      raise exception 'A ResNexus mapping is missing its resource key';
    end if;

    select left(nullif(trim(resource ->> 'label'), ''), 240)
    into requested_resource_label
    from jsonb_array_elements(account.discovered_resources) resource
    where resource ->> 'key' = requested_resource_key
    limit 1;

    if requested_resource_label is null then
      raise exception
        'The selected ResNexus room/unit is no longer in the latest discovered resource list';
    end if;

    if requested_unit_id = any(requested_unit_ids) then
      raise exception 'A Find A Place unit was mapped more than once';
    end if;

    if requested_resource_key = any(requested_resource_keys) then
      raise exception 'A ResNexus room/unit was mapped more than once';
    end if;

    if not exists (
      select 1
      from public.property_units units
      join public.properties properties
        on properties.id = units.property_id
      where units.id = requested_unit_id
        and units.is_active
        and properties.organization_id = account.organization_id
    ) then
      raise exception
        'A selected Find A Place unit does not belong to this host account';
    end if;

    if exists (
      select 1
      from public.resnexus_resource_mappings mappings
      where mappings.unit_id = requested_unit_id
        and mappings.browser_account_id <> account.id
    ) then
      raise exception
        'A Find A Place unit is already mapped to a different ResNexus account';
    end if;

    requested_unit_ids := array_append(requested_unit_ids, requested_unit_id);
    requested_resource_keys := array_append(
      requested_resource_keys,
      requested_resource_key
    );

    perform pg_advisory_xact_lock(
      hashtextextended(requested_unit_id::text, 0)
    );

    select mappings.*
    into existing_mapping
    from public.resnexus_resource_mappings mappings
    where mappings.browser_account_id = account.id
      and mappings.unit_id = requested_unit_id
    for update;

    if found then
      if existing_mapping.resource_key is distinct from requested_resource_key then
        update public.availability_blocks blocks
        set state = 'CANCELLED',
            updated_at = now()
        where blocks.connection_id = existing_mapping.calendar_connection_id
          and blocks.block_type = 'EXTERNAL_BLOCK'
          and blocks.state = 'ACTIVE';
      end if;

      update public.resnexus_resource_mappings mappings
      set resource_key = requested_resource_key,
          resource_label = requested_resource_label,
          status = 'ACTIVE',
          empty_snapshot_count = 0,
          empty_snapshot_first_at = null,
          last_error = null,
          last_error_at = null,
          updated_at = now()
      where mappings.id = existing_mapping.id;

      update public.calendar_connections connections
      set label = left('ResNexus · ' || requested_resource_label, 120),
          external_calendar_id = requested_resource_key,
          is_active = true,
          sync_status = 'SYNCING',
          last_error = null,
          last_error_at = null,
          updated_at = now()
      where connections.id = existing_mapping.calendar_connection_id;

      saved_count := saved_count + 1;
      continue;
    end if;

    insert into public.calendar_connections (
      unit_id,
      provider,
      connection_kind,
      label,
      external_calendar_id,
      is_active,
      sync_status,
      created_by
    ) values (
      requested_unit_id,
      'RESNEXUS',
      'BROWSER_WORKER',
      left('ResNexus · ' || requested_resource_label, 120),
      requested_resource_key,
      true,
      'SYNCING',
      actor_id
    )
    returning id into connection_id;

    insert into public.resnexus_resource_mappings (
      browser_account_id,
      organization_id,
      unit_id,
      calendar_connection_id,
      resource_key,
      resource_label
    ) values (
      account.id,
      account.organization_id,
      requested_unit_id,
      connection_id,
      requested_resource_key,
      requested_resource_label
    );

    saved_count := saved_count + 1;
  end loop;

  for existing_mapping in
    select mappings.*
    from public.resnexus_resource_mappings mappings
    where mappings.browser_account_id = account.id
      and not (mappings.unit_id = any(requested_unit_ids))
    for update
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(existing_mapping.unit_id::text, 0)
    );

    update public.availability_blocks blocks
    set state = 'CANCELLED',
        updated_at = now()
    where blocks.connection_id = existing_mapping.calendar_connection_id
      and blocks.block_type = 'EXTERNAL_BLOCK'
      and blocks.state = 'ACTIVE';

    update public.calendar_connections connections
    set is_active = false,
        sync_status = 'DISABLED',
        updated_at = now()
    where connections.id = existing_mapping.calendar_connection_id;

    delete from public.resnexus_resource_mappings mappings
    where mappings.id = existing_mapping.id;

    removed_count := removed_count + 1;
  end loop;

  update public.resnexus_browser_accounts accounts
  set next_sync_at = now(),
      status = case
        when accounts.status = 'DISABLED' then 'PENDING'
        else accounts.status
      end,
      updated_at = now()
  where accounts.id = account.id;

  return jsonb_build_object(
    'saved_count', saved_count,
    'removed_count', removed_count
  );
end;
$function$;

revoke all on function public.replace_resnexus_resource_mappings(uuid, jsonb)
from public;
grant execute on function public.replace_resnexus_resource_mappings(uuid, jsonb)
to authenticated;


create or replace function public.retry_resnexus_browser_account(
  target_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  account public.resnexus_browser_accounts%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select accounts.*
  into account
  from public.resnexus_browser_accounts accounts
  where accounts.id = target_account_id
  for update;

  if not found then
    raise exception 'ResNexus account connection not found';
  end if;

  if not public.can_manage_organization(account.organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  update public.resnexus_browser_accounts accounts
  set status = 'PENDING',
      attention_code = null,
      attention_message = null,
      next_sync_at = now(),
      lease_owner = null,
      lease_until = null,
      last_error = null,
      last_error_at = null,
      updated_at = now()
  where accounts.id = account.id;

  update public.calendar_connections connections
  set sync_status = 'SYNCING',
      last_error = null,
      last_error_at = null,
      updated_at = now()
  where connections.id in (
    select mappings.calendar_connection_id
    from public.resnexus_resource_mappings mappings
    where mappings.browser_account_id = account.id
  )
    and connections.is_active;
end;
$function$;

revoke all on function public.retry_resnexus_browser_account(uuid) from public;
grant execute on function public.retry_resnexus_browser_account(uuid)
to authenticated;


create or replace function public.submit_resnexus_browser_account_challenge(
  target_account_id uuid,
  encrypted_challenge text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  account public.resnexus_browser_accounts%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if encrypted_challenge is null or char_length(encrypted_challenge) < 20 then
    raise exception 'Encrypted verification code is required';
  end if;

  select accounts.*
  into account
  from public.resnexus_browser_accounts accounts
  where accounts.id = target_account_id
  for update;

  if not found then
    raise exception 'ResNexus account connection not found';
  end if;

  if not public.can_manage_organization(account.organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  update public.resnexus_browser_accounts accounts
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
  where accounts.id = account.id;

  update public.calendar_connections connections
  set sync_status = 'SYNCING',
      updated_at = now()
  where connections.id in (
    select mappings.calendar_connection_id
    from public.resnexus_resource_mappings mappings
    where mappings.browser_account_id = account.id
  )
    and connections.is_active;
end;
$function$;

revoke all on function public.submit_resnexus_browser_account_challenge(uuid, text)
from public;
grant execute on function public.submit_resnexus_browser_account_challenge(uuid, text)
to authenticated;


create or replace function public.disconnect_resnexus_browser_account(
  target_account_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  account public.resnexus_browser_accounts%rowtype;
  mapping public.resnexus_resource_mappings%rowtype;
  removed_blocks integer := 0;
  row_count_value integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select accounts.*
  into account
  from public.resnexus_browser_accounts accounts
  where accounts.id = target_account_id
  for update;

  if not found then
    raise exception 'ResNexus account connection not found';
  end if;

  if not public.can_manage_organization(account.organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  for mapping in
    select mappings.*
    from public.resnexus_resource_mappings mappings
    where mappings.browser_account_id = account.id
    for update
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(mapping.unit_id::text, 0)
    );

    update public.availability_blocks blocks
    set state = 'CANCELLED',
        updated_at = now()
    where blocks.connection_id = mapping.calendar_connection_id
      and blocks.block_type = 'EXTERNAL_BLOCK'
      and blocks.state = 'ACTIVE';

    get diagnostics row_count_value = row_count;
    removed_blocks := removed_blocks + row_count_value;

    update public.calendar_connections connections
    set is_active = false,
        sync_status = 'DISABLED',
        updated_at = now()
    where connections.id = mapping.calendar_connection_id;
  end loop;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    actor_id,
    'calendar.resnexus_browser_account.disconnected',
    'resnexus_browser_account',
    account.id,
    'Host disconnected the ResNexus browser account and removed its active imported availability blocks.',
    jsonb_build_object(
      'organization_id', account.organization_id,
      'removed_blocks', removed_blocks
    )
  );

  delete from public.resnexus_browser_accounts accounts
  where accounts.id = account.id;

  return removed_blocks;
end;
$function$;

revoke all on function public.disconnect_resnexus_browser_account(uuid)
from public;
grant execute on function public.disconnect_resnexus_browser_account(uuid)
to authenticated;


create or replace function public.service_claim_resnexus_browser_account(
  worker_id text,
  lease_seconds integer default 600
)
returns table (
  browser_account_id uuid,
  organization_id uuid,
  login_ciphertext text,
  password_ciphertext text,
  session_ciphertext text,
  challenge_ciphertext text,
  challenge_expires_at timestamptz,
  sync_interval_minutes integer,
  browser_time_zone text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  claimed public.resnexus_browser_accounts%rowtype;
  safe_lease integer := greatest(
    60,
    least(coalesce(lease_seconds, 600), 1800)
  );
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select accounts.*
  into claimed
  from public.resnexus_browser_accounts accounts
  where accounts.status <> 'DISABLED'
    and (
      accounts.next_sync_at <= now()
      or (
        accounts.status = 'NEEDS_ATTENTION'
        and accounts.challenge_ciphertext is not null
        and accounts.challenge_expires_at > now()
      )
    )
    and (
      accounts.lease_until is null
      or accounts.lease_until < now()
    )
  order by accounts.next_sync_at asc, accounts.created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.resnexus_browser_accounts accounts
  set status = 'REFRESHING',
      lease_owner = left(worker_id, 200),
      lease_until = now() + make_interval(secs => safe_lease),
      last_attempt_at = now(),
      updated_at = now()
  where accounts.id = claimed.id;

  update public.calendar_connections connections
  set sync_status = 'SYNCING',
      last_sync_attempt_at = now(),
      updated_at = now()
  where connections.id in (
    select mappings.calendar_connection_id
    from public.resnexus_resource_mappings mappings
    where mappings.browser_account_id = claimed.id
  )
    and connections.is_active;

  return query
  select
    claimed.id,
    claimed.organization_id,
    claimed.login_ciphertext,
    claimed.password_ciphertext,
    claimed.session_ciphertext,
    claimed.challenge_ciphertext,
    claimed.challenge_expires_at,
    claimed.sync_interval_minutes,
    coalesce(
      (
        select properties.time_zone
        from public.resnexus_resource_mappings mappings
        join public.property_units units
          on units.id = mappings.unit_id
        join public.properties properties
          on properties.id = units.property_id
        where mappings.browser_account_id = claimed.id
        order by mappings.created_at asc
        limit 1
      ),
      'America/Chicago'
    );
end;
$function$;

revoke all on function public.service_claim_resnexus_browser_account(text, integer)
from public;
grant execute on function public.service_claim_resnexus_browser_account(text, integer)
to service_role;


create or replace function public.service_apply_resnexus_browser_account_sync(
  target_account_id uuid,
  source_blocks jsonb,
  resource_catalog jsonb,
  sync_window_start date,
  sync_window_end date,
  encrypted_session text,
  worker_id text,
  run_diagnostic jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  account public.resnexus_browser_accounts%rowtype;
  mapping public.resnexus_resource_mappings%rowtype;
  block_row jsonb;

  key_value text;
  uid_value text;
  block_resource_key text;
  block_resource_label text;
  start_value date;
  end_value date;
  metadata_value jsonb;

  seen_keys text[];
  mapping_imported integer;
  mapping_deactivated integer;
  mapping_active_count integer;
  mapping_block_count integer;
  mapping_resource_present boolean;
  mapping_empty_age interval;

  total_imported integer := 0;
  total_deactivated integer := 0;
  mapping_count integer := 0;
  mapping_errors integer := 0;
  empty_confirmations integer := 0;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if source_blocks is null or jsonb_typeof(source_blocks) <> 'array' then
    raise exception 'ResNexus browser sync payload must be an array';
  end if;

  if resource_catalog is null or jsonb_typeof(resource_catalog) <> 'array' then
    raise exception 'ResNexus resource catalog must be an array';
  end if;

  if jsonb_array_length(source_blocks) > 20000 then
    raise exception 'ResNexus browser sync payload contains too many blocks';
  end if;

  if jsonb_array_length(resource_catalog) > 1000 then
    raise exception 'ResNexus resource catalog contains too many resources';
  end if;

  if octet_length(source_blocks::text) > 4000000 then
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

  select accounts.*
  into account
  from public.resnexus_browser_accounts accounts
  where accounts.id = target_account_id
  for update;

  if not found or account.status = 'DISABLED' then
    raise exception 'ResNexus browser account is not active';
  end if;

  if account.lease_owner is distinct from left(worker_id, 200)
     or account.lease_until is null
     or account.lease_until < now() then
    raise exception 'ResNexus browser worker lease is not valid';
  end if;

  -- Validate the complete account snapshot before mutating any mapped unit.
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
    block_resource_key := left(
      nullif(trim(coalesce(block_row ->> 'resource_key', '')), ''),
      160
    );
    block_resource_label := left(
      nullif(trim(coalesce(block_row ->> 'resource_label', '')), ''),
      240
    );

    if key_value is null
       or uid_value is null
       or block_resource_key is null
       or block_resource_label is null then
      raise exception
        'Imported ResNexus block is missing a stable reservation or resource identifier';
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
  end loop;

  for mapping in
    select mappings.*
    from public.resnexus_resource_mappings mappings
    where mappings.browser_account_id = account.id
    order by mappings.created_at asc
    for update
  loop
    mapping_count := mapping_count + 1;
    seen_keys := '{}'::text[];
    mapping_imported := 0;
    mapping_deactivated := 0;
    mapping_block_count := 0;

    perform pg_advisory_xact_lock(
      hashtextextended(mapping.unit_id::text, 0)
    );

    select exists (
      select 1
      from jsonb_array_elements(resource_catalog) resource
      where resource ->> 'key' = mapping.resource_key
    ) into mapping_resource_present;

    if not mapping_resource_present then
      select exists (
        select 1
        from jsonb_array_elements(source_blocks) candidate
        where candidate ->> 'resource_key' = mapping.resource_key
      ) into mapping_resource_present;
    end if;

    if not mapping_resource_present then
      mapping_errors := mapping_errors + 1;

      update public.resnexus_resource_mappings mappings
      set status = 'ERROR',
          last_error_at = now(),
          last_error =
            'The mapped ResNexus room/unit was not present in the latest account calendar snapshot.',
          updated_at = now()
      where mappings.id = mapping.id;

      update public.calendar_connections connections
      set sync_status = 'ERROR',
          last_error_at = now(),
          last_error =
            'The mapped ResNexus room/unit was not present in the latest account calendar snapshot.',
          updated_at = now()
      where connections.id = mapping.calendar_connection_id;

      continue;
    end if;

    for block_row in
      select value
      from jsonb_array_elements(source_blocks)
      where value ->> 'resource_key' = mapping.resource_key
    loop
      key_value := left(trim(block_row ->> 'key'), 500);
      uid_value := left(trim(block_row ->> 'uid'), 500);
      start_value := (block_row ->> 'start')::date;
      end_value := (block_row ->> 'end')::date;

      if end_value <= sync_window_start or start_value >= sync_window_end then
        continue;
      end if;

      if key_value = any(seen_keys) then
        continue;
      end if;

      seen_keys := array_append(seen_keys, key_value);
      mapping_block_count := mapping_block_count + 1;

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
        mapping.unit_id,
        mapping.calendar_connection_id,
        'EXTERNAL_BLOCK',
        'ACTIVE',
        start_value,
        end_value,
        'ResNexus unavailable',
        key_value,
        uid_value,
        metadata_value || jsonb_build_object(
          'provider', 'RESNEXUS',
          'source', 'persistent_browser',
          'resnexus_resource_key', mapping.resource_key,
          'resnexus_resource_label', mapping.resource_label
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

      mapping_imported := mapping_imported + 1;
    end loop;

    if mapping_block_count = 0 then
      select count(*)
      into mapping_active_count
      from public.availability_blocks blocks
      where blocks.connection_id = mapping.calendar_connection_id
        and blocks.block_type = 'EXTERNAL_BLOCK'
        and blocks.state = 'ACTIVE'
        and blocks.start_date < sync_window_end
        and blocks.end_date > sync_window_start;

      if mapping_active_count > 0 then
        mapping_empty_age :=
          now() - coalesce(mapping.empty_snapshot_first_at, now());

        if mapping.empty_snapshot_count < 1
           or mapping.empty_snapshot_first_at is null
           or mapping_empty_age > interval '2 hours' then
          empty_confirmations := empty_confirmations + 1;

          update public.resnexus_resource_mappings mappings
          set status = 'ERROR',
              empty_snapshot_count = 1,
              empty_snapshot_first_at = now(),
              last_error_at = now(),
              last_error =
                'ResNexus returned no unavailable dates for this mapped room/unit. Existing imported dates were preserved pending a second empty snapshot.',
              updated_at = now()
          where mappings.id = mapping.id;

          update public.calendar_connections connections
          set sync_status = 'ERROR',
              last_error_at = now(),
              last_error =
                'ResNexus returned an unexpected empty room/unit snapshot. Existing imported dates were preserved pending confirmation.',
              updated_at = now()
          where connections.id = mapping.calendar_connection_id;

          continue;
        end if;

        if mapping_empty_age < interval '5 minutes' then
          empty_confirmations := empty_confirmations + 1;
          continue;
        end if;
      end if;
    end if;

    update public.availability_blocks blocks
    set state = 'CANCELLED',
        updated_at = now()
    where blocks.connection_id = mapping.calendar_connection_id
      and blocks.block_type = 'EXTERNAL_BLOCK'
      and blocks.state = 'ACTIVE'
      and blocks.start_date < sync_window_end
      and blocks.end_date > sync_window_start
      and not (blocks.external_event_key = any(seen_keys));

    get diagnostics mapping_deactivated = row_count;

    total_imported := total_imported + mapping_imported;
    total_deactivated := total_deactivated + mapping_deactivated;

    update public.resnexus_resource_mappings mappings
    set status = 'ACTIVE',
        empty_snapshot_count = 0,
        empty_snapshot_first_at = null,
        last_success_at = now(),
        last_error_at = null,
        last_error = null,
        updated_at = now()
    where mappings.id = mapping.id;

    update public.calendar_connections connections
    set sync_status = 'HEALTHY',
        last_synced_at = now(),
        last_success_at = now(),
        last_error_at = null,
        last_error = null,
        updated_at = now()
    where connections.id = mapping.calendar_connection_id;
  end loop;

  update public.resnexus_browser_accounts accounts
  set status = case
        when mapping_errors > 0 then 'NEEDS_ATTENTION'
        when empty_confirmations > 0 then 'ERROR'
        else 'CONNECTED'
      end,
      session_ciphertext = encrypted_session,
      challenge_ciphertext = null,
      challenge_expires_at = null,
      discovered_resources = resource_catalog,
      diagnostic = case
        when jsonb_typeof(coalesce(run_diagnostic, '{}'::jsonb)) = 'object'
          then coalesce(run_diagnostic, '{}'::jsonb)
        else '{}'::jsonb
      end,
      attention_code = case
        when mapping_errors > 0 then 'RESOURCE_MAPPING_NOT_FOUND'
        else null
      end,
      attention_message = case
        when mapping_errors > 0
          then 'One or more mapped ResNexus rooms/units disappeared from the latest calendar snapshot. Review the property mappings.'
        else null
      end,
      last_success_at = now(),
      last_session_refresh_at = now(),
      last_error_at = case
        when empty_confirmations > 0 then now()
        else null
      end,
      last_error = case
        when empty_confirmations > 0
          then 'One or more mapped resources returned an unexpected empty snapshot. Existing dates were preserved pending confirmation.'
        else null
      end,
      consecutive_failures = 0,
      next_sync_at = case
        when empty_confirmations > 0
          then now() + interval '5 minutes'
        when mapping_errors > 0
          then now() + interval '60 minutes'
        else now() + make_interval(mins => account.sync_interval_minutes)
      end,
      lease_owner = null,
      lease_until = null,
      updated_at = now()
  where accounts.id = account.id;

  insert into public.resnexus_account_runs (
    browser_account_id,
    status,
    mapping_count,
    imported_count,
    deactivated_count,
    worker_id,
    diagnostic,
    error_message
  ) values (
    account.id,
    case
      when mapping_errors > 0 or empty_confirmations > 0 then 'PARTIAL'
      else 'SUCCESS'
    end,
    mapping_count,
    total_imported,
    total_deactivated,
    left(worker_id, 200),
    case
      when jsonb_typeof(coalesce(run_diagnostic, '{}'::jsonb)) = 'object'
        then coalesce(run_diagnostic, '{}'::jsonb)
      else '{}'::jsonb
    end,
    case
      when mapping_errors > 0
        then mapping_errors::text || ' resource mapping(s) need review.'
      when empty_confirmations > 0
        then empty_confirmations::text || ' mapping(s) are awaiting empty-snapshot confirmation.'
      else null
    end
  );

  return jsonb_build_object(
    'mapping_count', mapping_count,
    'mapping_errors', mapping_errors,
    'empty_confirmations', empty_confirmations,
    'imported_count', total_imported,
    'deactivated_count', total_deactivated,
    'synced_at', now()
  );
end;
$function$;

revoke all on function public.service_apply_resnexus_browser_account_sync(
  uuid, jsonb, jsonb, date, date, text, text, jsonb
) from public;
grant execute on function public.service_apply_resnexus_browser_account_sync(
  uuid, jsonb, jsonb, date, date, text, text, jsonb
) to service_role;


create or replace function public.service_finish_resnexus_browser_account_attempt(
  target_account_id uuid,
  worker_id text,
  result_status text,
  error_message text,
  attention_reason_code text default null,
  attention_reason_message text default null,
  encrypted_session text default null,
  resource_catalog jsonb default '[]'::jsonb,
  run_diagnostic jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  account public.resnexus_browser_accounts%rowtype;
  next_time timestamptz;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if result_status not in ('ERROR', 'NEEDS_ATTENTION') then
    raise exception 'Unsupported ResNexus worker result status';
  end if;

  select accounts.*
  into account
  from public.resnexus_browser_accounts accounts
  where accounts.id = target_account_id
  for update;

  if not found then
    raise exception 'ResNexus browser account not found';
  end if;

  if account.lease_owner is distinct from left(worker_id, 200) then
    raise exception 'ResNexus browser worker lease owner does not match';
  end if;

  next_time := case
    when result_status = 'NEEDS_ATTENTION'
      then now() + interval '24 hours'
    else now() + make_interval(
      mins => least(
        60,
        greatest(10, (account.consecutive_failures + 1) * 10)
      )
    )
  end;

  update public.resnexus_browser_accounts accounts
  set status = result_status,
      session_ciphertext = coalesce(
        encrypted_session,
        accounts.session_ciphertext
      ),
      discovered_resources = case
        when jsonb_typeof(coalesce(resource_catalog, '[]'::jsonb)) = 'array'
             and jsonb_array_length(coalesce(resource_catalog, '[]'::jsonb)) > 0
          then resource_catalog
        else accounts.discovered_resources
      end,
      diagnostic = case
        when jsonb_typeof(coalesce(run_diagnostic, '{}'::jsonb)) = 'object'
          then coalesce(run_diagnostic, '{}'::jsonb)
        else accounts.diagnostic
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
      consecutive_failures = accounts.consecutive_failures + 1,
      next_sync_at = next_time,
      lease_owner = null,
      lease_until = null,
      challenge_ciphertext = null,
      challenge_expires_at = null,
      updated_at = now()
  where accounts.id = account.id;

  update public.resnexus_resource_mappings mappings
  set status = 'ERROR',
      last_error_at = now(),
      last_error = left(
        coalesce(error_message, 'ResNexus browser account sync failed.'),
        1000
      ),
      updated_at = now()
  where mappings.browser_account_id = account.id;

  update public.calendar_connections connections
  set sync_status = 'ERROR',
      last_error_at = now(),
      last_error = left(
        coalesce(error_message, 'ResNexus browser account sync failed.'),
        1000
      ),
      updated_at = now()
  where connections.id in (
    select mappings.calendar_connection_id
    from public.resnexus_resource_mappings mappings
    where mappings.browser_account_id = account.id
  )
    and connections.is_active;

  insert into public.resnexus_account_runs (
    browser_account_id,
    status,
    mapping_count,
    imported_count,
    deactivated_count,
    worker_id,
    diagnostic,
    error_message
  ) values (
    account.id,
    result_status,
    (
      select count(*)
      from public.resnexus_resource_mappings mappings
      where mappings.browser_account_id = account.id
    ),
    0,
    0,
    left(worker_id, 200),
    case
      when jsonb_typeof(coalesce(run_diagnostic, '{}'::jsonb)) = 'object'
        then coalesce(run_diagnostic, '{}'::jsonb)
      else '{}'::jsonb
    end,
    left(
      coalesce(error_message, 'ResNexus browser sync failed.'),
      1000
    )
  );
end;
$function$;

revoke all on function public.service_finish_resnexus_browser_account_attempt(
  uuid, text, text, text, text, text, text, jsonb, jsonb
) from public;
grant execute on function public.service_finish_resnexus_browser_account_attempt(
  uuid, text, text, text, text, text, text, jsonb, jsonb
) to service_role;


-- Replace the earlier per-unit freshness guard with a compatibility guard that
-- recognizes both the old per-unit connector and the new account/resource map.
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

  select source.*
  into stale
  from (
    select
      connections.id,
      connections.last_success_at,
      connections.sync_status,
      browser.sync_interval_minutes
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

    union all

    select
      connections.id,
      connections.last_success_at,
      connections.sync_status,
      accounts.sync_interval_minutes
    from public.resnexus_resource_mappings mappings
    join public.resnexus_browser_accounts accounts
      on accounts.id = mappings.browser_account_id
    join public.calendar_connections connections
      on connections.id = mappings.calendar_connection_id
    where mappings.unit_id = new.unit_id
      and connections.provider = 'RESNEXUS'
      and connections.connection_kind = 'BROWSER_WORKER'
      and connections.is_active
      and (
        mappings.status <> 'ACTIVE'
        or connections.sync_status <> 'HEALTHY'
        or connections.last_success_at is null
        or connections.last_success_at <
          now() - make_interval(
            mins => greatest(90, accounts.sync_interval_minutes * 2 + 15)
          )
      )
  ) source
  limit 1;

  if found then
    raise exception
      'We could not verify the ResNexus calendar availability source. Please try booking again in a moment.';
  end if;

  return new;
end;
$function$;

comment on table public.resnexus_browser_accounts is
  'One encrypted persistent-browser login/session per ResNexus account. A single account can map many ResNexus resources to many Find A Place units.';
comment on table public.resnexus_resource_mappings is
  'Maps a discovered ResNexus room/unit resource to one Find A Place unit/calendar connection.';

commit;
