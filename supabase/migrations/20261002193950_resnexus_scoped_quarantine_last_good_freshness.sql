begin;

alter table public.resnexus_unresolved_windows
  add column if not exists resource_key text;

create index if not exists resnexus_unresolved_windows_active_resource_dates_idx
  on public.resnexus_unresolved_windows
    (browser_account_id, resource_key, start_date, end_date, last_seen_at desc)
  where state = 'ACTIVE';

create or replace function public.reject_ambiguous_resnexus_availability_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_account_id uuid;
  target_resource_key text;
  base_key text;
  unresolved_key text;
begin
  if coalesce(new.metadata ->> 'provider', '') <> 'RESNEXUS'
     or coalesce(new.metadata ->> 'extractor', '') <>
       'ambiguous_reservation_safety_block'
  then
    return new;
  end if;

  select
    mappings.browser_account_id,
    mappings.resource_key
  into
    target_account_id,
    target_resource_key
  from public.resnexus_resource_mappings mappings
  where mappings.calendar_connection_id = new.connection_id
  limit 1;

  if target_account_id is null then
    raise exception
      'Ambiguous ResNexus reservation cannot change availability until it resolves to one exact room/site';
  end if;

  target_resource_key := coalesce(
    nullif(trim(new.metadata ->> 'resnexus_resource_key'), ''),
    nullif(trim(target_resource_key), '')
  );

  base_key := coalesce(
    nullif(trim(new.external_uid), ''),
    nullif(trim(new.external_event_key), ''),
    md5(
      target_account_id::text || '|' ||
      new.start_date::text || '|' ||
      new.end_date::text || '|' ||
      coalesce(new.metadata::text, '')
    )
  );

  unresolved_key := left(
    coalesce(md5(target_resource_key), md5('account-wide')) || ':' || base_key,
    500
  );

  insert into public.resnexus_unresolved_windows (
    browser_account_id,
    resource_key,
    source_key,
    start_date,
    end_date,
    metadata,
    state,
    first_seen_at,
    last_seen_at,
    updated_at
  ) values (
    target_account_id,
    target_resource_key,
    unresolved_key,
    new.start_date,
    new.end_date,
    coalesce(new.metadata, '{}'::jsonb),
    'ACTIVE',
    now(),
    now(),
    now()
  )
  on conflict (browser_account_id, source_key, start_date, end_date)
  do update set
    resource_key = excluded.resource_key,
    metadata = excluded.metadata,
    state = 'ACTIVE',
    last_seen_at = now(),
    updated_at = now();

  return null;
end;
$function$;

revoke all on function public.reject_ambiguous_resnexus_availability_block()
  from public, anon, authenticated;

create or replace function public.resnexus_unit_calendar_state(
  target_unit_id uuid,
  target_check_in date,
  target_check_out date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  has_resnexus boolean := false;
  stale_found boolean := false;
  unresolved_ranges jsonb := '[]'::jsonb;
begin
  if target_unit_id is null
     or target_check_in is null
     or target_check_out is null
     or target_check_out <= target_check_in
  then
    return jsonb_build_object(
      'has_resnexus', false,
      'ready', false,
      'reason', 'A valid stay date range is required.',
      'unresolved_ranges', '[]'::jsonb
    );
  end if;

  select exists (
    select 1
    from public.calendar_connections connections
    join public.resnexus_browser_connections browser
      on browser.calendar_connection_id = connections.id
    where connections.unit_id = target_unit_id
      and connections.provider = 'RESNEXUS'
      and connections.connection_kind = 'BROWSER_WORKER'
      and connections.is_active
      and browser.status <> 'DISABLED'
  ) into has_resnexus;

  if has_resnexus then
    select exists (
      select 1
      from public.calendar_connections connections
      join public.resnexus_browser_connections browser
        on browser.calendar_connection_id = connections.id
      where connections.unit_id = target_unit_id
        and connections.provider = 'RESNEXUS'
        and connections.connection_kind = 'BROWSER_WORKER'
        and connections.is_active
        and browser.status <> 'DISABLED'
        and (
          connections.last_success_at is null
          or connections.last_success_at <
            now() - make_interval(
              mins => greatest(90, browser.sync_interval_minutes * 2 + 15)
            )
        )
    ) into stale_found;
  end if;

  if exists (
    select 1
    from public.resnexus_resource_mappings mappings
    join public.calendar_connections connections
      on connections.id = mappings.calendar_connection_id
    where mappings.unit_id = target_unit_id
      and connections.provider = 'RESNEXUS'
      and connections.connection_kind = 'BROWSER_WORKER'
      and connections.is_active
  ) then
    has_resnexus := true;

    select exists (
      select 1
      from public.resnexus_resource_mappings mappings
      join public.resnexus_browser_accounts accounts
        on accounts.id = mappings.browser_account_id
      join public.calendar_connections connections
        on connections.id = mappings.calendar_connection_id
      where mappings.unit_id = target_unit_id
        and connections.provider = 'RESNEXUS'
        and connections.connection_kind = 'BROWSER_WORKER'
        and connections.is_active
        and (
          accounts.status = 'DISABLED'
          or connections.last_success_at is null
          or mappings.last_success_at is null
          or least(
            connections.last_success_at,
            mappings.last_success_at
          ) <
            now() - make_interval(
              mins => greatest(90, accounts.sync_interval_minutes * 2 + 15)
            )
        )
    ) into stale_found;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'start', windows.start_date,
          'end', windows.end_date
        )
        order by windows.start_date, windows.end_date
      ),
      '[]'::jsonb
    )
    into unresolved_ranges
    from (
      select distinct
        windows.start_date,
        windows.end_date
      from public.resnexus_resource_mappings mappings
      join public.resnexus_unresolved_windows windows
        on windows.browser_account_id = mappings.browser_account_id
       and (
         windows.resource_key is null
         or windows.resource_key = mappings.resource_key
       )
      where mappings.unit_id = target_unit_id
        and windows.state = 'ACTIVE'
        and windows.start_date < target_check_out
        and windows.end_date > target_check_in
    ) windows;
  end if;

  return jsonb_build_object(
    'has_resnexus', has_resnexus,
    'ready', not stale_found,
    'reason', case
      when stale_found then
        'We could not verify the ResNexus calendar availability source. Please try again in a moment.'
      else null
    end,
    'unresolved_ranges', unresolved_ranges
  );
end;
$function$;

revoke all on function public.resnexus_unit_calendar_state(uuid, date, date)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
