begin;

-- Find A Place Booking system dependency contracts.
-- Forward-safe: existing published/paused listings and confirmed reservations
-- are not rewritten or forced through new onboarding gates.

-- ---------------------------------------------------------------------------
-- 1) ResNexus ambiguous reservations: quarantine the unresolved date window
-- instead of aborting a whole multi-property account sync.
-- ---------------------------------------------------------------------------

create table if not exists public.resnexus_unresolved_windows (
  id uuid primary key default gen_random_uuid(),
  browser_account_id uuid not null
    references public.resnexus_browser_accounts(id) on delete cascade,
  source_key text not null,
  start_date date not null,
  end_date date not null,
  metadata jsonb not null default '{}'::jsonb,
  state text not null default 'ACTIVE'
    check (state in ('ACTIVE','CANCELLED')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resnexus_unresolved_windows_valid_range
    check (end_date > start_date),
  constraint resnexus_unresolved_windows_source_key_length
    check (char_length(trim(source_key)) between 1 and 500),
  constraint resnexus_unresolved_windows_metadata_object
    check (jsonb_typeof(metadata) = 'object'),
  constraint resnexus_unresolved_windows_identity_unique
    unique (browser_account_id, source_key, start_date, end_date)
);

create index if not exists resnexus_unresolved_windows_active_dates_idx
  on public.resnexus_unresolved_windows
    (browser_account_id, start_date, end_date, last_seen_at desc)
  where state = 'ACTIVE';

alter table public.resnexus_unresolved_windows enable row level security;
revoke all on table public.resnexus_unresolved_windows
  from public, anon, authenticated;
grant select, insert, update, delete on table public.resnexus_unresolved_windows
  to service_role;

create or replace function public.reject_ambiguous_resnexus_availability_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_account_id uuid;
  unresolved_key text;
begin
  if coalesce(new.metadata ->> 'provider', '') <> 'RESNEXUS'
     or coalesce(new.metadata ->> 'extractor', '') <>
       'ambiguous_reservation_safety_block'
  then
    return new;
  end if;

  select mappings.browser_account_id
  into target_account_id
  from public.resnexus_resource_mappings mappings
  where mappings.calendar_connection_id = new.connection_id
  limit 1;

  -- Legacy single-unit browser connectors do not expose an account mapping.
  -- Keep their prior fail-closed behavior rather than guessing ownership.
  if target_account_id is null then
    raise exception
      'Ambiguous ResNexus reservation cannot change availability until it resolves to one exact room/site';
  end if;

  unresolved_key := left(
    coalesce(
      nullif(trim(new.external_uid), ''),
      nullif(trim(new.external_event_key), ''),
      md5(
        target_account_id::text || '|' ||
        new.start_date::text || '|' ||
        new.end_date::text || '|' ||
        coalesce(new.metadata::text, '')
      )
    ),
    500
  );

  insert into public.resnexus_unresolved_windows (
    browser_account_id,
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
    metadata = excluded.metadata,
    state = 'ACTIVE',
    last_seen_at = now(),
    updated_at = now();

  -- Skip only the unsafe per-unit fan-out row. Exact room/site rows in the same
  -- account sync continue normally.
  return null;
end;
$function$;

revoke all on function public.reject_ambiguous_resnexus_availability_block()
  from public, anon, authenticated;

drop trigger if exists availability_blocks_reject_ambiguous_resnexus
  on public.availability_blocks;

create trigger availability_blocks_reject_ambiguous_resnexus
before insert or update
on public.availability_blocks
for each row
execute function public.reject_ambiguous_resnexus_availability_block();

-- A clean later account sync retires unresolved windows that were not seen
-- again. A one-minute cushion keeps windows captured earlier in the same sync.
create or replace function public.cancel_stale_resnexus_unresolved_windows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.last_success_at is null
     or new.last_success_at is not distinct from old.last_success_at
  then
    return new;
  end if;

  update public.resnexus_unresolved_windows windows
  set state = 'CANCELLED',
      updated_at = now()
  where windows.browser_account_id = new.id
    and windows.state = 'ACTIVE'
    and windows.last_seen_at < new.last_success_at - interval '1 minute';

  return new;
end;
$function$;

revoke all on function public.cancel_stale_resnexus_unresolved_windows()
  from public, anon, authenticated;

drop trigger if exists resnexus_accounts_cancel_stale_unresolved_windows
  on public.resnexus_browser_accounts;

create trigger resnexus_accounts_cancel_stale_unresolved_windows
after update of last_success_at
on public.resnexus_browser_accounts
for each row
execute function public.cancel_stale_resnexus_unresolved_windows();

-- Internal canonical ResNexus state used by DB triggers and service wrappers.
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

  -- Legacy single-unit browser connector, retained for compatibility.
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
          connections.sync_status <> 'HEALTHY'
          or connections.last_success_at is null
          or connections.last_success_at <
            now() - make_interval(
              mins => greatest(90, browser.sync_interval_minutes * 2 + 15)
            )
        )
    ) into stale_found;
  end if;

  -- Current account/resource mapping connector.
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
          or mappings.status <> 'ACTIVE'
          or connections.sync_status <> 'HEALTHY'
          or connections.last_success_at is null
          or connections.last_success_at <
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

