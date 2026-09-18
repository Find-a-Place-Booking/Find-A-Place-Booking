-- Find A Place Booking
-- Pre-live hardening pass 026.
--
-- This migration keeps the proven destination-charge and canonical-calendar
-- architecture, while adding the invariants required for a controlled live
-- pilot: explicit TEST/LIVE routing, a property live-booking gate, one atomic
-- Stripe payment attempt, refund reconciliation, and notification delivery
-- idempotency.

begin;

-- ---------------------------------------------------------------------------
-- Explicit processor environment separation
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_type types
    join pg_namespace namespaces on namespaces.oid = types.typnamespace
    where namespaces.nspname = 'public'
      and types.typname = 'payment_environment'
  ) then
    create type public.payment_environment as enum ('TEST', 'LIVE');
  end if;
end
$$;

alter table public.payment_accounts
  add column if not exists environment public.payment_environment
    not null default 'TEST';

alter table public.payment_account_assignments
  add column if not exists environment public.payment_environment
    not null default 'TEST';

alter table public.reservations
  add column if not exists payment_environment public.payment_environment
    not null default 'TEST';

alter table public.payments
  add column if not exists payment_environment public.payment_environment
    not null default 'TEST';

alter table public.refunds
  add column if not exists payment_environment public.payment_environment
    not null default 'TEST';

update public.payment_account_assignments assignments
set environment = accounts.environment
from public.payment_accounts accounts
where accounts.id = assignments.payment_account_id
  and assignments.environment is distinct from accounts.environment;

update public.reservations reservations
set payment_environment = accounts.environment
from public.payment_accounts accounts
where accounts.id = reservations.payment_account_id
  and reservations.payment_environment is distinct from accounts.environment;

update public.payments payments
set payment_environment = reservations.payment_environment
from public.reservations reservations
where reservations.id = payments.reservation_id
  and payments.payment_environment is distinct from reservations.payment_environment;

update public.refunds refunds
set payment_environment = payments.payment_environment
from public.payments payments
where payments.id = refunds.payment_id
  and refunds.payment_environment is distinct from payments.payment_environment;

drop index if exists public.payment_accounts_provider_account_unique;
create unique index if not exists payment_accounts_provider_account_environment_unique
  on public.payment_accounts(provider, provider_account_id, environment)
  where provider_account_id is not null;

drop index if exists public.payments_provider_payment_unique;
create unique index if not exists payments_provider_payment_environment_unique
  on public.payments(provider, provider_payment_id, payment_environment)
  where provider_payment_id is not null;

drop index if exists public.refunds_provider_refund_unique;
create unique index if not exists refunds_provider_refund_environment_unique
  on public.refunds(provider_refund_id, payment_environment)
  where provider_refund_id is not null;

drop index if exists public.payment_accounts_one_default_per_org;
create unique index if not exists payment_accounts_one_default_per_org_environment
  on public.payment_accounts(organization_id, environment)
  where is_default and status <> 'DISABLED';

drop index if exists public.payment_account_assignment_property_unique;
drop index if exists public.payment_account_assignment_unit_unique;
create unique index if not exists payment_account_assignment_property_environment_unique
  on public.payment_account_assignments(property_id, environment)
  where property_id is not null;
create unique index if not exists payment_account_assignment_unit_environment_unique
  on public.payment_account_assignments(unit_id, environment)
  where unit_id is not null;

create index if not exists payment_accounts_environment_idx
  on public.payment_accounts(environment, organization_id, status);
create index if not exists reservations_payment_environment_idx
  on public.reservations(payment_environment, status, created_at desc);

create or replace function public.set_payment_assignment_environment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  account_environment public.payment_environment;
begin
  select accounts.environment
  into account_environment
  from public.payment_accounts accounts
  where accounts.id = new.payment_account_id;

  if account_environment is null then
    raise exception 'Payment account not found';
  end if;

  new.environment := account_environment;
  return new;
end;
$$;

drop trigger if exists payment_account_assignments_set_environment
  on public.payment_account_assignments;
create trigger payment_account_assignments_set_environment
before insert or update of payment_account_id, environment
on public.payment_account_assignments
for each row execute function public.set_payment_assignment_environment();

