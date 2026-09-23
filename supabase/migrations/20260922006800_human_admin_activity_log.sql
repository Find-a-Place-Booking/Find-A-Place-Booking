begin;

-- One readable admin timeline while preserving the existing append-only
-- audit_logs table as the durable sink.
alter table public.audit_logs
  add column if not exists event_category text,
  add column if not exists source_table text,
  add column if not exists source_id uuid;

alter table public.audit_logs
  drop constraint if exists audit_logs_event_category_check;

alter table public.audit_logs
  add constraint audit_logs_event_category_check
  check (
    event_category is null
    or event_category in (
      'booking',
      'cancellation',
      'payment',
      'property',
      'account',
      'content',
      'admin',
      'other'
    )
  );

create unique index if not exists audit_logs_source_event_unique
  on public.audit_logs(source_table, source_id)
  where source_table is not null and source_id is not null;

create index if not exists audit_logs_category_created_idx
  on public.audit_logs(event_category, created_at desc);

-- Existing audit rows remain untouched because audit_logs is intentionally
-- append-only. The admin UI classifies older rows at read time from their
-- existing action/entity values. New activity rows written by this migration
-- carry event_category explicitly.

-- Reservation events are already append-only and contain the actual booking
-- lifecycle. Mirror them into the admin timeline instead of inventing a second
-- booking history system.
create or replace function public.admin_activity_category_for_reservation_event(
  target_event_type text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select
    case
      when upper(coalesce(target_event_type, '')) like '%CANCELLATION%'
        then 'cancellation'
      when upper(coalesce(target_event_type, '')) like '%REFUND%'
        or upper(coalesce(target_event_type, '')) like '%PAYMENT%'
        or upper(coalesce(target_event_type, '')) like '%DISPUTE%'
        then 'payment'
      else 'booking'
    end;
$$;

create or replace function public.mirror_reservation_event_to_admin_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata,
    event_category,
    source_table,
    source_id,
    created_at
  ) values (
    new.actor_profile_id,
    'reservation.' || lower(new.event_type),
    'reservation',
    new.reservation_id,
    null,
    coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'reservation_event_type', new.event_type,
        'reservation_event_id', new.id
      ),
    public.admin_activity_category_for_reservation_event(new.event_type),
    'reservation_events',
    new.id,
    new.created_at
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists reservation_events_admin_activity
  on public.reservation_events;

create trigger reservation_events_admin_activity
after insert on public.reservation_events
for each row
execute function public.mirror_reservation_event_to_admin_activity();

-- Backfill the booking history that already exists.
insert into public.audit_logs (
  actor_profile_id,
  action,
  entity_type,
  entity_id,
  reason,
  metadata,
  event_category,
  source_table,
  source_id,
  created_at
)
select
  events.actor_profile_id,
  'reservation.' || lower(events.event_type),
  'reservation',
  events.reservation_id,
  null,
  coalesce(events.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'reservation_event_type', events.event_type,
      'reservation_event_id', events.id
    ),
  public.admin_activity_category_for_reservation_event(events.event_type),
  'reservation_events',
  events.id,
  events.created_at
from public.reservation_events events
on conflict do nothing;

-- Profile creation was not historically part of audit_logs. Record all
-- existing profiles once and automatically log new ones going forward.
insert into public.audit_logs (
  actor_profile_id,
  action,
  entity_type,
  entity_id,
  reason,
  metadata,
  event_category,
  source_table,
  source_id,
  created_at
)
select
  null,
  'profile.created',
  'profile',
  profiles.id,
  'A user profile was created.',
  jsonb_build_object(
    'full_name', profiles.full_name,
    'email', profiles.email
  ),
  'account',
  'profiles',
  profiles.id,
  profiles.created_at
from public.profiles profiles
on conflict do nothing;

