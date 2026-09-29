-- Find A Place Booking
-- Host-controlled automated guest emails + temporary ResNexus email bridge.
--
-- This migration does not alter booking/payment math, Stripe/Square payment
-- flows, taxes, refunds, payouts, iCal, or ThinkReservations synchronization.
--
-- ResNexus bridge:
--   ResNexus confirmation/update email -> Resend inbound -> verified webhook
--   -> fail-closed parser -> canonical EXTERNAL_BLOCK.
--
-- Find A Place -> ResNexus remains intentionally manual until an official
-- channel/API connection is available. The application sends the host an
-- explicit action-required email for each Find A Place reservation on a
-- bridged unit.

begin;

create table if not exists public.host_guest_email_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  property_id uuid,
  name text not null,
  trigger_event text not null,
  day_offset integer not null default 3,
  send_time_local time without time zone not null default '10:00',
  subject_template text not null,
  body_template text not null,
  require_access_code boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_guest_email_rules_name_check
    check (char_length(trim(name)) between 1 and 120),
  constraint host_guest_email_rules_trigger_check
    check (trigger_event in ('BEFORE_CHECKIN', 'AFTER_CHECKOUT')),
  constraint host_guest_email_rules_day_offset_check
    check (day_offset between 0 and 60),
  constraint host_guest_email_rules_subject_check
    check (char_length(subject_template) between 1 and 200),
  constraint host_guest_email_rules_body_check
    check (char_length(body_template) between 1 and 8000),
  constraint host_guest_email_rules_property_org_fk
    foreign key (property_id, organization_id)
    references public.properties(id, organization_id)
    on delete cascade
);

create index if not exists host_guest_email_rules_due_idx
  on public.host_guest_email_rules(is_active, organization_id, property_id);

drop trigger if exists host_guest_email_rules_updated_at
  on public.host_guest_email_rules;
create trigger host_guest_email_rules_updated_at
before update on public.host_guest_email_rules
for each row execute function public.set_updated_at();

alter table public.host_guest_email_rules enable row level security;

drop policy if exists host_guest_email_rules_select
  on public.host_guest_email_rules;
create policy host_guest_email_rules_select
on public.host_guest_email_rules
for select
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists host_guest_email_rules_insert
  on public.host_guest_email_rules;
create policy host_guest_email_rules_insert
on public.host_guest_email_rules
for insert
to authenticated
with check (
  public.can_manage_organization(organization_id)
  and created_by = (select auth.uid())
);

drop policy if exists host_guest_email_rules_update
  on public.host_guest_email_rules;
create policy host_guest_email_rules_update
on public.host_guest_email_rules
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

drop policy if exists host_guest_email_rules_delete
  on public.host_guest_email_rules;
create policy host_guest_email_rules_delete
on public.host_guest_email_rules
for delete
to authenticated
using (public.can_manage_organization(organization_id));

revoke all on table public.host_guest_email_rules from anon;
grant select, insert, update, delete
  on table public.host_guest_email_rules to authenticated;
grant all on table public.host_guest_email_rules to service_role;

-- Reuse the existing public.can_manage_reservation(uuid) helper.
-- It already preserves active-admin access as well as host owner/manager access.

create table if not exists public.reservation_guest_instructions (
  reservation_id uuid primary key
    references public.reservations(id) on delete cascade,
  access_code text,
  arrival_notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_guest_instructions_access_code_check
    check (access_code is null or char_length(access_code) <= 160),
  constraint reservation_guest_instructions_arrival_notes_check
    check (arrival_notes is null or char_length(arrival_notes) <= 5000)
);

drop trigger if exists reservation_guest_instructions_updated_at
  on public.reservation_guest_instructions;
create trigger reservation_guest_instructions_updated_at
before update on public.reservation_guest_instructions
for each row execute function public.set_updated_at();

alter table public.reservation_guest_instructions enable row level security;

drop policy if exists reservation_guest_instructions_select
  on public.reservation_guest_instructions;
create policy reservation_guest_instructions_select
on public.reservation_guest_instructions
for select
to authenticated
using (public.can_manage_reservation(reservation_id));