create or replace function public.prevent_payment_account_environment_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.environment is distinct from old.environment then
    raise exception 'Payment account environments are immutable; create a separate account row';
  end if;
  return new;
end;
$$;

drop trigger if exists payment_accounts_prevent_environment_mutation
  on public.payment_accounts;
create trigger payment_accounts_prevent_environment_mutation
before update on public.payment_accounts
for each row execute function public.prevent_payment_account_environment_mutation();

-- Only specifically approved properties may take LIVE money. TEST checkout
-- remains available to all otherwise-bookable published properties.
alter table public.properties
  add column if not exists live_checkout_enabled boolean not null default false;

comment on column public.properties.live_checkout_enabled is
  'Server-enforced allowlist for the controlled live-money pilot. It does not affect Stripe TEST checkout.';

create or replace function public.protect_property_live_checkout_gate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.live_checkout_enabled is distinct from old.live_checkout_enabled
     and coalesce((select auth.role()), '') <> 'service_role'
     and not public.admin_has_any_role(
       array['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[]
     ) then
    raise exception 'Operations admin access required to change live checkout';
  end if;
  return new;
end;
$$;

drop trigger if exists properties_protect_live_checkout_gate
  on public.properties;
create trigger properties_protect_live_checkout_gate
before update on public.properties
for each row execute function public.protect_property_live_checkout_gate();

create or replace function public.set_property_live_checkout(
  target_property_id uuid,
  enabled boolean,
  change_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null
     or not public.admin_has_any_role(
       array['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[]
     ) then
    raise exception 'Operations admin access required';
  end if;

  update public.properties properties
  set live_checkout_enabled = enabled,
      updated_at = now()
  where properties.id = target_property_id;

  if not found then raise exception 'Property not found'; end if;

  insert into public.audit_logs (
    actor_profile_id,action,entity_type,entity_id,reason,metadata
  ) values (
    actor_id,
    case when enabled then 'property.live_checkout.enabled' else 'property.live_checkout.disabled' end,
    'property',
    target_property_id,
    left(nullif(trim(coalesce(change_reason, '')), ''), 500),
    jsonb_build_object('live_checkout_enabled', enabled)
  );
end;
$$;

revoke all on function public.set_property_live_checkout(uuid,boolean,text) from public;
grant execute on function public.set_property_live_checkout(uuid,boolean,text) to authenticated;

create or replace function public.snapshot_reservation_payment_environment()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  account_row public.payment_accounts%rowtype;
  live_enabled boolean;
begin
  if new.payment_account_id is null then
    raise exception 'Reservation payment account is required';
  end if;

  select accounts.*
  into account_row
  from public.payment_accounts accounts
  where accounts.id = new.payment_account_id;

  if not found then
    raise exception 'Reservation payment account not found';
  end if;

  if account_row.provider is distinct from new.payment_provider
     or account_row.provider_account_id is distinct from new.provider_account_ref then
    raise exception 'Reservation payout snapshot does not match its payment account';
  end if;

  new.payment_environment := account_row.environment;

  if new.payment_environment = 'LIVE' then
    select properties.live_checkout_enabled
    into live_enabled
    from public.properties properties
    where properties.id = new.property_id;

    if coalesce(live_enabled, false) is not true then
      raise exception 'This property is not enabled for live checkout';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_aa_snapshot_payment_environment
  on public.reservations;
create trigger reservations_aa_snapshot_payment_environment
before insert on public.reservations
for each row execute function public.snapshot_reservation_payment_environment();

create or replace function public.prevent_payment_environment_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_environment is distinct from old.payment_environment then
    raise exception 'Payment environment snapshots are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_prevent_payment_environment_mutation
  on public.reservations;
create trigger reservations_prevent_payment_environment_mutation
before update on public.reservations
for each row execute function public.prevent_payment_environment_mutation();

drop trigger if exists payments_prevent_payment_environment_mutation
  on public.payments;
create trigger payments_prevent_payment_environment_mutation
before update on public.payments
for each row execute function public.prevent_payment_environment_mutation();

drop trigger if exists refunds_prevent_payment_environment_mutation
  on public.refunds;
create trigger refunds_prevent_payment_environment_mutation
before update on public.refunds
for each row execute function public.prevent_payment_environment_mutation();

-- Add an environment argument to the canonical hold RPC and use it in each
-- unit/property/default Stripe-account lookup. The original ten-argument RPC
-- remains ungranted and exists only as migration history.
do $hold_environment$
declare
  original_def text;
  patched_def text;
  provider_occurrences integer;
begin
  select pg_get_functiondef(
    'public.create_guest_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text,text)'::regprocedure
  ) into original_def;

  patched_def := regexp_replace(
    original_def,
    'requested_guest_phone[[:space:]]+text[[:space:]]+DEFAULT[[:space:]]+NULL::text[[:space:]]*[)]',
    'requested_guest_phone text DEFAULT NULL::text, requested_payment_environment public.payment_environment)',
    'i'
  );

  if patched_def = original_def then
    raise exception 'Could not add payment environment to canonical guest hold RPC';
  end if;

  provider_occurrences := (
    length(patched_def) - length(replace(patched_def, 'accounts.provider = ''STRIPE''', ''))
  ) / length('accounts.provider = ''STRIPE''');

  if provider_occurrences <> 3 then
    raise exception 'Expected three Stripe account lookups in canonical hold RPC, found %', provider_occurrences;
  end if;

  patched_def := replace(
    patched_def,
    'accounts.provider = ''STRIPE''',
    'accounts.provider = ''STRIPE'' and accounts.environment = requested_payment_environment'
  );

  execute patched_def;
end
$hold_environment$;

revoke all on function public.create_guest_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text
) from service_role;
revoke all on function public.create_guest_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment
) from public, anon, authenticated;
grant execute on function public.create_guest_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment
) to service_role;