create or replace function public.service_resnexus_unit_calendar_state(
  target_unit_id uuid,
  target_check_in date,
  target_check_out date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select public.resnexus_unit_calendar_state(
    target_unit_id,
    target_check_in,
    target_check_out
  );
$function$;

revoke all on function public.service_resnexus_unit_calendar_state(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.service_resnexus_unit_calendar_state(uuid, date, date)
  to service_role;

create or replace function public.service_assert_resnexus_unit_availability_ready(
  target_unit_id uuid,
  target_check_in date,
  target_check_out date
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  state jsonb;
  unresolved_count integer;
begin
  state := public.resnexus_unit_calendar_state(
    target_unit_id,
    target_check_in,
    target_check_out
  );

  if not coalesce((state ->> 'ready')::boolean, false) then
    raise exception '%', coalesce(
      state ->> 'reason',
      'We could not verify the ResNexus calendar availability source. Please try again in a moment.'
    );
  end if;

  unresolved_count := jsonb_array_length(
    coalesce(state -> 'unresolved_ranges', '[]'::jsonb)
  );

  if unresolved_count > 0 then
    raise exception
      'ResNexus has an unresolved reservation on these dates. Please choose different dates or try again after the host resolves the reservation mapping.';
  end if;
end;
$function$;

revoke all on function public.service_assert_resnexus_unit_availability_ready(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.service_assert_resnexus_unit_availability_ready(uuid, date, date)
  to service_role;

-- Use the same ResNexus rule for new holds/payment-pending rows and for a
-- host-approved date move of an already-confirmed reservation.
create or replace function public.guard_resnexus_browser_hold_freshness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  state jsonb;
begin
  if new.status in ('HOLD', 'PAYMENT_PENDING')
     or (
       tg_op = 'UPDATE'
       and new.status = 'CONFIRMED'
       and (
         new.unit_id is distinct from old.unit_id
         or new.check_in is distinct from old.check_in
         or new.check_out is distinct from old.check_out
       )
     )
  then
    state := public.resnexus_unit_calendar_state(
      new.unit_id,
      new.check_in,
      new.check_out
    );

    if not coalesce((state ->> 'ready')::boolean, false) then
      raise exception '%', coalesce(
        state ->> 'reason',
        'We could not verify the ResNexus calendar availability source. Please try again in a moment.'
      );
    end if;

    if jsonb_array_length(
      coalesce(state -> 'unresolved_ranges', '[]'::jsonb)
    ) > 0 then
      raise exception
        'ResNexus has an unresolved reservation on these dates. Please choose different dates or try again after the host resolves the reservation mapping.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_resnexus_browser_hold_freshness()
  from public, anon, authenticated;

drop trigger if exists reservations_resnexus_browser_freshness_guard
  on public.reservations;
drop trigger if exists reservations_guard_resnexus_browser_freshness
  on public.reservations;

create trigger reservations_resnexus_browser_freshness_guard
before insert or update of unit_id, status, check_in, check_out
on public.reservations
for each row
execute function public.guard_resnexus_browser_hold_freshness();

-- ---------------------------------------------------------------------------
-- 2) First publication only: a new external-calendar listing must have one
-- successful sync before becoming guest-bookable. Existing published/paused
-- properties are exempt because they already have published_at populated.
-- ---------------------------------------------------------------------------

create or replace function public.guard_first_publish_calendar_readiness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  primary_unit_id uuid;
  calendar_choice text;
  ready_connection boolean := false;
begin
  if new.status <> 'PUBLISHED'
     or old.status = 'PUBLISHED'
     or old.published_at is not null
  then
    return new;
  end if;

  calendar_choice := upper(coalesce(new.calendar_preference::text, 'UNSET'));

  if calendar_choice = 'NONE' then
    return new;
  end if;

  if calendar_choice = 'UNSET' then
    raise exception
      'Choose how this new listing will manage availability before it goes live. The listing is saved as a draft.';
  end if;

  select units.id
  into primary_unit_id
  from public.property_units units
  where units.property_id = new.id
    and units.is_primary
    and units.is_active
  order by units.created_at asc
  limit 1;

  if primary_unit_id is null then
    raise exception
      'The listing needs an active primary rentable unit before it can go live.';
  end if;

  if calendar_choice = 'ICAL' then
    select exists (
      select 1
      from public.calendar_connections connections
      where connections.unit_id = primary_unit_id
        and connections.is_active
        and connections.connection_kind = 'ICAL'
        and connections.sync_status = 'HEALTHY'
        and connections.last_success_at is not null
    ) into ready_connection;

    if not ready_connection then
      raise exception
        'Connect and successfully sync the external iCal calendar before this new listing goes live. The listing is saved as a draft.';
    end if;
  elsif calendar_choice = 'PMS' then
    select exists (
      select 1
      from public.calendar_connections connections
      where connections.unit_id = primary_unit_id
        and connections.is_active
        and connections.connection_kind in ('PMS_API', 'BROWSER_WORKER')
        and connections.sync_status = 'HEALTHY'
        and connections.last_success_at is not null
    ) into ready_connection;

    if not ready_connection then
      raise exception
        'Connect and successfully sync the PMS calendar before this new listing goes live. The listing is saved as a draft.';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.guard_first_publish_calendar_readiness()
  from public, anon, authenticated;

drop trigger if exists properties_guard_first_publish_calendar
  on public.properties;
drop trigger if exists properties_first_publish_external_calendar_guard
  on public.properties;

create trigger properties_guard_first_publish_calendar
before update of status
on public.properties
for each row
execute function public.guard_first_publish_calendar_readiness();

-- ---------------------------------------------------------------------------
-- 3) Expire only abandoned holds that never created a payment row. Anything
-- that touched Stripe is intentionally left for reconciliation.
-- ---------------------------------------------------------------------------

create or replace function public.service_expire_abandoned_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  candidate_ids uuid[] := '{}'::uuid[];
  expired_ids uuid[] := '{}'::uuid[];
  changed_count integer := 0;
begin
  select coalesce(array_agg(candidate.id), '{}'::uuid[])
  into candidate_ids
  from (
    select reservations.id
    from public.reservations reservations
    where reservations.status = 'HOLD'
      and reservations.hold_expires_at is not null
      and reservations.hold_expires_at <= now()
      and not exists (
        select 1
        from public.payments payments
        where payments.reservation_id = reservations.id
      )
    for update skip locked
  ) candidate;

  if cardinality(candidate_ids) = 0 then
    return 0;
  end if;

  with expired as (
    update public.reservations reservations
    set status = 'EXPIRED',
        updated_at = now()
    where reservations.id = any(candidate_ids)
      and reservations.status = 'HOLD'
      and reservations.hold_expires_at <= now()
      and not exists (
        select 1
        from public.payments payments
        where payments.reservation_id = reservations.id
      )
    returning reservations.id
  )
  select coalesce(array_agg(expired.id), '{}'::uuid[])
  into expired_ids
  from expired;

  changed_count := cardinality(expired_ids);
  if changed_count = 0 then
    return 0;
  end if;

  update public.availability_blocks blocks
  set state = 'CANCELLED',
      updated_at = now()
  where blocks.reservation_id = any(expired_ids)
    and blocks.block_type = 'INTERNAL_HOLD'
    and blocks.state = 'ACTIVE';

  update public.promotion_reservations promo_reservations
  set status = 'RELEASED',
      released_at = now()
  where promo_reservations.reservation_id = any(expired_ids)
    and promo_reservations.status = 'RESERVED';

  insert into public.reservation_events (
    reservation_id,
    event_type,
    actor_profile_id,
    metadata
  )
  select
    expired.reservation_id,
    'HOLD_EXPIRED',
    null,
    jsonb_build_object(
      'expired_at', now(),
      'source', 'service_expire_abandoned_holds',
      'payment_record_present', false
    )
  from unnest(expired_ids) as expired(reservation_id);

  return changed_count;
end;
$function$;

revoke all on function public.service_expire_abandoned_holds()
  from public, anon, authenticated;
grant execute on function public.service_expire_abandoned_holds()
  to service_role;

notify pgrst, 'reload schema';

commit;