drop policy if exists reservation_guest_instructions_insert
  on public.reservation_guest_instructions;
create policy reservation_guest_instructions_insert
on public.reservation_guest_instructions
for insert
to authenticated
with check (
  public.can_manage_reservation(reservation_id)
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists reservation_guest_instructions_update
  on public.reservation_guest_instructions;
create policy reservation_guest_instructions_update
on public.reservation_guest_instructions
for update
to authenticated
using (public.can_manage_reservation(reservation_id))
with check (
  public.can_manage_reservation(reservation_id)
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists reservation_guest_instructions_delete
  on public.reservation_guest_instructions;
create policy reservation_guest_instructions_delete
on public.reservation_guest_instructions
for delete
to authenticated
using (public.can_manage_reservation(reservation_id));

revoke all on table public.reservation_guest_instructions from anon;
grant select, insert, update, delete
  on table public.reservation_guest_instructions to authenticated;
grant all on table public.reservation_guest_instructions to service_role;


-- Keep the generic transactional-email retry queue from later sending stale
-- host automation content after a host edits/pauses/deletes a rule.
create or replace function public.invalidate_host_guest_email_rule_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.notification_deliveries deliveries
  set status = 'SKIPPED',
      last_error = 'Host guest-email automation changed before this retry was sent.',
      updated_at = now()
  where deliveries.notification_type like 'HOST_AUTO:' || old.id::text || ':%'
    and deliveries.status in ('PENDING', 'FAILED');

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.invalidate_host_guest_email_rule_deliveries()
  from public;

-- If a reservation is cancelled or its dates change while a ResNexus/manual
-- outbound notice is waiting for retry, the old notice must never be retried.
-- A new cron pass will create the correct date-specific or cancellation notice.
create or replace function public.invalidate_stale_reservation_automation_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.check_in is distinct from new.check_in
     or old.check_out is distinct from new.check_out
     or old.status is distinct from new.status then
    update public.notification_deliveries deliveries
    set status = 'SKIPPED',
        last_error = 'Reservation state changed before this automated retry was sent.',
        updated_at = now()
    where deliveries.reservation_id = new.id
      and deliveries.status in ('PENDING', 'FAILED')
      and (
        deliveries.notification_type like 'HOST_AUTO:%'
        or deliveries.notification_type like 'RESNEXUS_MANUAL_SYNC:%'
        or (
          deliveries.notification_type like 'RESNEXUS_MANUAL_CANCEL:%'
          and new.status = 'CONFIRMED'
        )
      );
  end if;

  return new;
end;
$function$;

revoke all on function public.invalidate_stale_reservation_automation_deliveries()
  from public;

drop trigger if exists host_guest_email_rules_invalidate_deliveries
  on public.host_guest_email_rules;
create trigger host_guest_email_rules_invalidate_deliveries
after update or delete on public.host_guest_email_rules
for each row execute function public.invalidate_host_guest_email_rule_deliveries();

drop trigger if exists reservations_invalidate_stale_automation_deliveries
  on public.reservations;
create trigger reservations_invalidate_stale_automation_deliveries
after update of status, check_in, check_out on public.reservations
for each row execute function public.invalidate_stale_reservation_automation_deliveries();

create table if not exists public.resnexus_email_bridges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  unit_id uuid not null unique
    references public.property_units(id) on delete cascade,
  connection_id uuid not null unique
    references public.calendar_connections(id) on delete cascade,
  inbound_token uuid not null unique default gen_random_uuid(),
  label text not null default 'ResNexus email bridge',
  status text not null default 'ACTIVE',
  last_email_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resnexus_email_bridges_label_check
    check (char_length(trim(label)) between 1 and 120),
  constraint resnexus_email_bridges_status_check
    check (status in ('ACTIVE', 'PAUSED')),
  constraint resnexus_email_bridges_error_check
    check (last_error is null or char_length(last_error) <= 1000)
);

create index if not exists resnexus_email_bridges_org_idx
  on public.resnexus_email_bridges(organization_id, status);

drop trigger if exists resnexus_email_bridges_updated_at
  on public.resnexus_email_bridges;
create trigger resnexus_email_bridges_updated_at
before update on public.resnexus_email_bridges
for each row execute function public.set_updated_at();

alter table public.resnexus_email_bridges enable row level security;

drop policy if exists resnexus_email_bridges_select
  on public.resnexus_email_bridges;
create policy resnexus_email_bridges_select
on public.resnexus_email_bridges
for select
to authenticated
using (public.can_manage_organization(organization_id));

-- Hosts create/disable bridges through audited RPCs below.
revoke all on table public.resnexus_email_bridges from anon, authenticated;
grant select on table public.resnexus_email_bridges to authenticated;
grant all on table public.resnexus_email_bridges to service_role;

create table if not exists public.resnexus_inbound_events (
  id uuid primary key default gen_random_uuid(),
  bridge_id uuid not null
    references public.resnexus_email_bridges(id) on delete cascade,
  provider_email_id text not null unique,
  source_created_at timestamptz,
  message_id text,
  from_address text,
  subject text,
  status text not null default 'RECEIVED',
  event_type text,
  reservation_reference text,
  parsed_check_in date,
  parsed_check_out date,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint resnexus_inbound_events_status_check
    check (status in (
      'RECEIVED',
      'APPLIED',
      'NEEDS_REVIEW',
      'IGNORED',
      'ERROR'
    )),
  constraint resnexus_inbound_events_event_type_check
    check (
      event_type is null
      or event_type in ('RESERVATION', 'CANCELLATION')
    ),
  constraint resnexus_inbound_events_subject_check
    check (subject is null or char_length(subject) <= 500),
  constraint resnexus_inbound_events_error_check
    check (last_error is null or char_length(last_error) <= 1000)
);

create index if not exists resnexus_inbound_events_bridge_idx
  on public.resnexus_inbound_events(bridge_id, received_at desc);

alter table public.resnexus_inbound_events enable row level security;

drop policy if exists resnexus_inbound_events_select
  on public.resnexus_inbound_events;
create policy resnexus_inbound_events_select
on public.resnexus_inbound_events
for select
to authenticated
using (
  exists (
    select 1
    from public.resnexus_email_bridges bridges
    where bridges.id = bridge_id
      and public.can_manage_organization(bridges.organization_id)
  )
);

revoke all on table public.resnexus_inbound_events from anon, authenticated;
grant select on table public.resnexus_inbound_events to authenticated;
grant all on table public.resnexus_inbound_events to service_role;

create or replace function public.create_resnexus_email_bridge(
  target_unit_id uuid,
  connection_label text default 'ResNexus email bridge'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  target_org_id uuid;
  existing_bridge public.resnexus_email_bridges%rowtype;
  new_connection_id uuid;
  new_bridge_id uuid;
  safe_label text := left(
    coalesce(nullif(trim(connection_label), ''), 'ResNexus email bridge'),
    120
  );
begin
  if actor_id is null then
    raise exception 'Authentication required';
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

  select bridges.*
  into existing_bridge
  from public.resnexus_email_bridges bridges
  where bridges.unit_id = target_unit_id
  for update;

  if found then
    update public.calendar_connections connections
    set is_active = true,
        sync_status = 'NEVER_SYNCED',
        label = safe_label,
        last_sync_attempt_at = null,
        last_synced_at = null,
        last_success_at = null,
        last_error_at = null,
        last_error = null,
        updated_at = now()
    where connections.id = existing_bridge.connection_id;

    update public.resnexus_email_bridges bridges
    set status = 'ACTIVE',
        label = safe_label,
        last_success_at = null,
        last_error_at = null,
        last_error = null,
        updated_at = now()
    where bridges.id = existing_bridge.id;

    return existing_bridge.id;
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
    'EMAIL_BRIDGE',
    safe_label,
    null,
    null,
    true,
    'NEVER_SYNCED',
    actor_id
  )
  returning id into new_connection_id;

  insert into public.resnexus_email_bridges (
    organization_id,
    unit_id,
    connection_id,
    label,
    created_by
  ) values (
    target_org_id,
    target_unit_id,
    new_connection_id,
    safe_label,
    actor_id
  )
  returning id into new_bridge_id;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    actor_id,
    'calendar.resnexus_email_bridge.created',
    'calendar_connection',
    new_connection_id,
    'Host enabled the temporary ResNexus inbound-email availability bridge.',
    jsonb_build_object(
      'organization_id', target_org_id,
      'unit_id', target_unit_id,
      'bridge_id', new_bridge_id
    )
  );

  return new_bridge_id;