-- ---------------------------------------------------------------------------
-- Atomic Stripe payment-attempt claim
-- ---------------------------------------------------------------------------

do $payment_attempt_cleanup$
begin
  if exists (
    select 1
    from public.payments payments
    where payments.provider = 'STRIPE'
      and payments.status in ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED','DISPUTED')
    group by payments.reservation_id, payments.payment_environment
    having count(*) > 1
  ) then
    raise exception 'Multiple settled Stripe payments exist for one reservation/environment; reconcile them before migration 026';
  end if;

  with ranked as (
    select
      payments.id,
      row_number() over (
        partition by payments.reservation_id, payments.provider, payments.payment_environment
        order by
          case when payments.status in ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED','DISPUTED') then 0 else 1 end,
          payments.created_at desc,
          payments.id desc
      ) as attempt_rank
    from public.payments payments
    where payments.provider = 'STRIPE'
      and payments.status <> 'CANCELLED'
  )
  update public.payments payments
  set status = 'CANCELLED',
      failure_code = coalesce(payments.failure_code, 'superseded_attempt'),
      failure_message = coalesce(payments.failure_message, 'Superseded by the canonical migration 026 payment attempt.'),
      updated_at = now()
  from ranked
  where payments.id = ranked.id
    and ranked.attempt_rank > 1;
end
$payment_attempt_cleanup$;

create unique index if not exists payments_one_open_stripe_attempt
  on public.payments(reservation_id, provider, payment_environment)
  where provider = 'STRIPE' and status <> 'CANCELLED';