create or replace function public.log_profile_created_to_admin_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata,
    event_category,
    source_table,
    source_id,
    created_at
  ) values (
    null,
    'profile.created',
    'profile',
    new.id,
    'A user profile was created.',
    jsonb_build_object(
      'full_name', new.full_name,
      'email', new.email
    ),
    'account',
    'profiles',
    new.id,
    new.created_at
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_admin_activity_created
  on public.profiles;

create trigger profiles_admin_activity_created
after insert on public.profiles
for each row
execute function public.log_profile_created_to_admin_activity();

-- A few old/imported property rows may predate the explicit property creation
-- audit calls. Fill only the gaps so we do not duplicate normal RPC-created
-- properties.
insert into public.audit_logs (
  actor_profile_id,
  action,
  entity_type,
  entity_id,
  reason,
  metadata,
  event_category,
  source_table,
  source_id,
  created_at
)
select
  properties.created_by,
  'property.created',
  'property',
  properties.id,
  'A property record was added.',
  jsonb_build_object(
    'organization_id', properties.organization_id,
    'property_name', properties.name,
    'status', properties.status
  ),
  'property',
  'properties',
  properties.id,
  properties.created_at
from public.properties properties
where not exists (
  select 1
  from public.audit_logs existing
  where existing.entity_type = 'property'
    and existing.entity_id = properties.id
    and (
      existing.action like 'property.created%'
      or existing.action = 'property.created'
    )
)
on conflict do nothing;

-- Connected-account history is operationally important but does not belong in
-- raw Stripe/processor logs. Record the current account once, then future
-- readiness/restriction changes.
insert into public.audit_logs (
  actor_profile_id,
  action,
  entity_type,
  entity_id,
  reason,
  metadata,
  event_category,
  source_table,
  source_id,
  created_at
)
select
  accounts.created_by,
  case accounts.status
    when 'READY' then 'payment_account.ready'
    when 'RESTRICTED' then 'payment_account.restricted'
    when 'DISABLED' then 'payment_account.disabled'
    else 'payment_account.connected'
  end,
  'payment_account',
  accounts.id,
  case accounts.status
    when 'READY' then 'The host payment account is ready for guest charges.'
    when 'RESTRICTED' then 'The host payment account needs attention before guest charges can be accepted.'
    when 'DISABLED' then 'The host payment account is disabled.'
    else 'A host payment account was connected.'
  end,
  jsonb_build_object(
    'organization_id', accounts.organization_id,
    'provider', accounts.provider,
    'status', accounts.status,
    'charges_enabled', accounts.charges_enabled,
    'payouts_enabled', accounts.payouts_enabled,
    'provider_account_id', accounts.provider_account_id,
    'environment', to_jsonb(accounts) ->> 'environment'
  ),
  'account',
  'payment_accounts',
  accounts.id,
  accounts.created_at
from public.payment_accounts accounts
on conflict do nothing;

create or replace function public.log_payment_account_admin_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_action text;
  activity_reason text;
begin
  if tg_op = 'INSERT' then
    activity_action :=
      case new.status
        when 'READY' then 'payment_account.ready'
        when 'RESTRICTED' then 'payment_account.restricted'
        when 'DISABLED' then 'payment_account.disabled'
        else 'payment_account.connected'
      end;

    activity_reason :=
      case new.status
        when 'READY' then 'The host payment account is ready for guest charges.'
        when 'RESTRICTED' then 'The host payment account needs attention before guest charges can be accepted.'
        when 'DISABLED' then 'The host payment account is disabled.'
        else 'A host payment account was connected.'
      end;

    insert into public.audit_logs (
      actor_profile_id,
      action,
      entity_type,
      entity_id,
      reason,
      metadata,
      event_category,
      source_table,
      source_id,
      created_at
    ) values (
      new.created_by,
      activity_action,
      'payment_account',
      new.id,
      activity_reason,
      jsonb_build_object(
        'organization_id', new.organization_id,
        'provider', new.provider,
        'status', new.status,
        'charges_enabled', new.charges_enabled,
        'payouts_enabled', new.payouts_enabled,
        'provider_account_id', new.provider_account_id,
        'environment', to_jsonb(new) ->> 'environment'
      ),
      'account',
      'payment_accounts',
      new.id,
      new.created_at
    )
    on conflict do nothing;

    return new;
  end if;

  if new.status is not distinct from old.status
     and new.charges_enabled is not distinct from old.charges_enabled
     and new.payouts_enabled is not distinct from old.payouts_enabled then
    return new;
  end if;

  activity_action :=
    case
      when new.status = 'READY' and new.charges_enabled
        then 'payment_account.ready'
      when new.status = 'RESTRICTED'
        then 'payment_account.restricted'
      when new.status = 'DISABLED'
        then 'payment_account.disabled'
      else 'payment_account.status_changed'
    end;

  activity_reason :=
    case activity_action
      when 'payment_account.ready'
        then 'The host payment account became ready for guest charges.'
      when 'payment_account.restricted'
        then 'Stripe reports that the host payment account needs attention.'
      when 'payment_account.disabled'
        then 'The host payment account was disabled.'
      else 'The host payment account status changed.'
    end;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    before_state,
    after_state,
    metadata,
    event_category,
    created_at
  ) values (
    coalesce((select auth.uid()), new.created_by),
    activity_action,
    'payment_account',
    new.id,
    activity_reason,
    jsonb_build_object(
      'status', old.status,
      'charges_enabled', old.charges_enabled,
      'payouts_enabled', old.payouts_enabled
    ),
    jsonb_build_object(
      'status', new.status,
      'charges_enabled', new.charges_enabled,
      'payouts_enabled', new.payouts_enabled
    ),
    jsonb_build_object(
      'organization_id', new.organization_id,
      'provider', new.provider,
      'provider_account_id', new.provider_account_id,
      'environment', to_jsonb(new) ->> 'environment'
    ),
    'account',
    now()
  );

  return new;
end;
$$;

drop trigger if exists payment_accounts_admin_activity
  on public.payment_accounts;

create trigger payment_accounts_admin_activity
after insert or update of status, charges_enabled, payouts_enabled
on public.payment_accounts
for each row
execute function public.log_payment_account_admin_activity();

revoke all on function public.admin_activity_category_for_reservation_event(text)
  from public;
revoke all on function public.mirror_reservation_event_to_admin_activity()
  from public;
revoke all on function public.log_profile_created_to_admin_activity()
  from public;
revoke all on function public.log_payment_account_admin_activity()
  from public;

notify pgrst, 'reload schema';

commit;