end;
$function$;

revoke all on function public.create_resnexus_email_bridge(uuid, text)
  from public;
grant execute on function public.create_resnexus_email_bridge(uuid, text)
  to authenticated;

create or replace function public.disable_resnexus_email_bridge(
  target_bridge_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  bridge_row public.resnexus_email_bridges%rowtype;
  removed_count integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select bridges.*
  into bridge_row
  from public.resnexus_email_bridges bridges
  where bridges.id = target_bridge_id
  for update;

  if not found then
    raise exception 'ResNexus bridge not found';
  end if;

  if not public.can_manage_organization(bridge_row.organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(bridge_row.unit_id::text, 0));

  update public.availability_blocks blocks
  set state = 'CANCELLED',
      updated_at = now()
  where blocks.connection_id = bridge_row.connection_id
    and blocks.block_type = 'EXTERNAL_BLOCK'
    and blocks.state = 'ACTIVE';

  get diagnostics removed_count = row_count;

  update public.calendar_connections connections
  set is_active = false,
      sync_status = 'DISABLED',
      updated_at = now()
  where connections.id = bridge_row.connection_id;

  update public.resnexus_email_bridges bridges
  set status = 'PAUSED',
      updated_at = now()
  where bridges.id = bridge_row.id;

  update public.notification_deliveries deliveries
  set status = 'SKIPPED',
      last_error = 'ResNexus bridge was disabled before this manual-sync notice was sent.',
      updated_at = now()
  where deliveries.status in ('PENDING', 'FAILED')
    and (
      deliveries.notification_type like 'RESNEXUS_MANUAL_SYNC:%'
      or deliveries.notification_type like 'RESNEXUS_MANUAL_CANCEL:%'
    )
    and deliveries.reservation_id in (
      select reservations.id
      from public.reservations reservations
      where reservations.unit_id = bridge_row.unit_id
    );

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    actor_id,
    'calendar.resnexus_email_bridge.disabled',
    'calendar_connection',
    bridge_row.connection_id,
    'Host disabled the temporary ResNexus inbound-email bridge.',
    jsonb_build_object(
      'bridge_id', bridge_row.id,
      'unit_id', bridge_row.unit_id,
      'deactivated_blocks', removed_count
    )
  );

  return removed_count;