create or replace function public.claim_stripe_payment_attempt(
  target_reservation_id uuid,
  expected_environment public.payment_environment,
  processor_fee_recovery_cents bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation_row public.reservations%rowtype;
  account_row public.payment_accounts%rowtype;
  payment_row public.payments%rowtype;
  payment_id uuid;
  application_fee bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select reservations.*
  into reservation_row
  from public.reservations reservations
  where reservations.id = target_reservation_id
  for update;

  if not found then raise exception 'Reservation not found'; end if;

  if reservation_row.payment_environment <> expected_environment then
    raise exception 'Reservation belongs to the wrong Stripe environment';
  end if;

  if reservation_row.status not in ('HOLD','PAYMENT_PENDING','PAYMENT_FAILED') then
    raise exception 'Reservation cannot start a payment from its current status';
  end if;

  if reservation_row.hold_expires_at is not null
     and reservation_row.hold_expires_at <= now() then
    raise exception 'Reservation hold expired';
  end if;

  if expected_environment = 'LIVE'
     and reservation_row.tax_status <> 'CALCULATED' then
    raise exception 'Live checkout requires a completed lodging-tax calculation';
  end if;

  select accounts.*
  into account_row
  from public.payment_accounts accounts
  where accounts.id = reservation_row.payment_account_id
  for share;

  if not found
     or account_row.provider <> 'STRIPE'
     or account_row.environment <> expected_environment
     or account_row.status <> 'READY'
     or not account_row.payouts_enabled
     or account_row.provider_account_id is null then
    raise exception 'Stripe payout account is not ready for this environment';
  end if;

  if reservation_row.provider_account_ref is distinct from account_row.provider_account_id then
    raise exception 'Reservation payout destination no longer matches its snapshot';
  end if;

  select payments.*
  into payment_row
  from public.payments payments
  where payments.reservation_id = target_reservation_id
    and payments.provider = 'STRIPE'
    and payments.payment_environment = expected_environment
    and payments.status <> 'CANCELLED'
  order by payments.created_at desc
  limit 1
  for update;

  if found then
    return to_jsonb(payment_row)
      || jsonb_build_object('connected_account_id', account_row.provider_account_id);
  end if;

  if processor_fee_recovery_cents is null or processor_fee_recovery_cents < 0 then
    raise exception 'Processor fee recovery is invalid';
  end if;

  application_fee := least(
    reservation_row.guest_total_cents,
    reservation_row.platform_commission_cents + processor_fee_recovery_cents
  );

  payment_id := gen_random_uuid();

  insert into public.payments (
    id,
    reservation_id,
    payment_account_id,
    provider,
    payment_environment,
    status,
    idempotency_key,
    amount_cents,
    application_fee_cents,
    processor_fee_host_share_cents,
    processor_fee_platform_share_cents,
    processing_fee_credit_cents,
    host_proceeds_cents,
    currency
  ) values (
    payment_id,
    reservation_row.id,
    reservation_row.payment_account_id,
    'STRIPE',
    expected_environment,
    'NOT_STARTED',
    'fap-booking-' || payment_id::text,
    reservation_row.guest_total_cents,
    application_fee,
    processor_fee_recovery_cents,
    0,
    0,
    greatest(reservation_row.guest_total_cents - application_fee, 0),
    reservation_row.currency
  )
  returning * into payment_row;

  return to_jsonb(payment_row)
    || jsonb_build_object('connected_account_id', account_row.provider_account_id);
end;
$$;

revoke all on function public.claim_stripe_payment_attempt(
  uuid,public.payment_environment,bigint
) from public, anon, authenticated;
grant execute on function public.claim_stripe_payment_attempt(
  uuid,public.payment_environment,bigint
) to service_role;

-- ---------------------------------------------------------------------------
-- Refund and dispute reconciliation
-- ---------------------------------------------------------------------------

create or replace function public.create_refund_request(
  target_reservation_id uuid,
  requested_amount_cents bigint,
  requested_full_refund boolean,
  requested_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation_row public.reservations%rowtype;
  payment_row public.payments%rowtype;
  refund_id uuid := gen_random_uuid();
  refunded_total bigint;
  platform_fee_refunded bigint;
  remaining_amount bigint;
  remaining_platform_fee bigint;
  final_amount bigint;
  fee_refund bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select reservations.* into reservation_row
  from public.reservations reservations
  where reservations.id = target_reservation_id
  for update;
  if not found then raise exception 'Reservation not found'; end if;

  select payments.* into payment_row
  from public.payments payments
  where payments.reservation_id = target_reservation_id
    and payments.provider = 'STRIPE'
    and payments.status in ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED','DISPUTED')
  order by payments.created_at desc
  limit 1
  for update;
  if not found then raise exception 'No refundable Stripe payment found'; end if;

  select
    coalesce(sum(refunds.amount_cents), 0),
    coalesce(sum(refunds.platform_fee_refund_cents), 0)
  into refunded_total, platform_fee_refunded
  from public.refunds refunds
  where refunds.payment_id = payment_row.id
    and refunds.status in ('PENDING','SUCCEEDED');

  remaining_amount := greatest(payment_row.amount_cents - refunded_total, 0);
  remaining_platform_fee := greatest(
    payment_row.application_fee_cents - platform_fee_refunded,
    0
  );

  if remaining_amount <= 0 then raise exception 'Payment is already fully refunded'; end if;

  if requested_full_refund then
    final_amount := remaining_amount;
    fee_refund := remaining_platform_fee;
  else
    final_amount := requested_amount_cents;
    fee_refund := 0;
    if final_amount is null or final_amount <= 0 or final_amount >= remaining_amount then
      raise exception 'Partial refund must be greater than zero and less than the remaining charge';
    end if;
  end if;

  insert into public.refunds (
    id,
    reservation_id,
    payment_id,
    payment_environment,
    status,
    idempotency_key,
    amount_cents,
    platform_fee_refund_cents,
    currency,
    reason
  ) values (
    refund_id,
    reservation_row.id,
    payment_row.id,
    payment_row.payment_environment,
    'PENDING',
    'fap-refund-' || refund_id::text,
    final_amount,
    fee_refund,
    payment_row.currency,
    left(nullif(trim(coalesce(requested_reason, '')), ''), 500)
  );

  return jsonb_build_object(
    'refund_id', refund_id,
    'payment_id', payment_row.id,
    'provider_payment_id', payment_row.provider_payment_id,
    'amount_cents', final_amount,
    'platform_fee_refund_cents', fee_refund,
    'is_full_refund', requested_full_refund,
    'currency', payment_row.currency,
    'payment_environment', payment_row.payment_environment
  );
end;
$$;

create or replace function public.record_refund_result(
  target_refund_id uuid,
  target_provider_refund_id text,
  target_status public.refund_status,
  target_failure_message text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  refund_row public.refunds%rowtype;
  payment_row public.payments%rowtype;
  succeeded_total bigint;
  is_full boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select refunds.* into refund_row
  from public.refunds refunds
  where refunds.id = target_refund_id
  for update;
  if not found then raise exception 'Refund not found'; end if;

  if refund_row.status = 'SUCCEEDED' and target_status = 'SUCCEEDED' then
    return jsonb_build_object('status', 'SUCCEEDED', 'duplicate', true);
  end if;

  update public.refunds refunds
  set status = target_status,
      provider_refund_id = coalesce(target_provider_refund_id, refunds.provider_refund_id),
      reason = case
        when target_status = 'FAILED' and target_failure_message is not null
          then left(coalesce(refunds.reason || ' · ', '') || target_failure_message, 500)
        else refunds.reason
      end,
      updated_at = now()
  where refunds.id = target_refund_id
  returning * into refund_row;

  select payments.* into payment_row
  from public.payments payments
  where payments.id = refund_row.payment_id
  for update;

  if target_status <> 'SUCCEEDED' then
    return jsonb_build_object('status', target_status);
  end if;

  select coalesce(sum(refunds.amount_cents), 0)
  into succeeded_total
  from public.refunds refunds
  where refunds.payment_id = payment_row.id
    and refunds.status = 'SUCCEEDED';

  is_full := succeeded_total >= payment_row.amount_cents;

  update public.payments payments
  set status = case when is_full then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,
      updated_at = now()
  where payments.id = payment_row.id;

  update public.reservations reservations
  set payment_status = case when is_full then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,
      status = case when is_full then 'CANCELLED' else reservations.status end,
      cancelled_at = case when is_full then coalesce(reservations.cancelled_at, now()) else reservations.cancelled_at end,
      updated_at = now()
  where reservations.id = refund_row.reservation_id;

  if is_full then
    update public.availability_blocks blocks
    set state = 'CANCELLED', updated_at = now()
    where blocks.reservation_id = refund_row.reservation_id
      and blocks.state = 'ACTIVE'
      and blocks.block_type in ('INTERNAL_HOLD','INTERNAL_RESERVATION');
  end if;

  if not exists (
    select 1 from public.financial_ledger_entries ledger
    where ledger.refund_id = refund_row.id
      and ledger.entry_type = 'REFUND'
  ) then
    insert into public.financial_ledger_entries (
      reservation_id,payment_id,refund_id,entry_type,amount_cents,currency,description,metadata
    ) values (
      refund_row.reservation_id,
      refund_row.payment_id,
      refund_row.id,
      'REFUND',
      -refund_row.amount_cents,
      refund_row.currency,
      case when is_full then 'Full guest refund' else 'Host-funded partial guest refund' end,
      jsonb_build_object(
        'provider_refund_id', refund_row.provider_refund_id,
        'platform_fee_refund_cents', refund_row.platform_fee_refund_cents,
        'is_full_refund', is_full
      )
    );
  end if;

  insert into public.reservation_events (
    reservation_id,event_type,actor_profile_id,metadata
  ) values (
    refund_row.reservation_id,
    case when is_full then 'FULL_REFUND_SUCCEEDED' else 'PARTIAL_REFUND_SUCCEEDED' end,
    null,
    jsonb_build_object(
      'refund_id', refund_row.id,
      'provider_refund_id', refund_row.provider_refund_id,
      'amount_cents', refund_row.amount_cents,
      'platform_fee_refund_cents', refund_row.platform_fee_refund_cents
    )
  );

  return jsonb_build_object(
    'status', 'SUCCEEDED',
    'full_refund', is_full,
    'refunded_total_cents', succeeded_total
  );
end;
$$;

revoke all on function public.create_refund_request(uuid,bigint,boolean,text)
  from public, anon, authenticated;
grant execute on function public.create_refund_request(uuid,bigint,boolean,text)
  to service_role;
revoke all on function public.record_refund_result(uuid,text,public.refund_status,text)
  from public, anon, authenticated;
grant execute on function public.record_refund_result(uuid,text,public.refund_status,text)
  to service_role;

create or replace function public.record_stripe_dispute(
  target_provider_payment_id text,
  target_provider_charge_id text,
  target_dispute_id text,
  target_amount_cents bigint,
  target_dispute_status text,
  target_outcome text,
  expected_environment public.payment_environment
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  payment_row public.payments%rowtype;
  dispute_lost boolean := lower(coalesce(target_dispute_status, '')) = 'lost';
  dispute_won boolean := lower(coalesce(target_dispute_status, '')) = 'won';
  refunded_total bigint := 0;
  restored_status public.reservation_payment_status;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select payments.* into payment_row
  from public.payments payments
  where payments.provider = 'STRIPE'
    and payments.payment_environment = expected_environment
    and (
      payments.provider_payment_id = target_provider_payment_id
      or payments.provider_charge_id = target_provider_charge_id
    )
  order by payments.created_at desc
  limit 1
  for update;

  if not found then raise exception 'Disputed Stripe payment was not found'; end if;

  if dispute_won then
    select coalesce(sum(refunds.amount_cents), 0)
    into refunded_total
    from public.refunds refunds
    where refunds.payment_id = payment_row.id
      and refunds.status = 'SUCCEEDED';

    restored_status := case
      when refunded_total >= payment_row.amount_cents then 'REFUNDED'::public.reservation_payment_status
      when refunded_total > 0 then 'PARTIALLY_REFUNDED'::public.reservation_payment_status
      else 'SUCCEEDED'::public.reservation_payment_status
    end;

    update public.payments payments
    set status = restored_status,
        updated_at = now()
    where payments.id = payment_row.id;

    update public.reservations reservations
    set payment_status = restored_status,
        updated_at = now()
    where reservations.id = payment_row.reservation_id
      and reservations.payment_status = 'DISPUTED';

    if target_amount_cents > 0 and exists (
      select 1 from public.financial_ledger_entries ledger
      where ledger.payment_id = payment_row.id
        and ledger.entry_type = 'CHARGEBACK'
        and ledger.metadata ->> 'provider_dispute_id' = target_dispute_id
    ) and not exists (
      select 1 from public.financial_ledger_entries ledger
      where ledger.payment_id = payment_row.id
        and ledger.entry_type = 'ADJUSTMENT'
        and ledger.metadata ->> 'provider_dispute_id' = target_dispute_id
        and ledger.metadata ->> 'dispute_reversal' = 'true'
    ) then
      insert into public.financial_ledger_entries (
        reservation_id,payment_id,entry_type,amount_cents,currency,description,metadata
      ) values (
        payment_row.reservation_id,
        payment_row.id,
        'ADJUSTMENT',
        target_amount_cents,
        payment_row.currency,
        'Stripe dispute won; chargeback restored',
        jsonb_build_object(
          'provider_dispute_id', target_dispute_id,
          'status', target_dispute_status,
          'outcome', target_outcome,
          'dispute_reversal', true
        )
      );
    end if;
  else
    update public.payments payments
    set status = 'DISPUTED', updated_at = now()
    where payments.id = payment_row.id;

    update public.reservations reservations
    set payment_status = 'DISPUTED', updated_at = now()
    where reservations.id = payment_row.reservation_id
      and reservations.payment_status not in ('REFUNDED');
  end if;

  if (dispute_lost or not dispute_won) and target_amount_cents > 0
     and not exists (
       select 1 from public.financial_ledger_entries ledger
       where ledger.payment_id = payment_row.id
         and ledger.entry_type = 'CHARGEBACK'
         and ledger.metadata ->> 'provider_dispute_id' = target_dispute_id
     ) then
    insert into public.financial_ledger_entries (
      reservation_id,payment_id,entry_type,amount_cents,currency,description,metadata
    ) values (
      payment_row.reservation_id,
      payment_row.id,
      'CHARGEBACK',
      -target_amount_cents,
      payment_row.currency,
      'Stripe dispute opened against the platform charge',
      jsonb_build_object(
        'provider_dispute_id', target_dispute_id,
        'status', target_dispute_status,
        'outcome', target_outcome
      )
    );
  end if;

  insert into public.reservation_events (
    reservation_id,event_type,actor_profile_id,metadata
  ) values (
    payment_row.reservation_id,
    case when dispute_won or dispute_lost then 'DISPUTE_CLOSED' else 'DISPUTE_OPENED' end,
    null,
    jsonb_build_object(
      'provider_dispute_id', target_dispute_id,
      'status', target_dispute_status,
      'outcome', target_outcome,
      'amount_cents', target_amount_cents
    )
  );
end;
$$;

revoke all on function public.record_stripe_dispute(text,text,text,bigint,text,text,public.payment_environment)
  from public, anon, authenticated;
grant execute on function public.record_stripe_dispute(text,text,text,bigint,text,text,public.payment_environment)
  to service_role;

-- ---------------------------------------------------------------------------
-- Idempotent operational email deliveries
-- ---------------------------------------------------------------------------

alter table public.processor_events
  add column if not exists payment_environment public.payment_environment
    not null default 'TEST';

alter table public.processor_events
  drop constraint if exists processor_events_provider_external_event_id_key;
create unique index if not exists processor_events_provider_environment_event_unique
  on public.processor_events(provider, payment_environment, external_event_id);

drop trigger if exists processor_events_prevent_payment_environment_mutation
  on public.processor_events;
create trigger processor_events_prevent_payment_environment_mutation
before update on public.processor_events
for each row execute function public.prevent_payment_environment_mutation();

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  notification_type text not null,
  recipient text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING','SENT','FAILED','SKIPPED')),
  provider_message_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_id, notification_type, recipient)
);

create index if not exists notification_deliveries_status_idx
  on public.notification_deliveries(status, updated_at);

alter table public.notification_deliveries enable row level security;

drop policy if exists notification_deliveries_select_admin
  on public.notification_deliveries;
create policy notification_deliveries_select_admin
on public.notification_deliveries
for select to authenticated
using (public.is_active_admin());

drop trigger if exists notification_deliveries_set_updated_at
  on public.notification_deliveries;
create trigger notification_deliveries_set_updated_at
before update on public.notification_deliveries
for each row execute function public.set_updated_at();

-- Tax provider references are intentionally separate from the pricing snapshot.
-- Live payment remains blocked until a real Stripe Tax calculation is applied.
alter table public.reservations
  add column if not exists tax_provider text,
  add column if not exists tax_provider_calculation_id text,
  add column if not exists tax_provider_transaction_id text;

create or replace function public.pre_live_hardening_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'pre-live-hardening-026-v1'::text;
$$;

revoke all on function public.pre_live_hardening_version() from public;
grant execute on function public.pre_live_hardening_version() to anon, authenticated;

comment on function public.claim_stripe_payment_attempt(uuid,public.payment_environment,bigint) is
  'Serializes PaymentIntent creation per reservation and validates environment plus snapshotted destination before returning one canonical local attempt.';
comment on table public.notification_deliveries is
  'Idempotency and audit records for reservation-linked transactional email.';

commit;