end;
$function$;

revoke all on function public.disable_resnexus_email_bridge(uuid)
  from public;
grant execute on function public.disable_resnexus_email_bridge(uuid)
  to authenticated;

create or replace function public.service_apply_resnexus_email_block(
  target_bridge_id uuid,
  source_event_key text,
  block_start date,
  block_end date,
  block_label text default 'ResNexus reservation',
  event_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  bridge_row public.resnexus_email_bridges%rowtype;
  connection_row public.calendar_connections%rowtype;
  safe_key text := left(nullif(trim(source_event_key), ''), 500);
  safe_label text := left(
    coalesce(nullif(trim(block_label), ''), 'ResNexus reservation'),
    180
  );
  safe_metadata jsonb := coalesce(event_metadata, '{}'::jsonb);
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if safe_key is null then
    raise exception 'Stable ResNexus reservation reference is required';
  end if;

  if block_start is null or block_end is null or block_end <= block_start then
    raise exception 'ResNexus reservation dates are invalid';
  end if;

  if jsonb_typeof(safe_metadata) <> 'object' then
    safe_metadata := '{}'::jsonb;
  end if;

  select bridges.*
  into bridge_row
  from public.resnexus_email_bridges bridges
  where bridges.id = target_bridge_id
  for update;

  if not found or bridge_row.status <> 'ACTIVE' then
    raise exception 'ResNexus email bridge is not active';
  end if;

  select connections.*
  into connection_row
  from public.calendar_connections connections
  where connections.id = bridge_row.connection_id
    and connections.is_active
    and connections.provider = 'RESNEXUS'
    and connections.connection_kind = 'EMAIL_BRIDGE'
  for update;

  if not found then
    raise exception 'ResNexus calendar connection is not active';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(connection_row.unit_id::text, 0)
  );

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
    block_start,
    block_end,
    safe_label,
    safe_key,
    safe_key,
    safe_metadata || jsonb_build_object(
      'provider', 'RESNEXUS',
      'source', 'email_bridge'
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

  update public.calendar_connections connections
  set sync_status = 'HEALTHY',
      last_sync_attempt_at = now(),
      last_synced_at = now(),
      last_success_at = now(),
      last_error_at = null,
      last_error = null,
      updated_at = now()
  where connections.id = connection_row.id;

  update public.resnexus_email_bridges bridges
  set last_email_at = now(),
      last_success_at = now(),
      last_error_at = null,
      last_error = null,
      updated_at = now()
  where bridges.id = bridge_row.id;

  return jsonb_build_object(
    'bridge_id', bridge_row.id,
    'connection_id', connection_row.id,
    'unit_id', connection_row.unit_id,
    'event_key', safe_key,
    'start_date', block_start,
    'end_date', block_end
  );
end;
$function$;

revoke all on function public.service_apply_resnexus_email_block(
  uuid, text, date, date, text, jsonb
) from public;
grant execute on function public.service_apply_resnexus_email_block(
  uuid, text, date, date, text, jsonb
) to service_role;

create or replace function public.service_cancel_resnexus_email_block(
  target_bridge_id uuid,
  source_event_key text,
  event_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  bridge_row public.resnexus_email_bridges%rowtype;
  connection_row public.calendar_connections%rowtype;
  safe_key text := left(nullif(trim(source_event_key), ''), 500);
  cancelled_count integer := 0;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if safe_key is null then
    raise exception 'Stable ResNexus reservation reference is required';
  end if;

  select bridges.*
  into bridge_row
  from public.resnexus_email_bridges bridges
  where bridges.id = target_bridge_id
  for update;

  if not found or bridge_row.status <> 'ACTIVE' then
    raise exception 'ResNexus email bridge is not active';
  end if;

  select connections.*
  into connection_row
  from public.calendar_connections connections
  where connections.id = bridge_row.connection_id
    and connections.is_active
    and connections.provider = 'RESNEXUS'
    and connections.connection_kind = 'EMAIL_BRIDGE'
  for update;

  if not found then
    raise exception 'ResNexus calendar connection is not active';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(connection_row.unit_id::text, 0)
  );

  update public.availability_blocks blocks
  set state = 'CANCELLED',
      metadata = coalesce(blocks.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'cancelled_by_source', true,
          'cancelled_at', now()
        )
        || case
          when jsonb_typeof(coalesce(event_metadata, '{}'::jsonb)) = 'object'
            then coalesce(event_metadata, '{}'::jsonb)
          else '{}'::jsonb
        end,
      updated_at = now()
  where blocks.connection_id = connection_row.id
    and blocks.external_event_key = safe_key
    and blocks.block_type = 'EXTERNAL_BLOCK'
    and blocks.state = 'ACTIVE';

  get diagnostics cancelled_count = row_count;

  update public.calendar_connections connections
  set sync_status = 'HEALTHY',
      last_sync_attempt_at = now(),
      last_synced_at = now(),
      last_success_at = now(),
      last_error_at = null,
      last_error = null,
      updated_at = now()
  where connections.id = connection_row.id;

  update public.resnexus_email_bridges bridges
  set last_email_at = now(),
      last_success_at = now(),
      last_error_at = null,
      last_error = null,
      updated_at = now()
  where bridges.id = bridge_row.id;

  return jsonb_build_object(
    'bridge_id', bridge_row.id,
    'event_key', safe_key,
    'cancelled_count', cancelled_count
  );
end;
$function$;

revoke all on function public.service_cancel_resnexus_email_block(
  uuid, text, jsonb
) from public;
grant execute on function public.service_cancel_resnexus_email_block(
  uuid, text, jsonb
) to service_role;

commit;
