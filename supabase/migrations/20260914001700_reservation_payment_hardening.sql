-- Find A Place Booking
-- Milestone 10A.1: reservation/payment integrity hardening.
--
-- Follow-up only. Apply after migration 016. This migration adds database-level
-- ownership consistency, immutable commercial snapshots, safer payment routing,
-- and an explicit runtime gate around local-only reservation test tools.
-- It does not contact Stripe/Square and does not enable live money.

begin;

-- ---------------------------------------------------------------------------
-- 1. Strong top-down ownership constraints.
-- ---------------------------------------------------------------------------
-- PostgreSQL needs a unique key matching each composite FK target. The primary
-- key already makes id unique; these redundant composite keys let the database
-- additionally prove that a reservation's property belongs to its organization
-- and its unit belongs to that property.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.properties'::regclass
      and conname = 'properties_id_organization_unique'
  ) then
    execute 'alter table public.properties add constraint properties_id_organization_unique unique (id, organization_id)';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.property_units'::regclass
      and conname = 'property_units_id_property_unique'
  ) then
    execute 'alter table public.property_units add constraint property_units_id_property_unique unique (id, property_id)';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_property_organization_fk'
  ) then
    execute 'alter table public.reservations add constraint reservations_property_organization_fk foreign key (property_id, organization_id) references public.properties(id, organization_id)';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reservations'::regclass
      and conname = 'reservations_unit_property_fk'
  ) then
    execute 'alter table public.reservations add constraint reservations_unit_property_fk foreign key (unit_id, property_id) references public.property_units(id, property_id)';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Payment-account ownership consistency.
-- ---------------------------------------------------------------------------
create or replace function public.validate_payment_account_assignment_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_organization_id uuid;
  target_organization_id uuid;
begin
  select accounts.organization_id
  into account_organization_id
  from public.payment_accounts accounts
  where accounts.id = new.payment_account_id;

  if account_organization_id is null then
    raise exception 'Payment account not found';
  end if;

  if new.property_id is not null then
    select properties.organization_id
    into target_organization_id
    from public.properties properties
    where properties.id = new.property_id;
  elsif new.unit_id is not null then
    select properties.organization_id
    into target_organization_id
    from public.property_units units
    join public.properties properties on properties.id = units.property_id
    where units.id = new.unit_id;
  end if;

  if target_organization_id is null then
    raise exception 'Payment assignment target not found';
  end if;

  if target_organization_id <> account_organization_id then
    raise exception 'Payment account and assignment target must belong to the same organization';
  end if;

  return new;
end;
$$;

drop trigger if exists payment_account_assignments_validate_ownership on public.payment_account_assignments;
create trigger payment_account_assignments_validate_ownership
before insert or update of payment_account_id, property_id, unit_id
on public.payment_account_assignments
for each row execute function public.validate_payment_account_assignment_ownership();

create or replace function public.prevent_payment_account_organization_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Payment account organization cannot be changed after creation';
  end if;
  return new;
end;
$$;

drop trigger if exists payment_accounts_prevent_organization_change on public.payment_accounts;
create trigger payment_accounts_prevent_organization_change
before update of organization_id on public.payment_accounts
for each row execute function public.prevent_payment_account_organization_change();

create or replace function public.validate_reservation_payment_account_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_row record;
begin
  if new.payment_account_id is null then
    if new.payment_provider is not null
       or new.provider_account_ref is not null
       or new.provider_location_ref is not null then
      raise exception 'Processor routing references require a payment account';
    end if;
    return new;
  end if;

  select accounts.organization_id, accounts.provider,
         accounts.provider_account_id, accounts.provider_location_id
  into account_row
  from public.payment_accounts accounts
  where accounts.id = new.payment_account_id;

  if not found then raise exception 'Payment account not found'; end if;
  if account_row.organization_id <> new.organization_id then
    raise exception 'Reservation payment account must belong to the reservation organization';
  end if;
  if new.payment_provider is distinct from account_row.provider then
    raise exception 'Reservation payment provider does not match its payment account';
  end if;
  if new.provider_account_ref is distinct from account_row.provider_account_id then
    raise exception 'Reservation processor account reference does not match its payment account';
  end if;
  if new.provider_location_ref is distinct from account_row.provider_location_id then
    raise exception 'Reservation processor location reference does not match its payment account';
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_validate_payment_account_ownership on public.reservations;
create trigger reservations_validate_payment_account_ownership
before insert or update of payment_account_id, payment_provider, provider_account_ref, provider_location_ref, organization_id
on public.reservations
for each row execute function public.validate_reservation_payment_account_ownership();

-- Internal reservation-linked records get the same ownership protection.
create or replace function public.validate_availability_block_reservation_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_unit_id uuid;
begin
  if new.reservation_id is null then return new; end if;

  select reservations.unit_id into reservation_unit_id
  from public.reservations reservations
  where reservations.id = new.reservation_id;
  if reservation_unit_id is null then raise exception 'Reservation not found for availability block'; end if;
  if reservation_unit_id <> new.unit_id then
    raise exception 'Reservation availability block must use the reservation unit';
  end if;
  if new.block_type not in ('INTERNAL_HOLD', 'INTERNAL_RESERVATION') then
    raise exception 'Reservation-linked availability blocks must be internal hold/reservation blocks';
  end if;
  return new;
end;
$$;

drop trigger if exists availability_blocks_validate_reservation_unit on public.availability_blocks;
create trigger availability_blocks_validate_reservation_unit
before insert or update of reservation_id, unit_id, block_type
on public.availability_blocks
for each row execute function public.validate_availability_block_reservation_unit();

create or replace function public.validate_promotion_reservation_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_row record;
  promotion_row record;
begin
  select reservations.organization_id, reservations.unit_id
  into reservation_row
  from public.reservations reservations
  where reservations.id = new.reservation_id;
  if not found then raise exception 'Reservation not found for promotion reservation'; end if;

  select promotions.organization_id, promotions.unit_id
  into promotion_row
  from public.promotion_codes promotions
  where promotions.id = new.promotion_code_id;
  if not found then raise exception 'Promotion code not found'; end if;

  if promotion_row.organization_id <> reservation_row.organization_id
     or (promotion_row.unit_id is not null and promotion_row.unit_id <> reservation_row.unit_id) then
    raise exception 'Promotion reservation does not belong to the reservation organization/unit';
  end if;
  return new;
end;
$$;

drop trigger if exists promotion_reservations_validate_scope on public.promotion_reservations;
create trigger promotion_reservations_validate_scope
before insert or update of reservation_id, promotion_code_id
on public.promotion_reservations
for each row execute function public.validate_promotion_reservation_scope();

create or replace function public.validate_payment_reservation_routing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_row record;
begin
  select reservations.payment_account_id, reservations.payment_provider, reservations.currency
  into reservation_row
  from public.reservations reservations
  where reservations.id = new.reservation_id;
  if not found then raise exception 'Reservation not found for payment'; end if;
  if reservation_row.payment_account_id is null or reservation_row.payment_provider is null then
    raise exception 'Reservation must have a locked processor route before payment creation';
  end if;
  if new.payment_account_id is distinct from reservation_row.payment_account_id
     or new.provider is distinct from reservation_row.payment_provider then
    raise exception 'Payment processor route must match the reservation snapshot';
  end if;
  if upper(new.currency) <> upper(reservation_row.currency) then
    raise exception 'Payment currency must match the reservation currency';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_validate_reservation_routing on public.payments;
create trigger payments_validate_reservation_routing
before insert or update of reservation_id, payment_account_id, provider, currency
on public.payments
for each row execute function public.validate_payment_reservation_routing();

create or replace function public.validate_refund_payment_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row record;
begin
  select payments.reservation_id, payments.currency
  into payment_row
  from public.payments payments
  where payments.id = new.payment_id;
  if not found then raise exception 'Payment not found for refund'; end if;
  if payment_row.reservation_id <> new.reservation_id then
    raise exception 'Refund reservation must match the payment reservation';
  end if;
  if upper(new.currency) <> upper(payment_row.currency) then
    raise exception 'Refund currency must match the payment currency';
  end if;
  return new;
end;
$$;

drop trigger if exists refunds_validate_payment_reservation on public.refunds;
create trigger refunds_validate_payment_reservation
before insert or update of reservation_id, payment_id, currency
on public.refunds
for each row execute function public.validate_refund_payment_reservation();

create or replace function public.validate_financial_ledger_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_reservation_id uuid;
  refund_row record;
begin
  if new.payment_id is not null then
    select payments.reservation_id into payment_reservation_id
    from public.payments payments
    where payments.id = new.payment_id;
    if payment_reservation_id is null then raise exception 'Ledger payment not found'; end if;
    if payment_reservation_id <> new.reservation_id then
      raise exception 'Ledger payment must belong to the ledger reservation';
    end if;
  end if;

  if new.refund_id is not null then
    select refunds.reservation_id, refunds.payment_id into refund_row
    from public.refunds refunds
    where refunds.id = new.refund_id;
    if not found then raise exception 'Ledger refund not found'; end if;
    if refund_row.reservation_id <> new.reservation_id then
      raise exception 'Ledger refund must belong to the ledger reservation';
    end if;
    if new.payment_id is not null and refund_row.payment_id <> new.payment_id then
      raise exception 'Ledger refund/payment link is inconsistent';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists financial_ledger_validate_links on public.financial_ledger_entries;
create trigger financial_ledger_validate_links
before insert on public.financial_ledger_entries
for each row execute function public.validate_financial_ledger_links();

-- Validate any 10A rows before the new triggers become the permanent guard.
do $$
begin
  if exists (
    select 1
    from public.payment_account_assignments assignments
    join public.payment_accounts accounts on accounts.id = assignments.payment_account_id
    left join public.properties direct_property on direct_property.id = assignments.property_id
    left join public.property_units units on units.id = assignments.unit_id
    left join public.properties unit_property on unit_property.id = units.property_id
    where coalesce(direct_property.organization_id, unit_property.organization_id)
          is distinct from accounts.organization_id
  ) then
    raise exception 'Existing payment account assignment violates organization ownership';
  end if;

  if exists (
    select 1
    from public.reservations reservations
    join public.payment_accounts accounts on accounts.id = reservations.payment_account_id
    where reservations.payment_account_id is not null
      and (
        accounts.organization_id <> reservations.organization_id
        or accounts.provider is distinct from reservations.payment_provider
        or accounts.provider_account_id is distinct from reservations.provider_account_ref
        or accounts.provider_location_id is distinct from reservations.provider_location_ref
      )
  ) then
    raise exception 'Existing reservation payment routing snapshot is inconsistent';
  end if;

  if exists (
    select 1
    from public.availability_blocks blocks
    join public.reservations reservations on reservations.id = blocks.reservation_id
    where blocks.reservation_id is not null
      and (blocks.unit_id <> reservations.unit_id
           or blocks.block_type not in ('INTERNAL_HOLD','INTERNAL_RESERVATION'))
  ) then
    raise exception 'Existing reservation availability block is inconsistent';
  end if;

  if exists (
    select 1
    from public.promotion_reservations promo_reservations
    join public.reservations reservations on reservations.id = promo_reservations.reservation_id
    join public.promotion_codes promotions on promotions.id = promo_reservations.promotion_code_id
    where promotions.organization_id <> reservations.organization_id
       or (promotions.unit_id is not null and promotions.unit_id <> reservations.unit_id)
  ) then
    raise exception 'Existing promotion reservation scope is inconsistent';
  end if;

  if exists (
    select 1
    from public.payments payments
    join public.reservations reservations on reservations.id = payments.reservation_id
    where reservations.payment_account_id is null
       or reservations.payment_provider is null
       or payments.payment_account_id is distinct from reservations.payment_account_id
       or payments.provider is distinct from reservations.payment_provider
       or upper(payments.currency) <> upper(reservations.currency)
  ) then
    raise exception 'Existing payment routing is inconsistent with its reservation';
  end if;

  if exists (
    select 1
    from public.refunds refunds
    join public.payments payments on payments.id = refunds.payment_id
    where refunds.reservation_id <> payments.reservation_id
       or upper(refunds.currency) <> upper(payments.currency)
  ) then
    raise exception 'Existing refund/payment ownership is inconsistent';
  end if;

  if exists (
    select 1
    from public.financial_ledger_entries ledger
    left join public.payments payments on payments.id = ledger.payment_id
    left join public.refunds refunds on refunds.id = ledger.refund_id
    where (ledger.payment_id is not null and (payments.id is null or payments.reservation_id <> ledger.reservation_id))
       or (ledger.refund_id is not null and (refunds.id is null or refunds.reservation_id <> ledger.reservation_id))
       or (ledger.payment_id is not null and ledger.refund_id is not null and refunds.payment_id <> ledger.payment_id)
  ) then
    raise exception 'Existing financial ledger links are inconsistent';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reservation commercial snapshots are immutable after insertion.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_reservation_commercial_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.property_id is distinct from old.property_id
     or new.unit_id is distinct from old.unit_id
     or new.check_in is distinct from old.check_in
     or new.check_out is distinct from old.check_out
     or new.guest_count is distinct from old.guest_count
     or new.pet_count is distinct from old.pet_count
     or new.currency is distinct from old.currency
     or new.pricing_snapshot is distinct from old.pricing_snapshot
     or new.policy_snapshot is distinct from old.policy_snapshot
     or new.promotion_snapshot is distinct from old.promotion_snapshot
     or new.commission_tier is distinct from old.commission_tier
     or new.commission_rate_bps is distinct from old.commission_rate_bps
     or new.commission_base_cents is distinct from old.commission_base_cents
     or new.platform_commission_cents is distinct from old.platform_commission_cents
     or new.pre_tax_total_cents is distinct from old.pre_tax_total_cents
     or new.processing_fee_policy is distinct from old.processing_fee_policy
     or new.processing_credit_percent_bps is distinct from old.processing_credit_percent_bps
     or new.processing_credit_fixed_cents is distinct from old.processing_credit_fixed_cents
  then
    raise exception 'Reservation commercial snapshot fields are immutable';
  end if;

  -- Processor routing may be attached once while payment has not started (for
  -- example a hold created before the host finishes processor onboarding). Once
  -- an account is snapshotted, or payment leaves NOT_STARTED, routing is locked.
  if new.payment_account_id is distinct from old.payment_account_id
     or new.payment_provider is distinct from old.payment_provider
     or new.provider_account_ref is distinct from old.provider_account_ref
     or new.provider_location_ref is distinct from old.provider_location_ref
  then
    if old.payment_account_id is not null or old.payment_status <> 'NOT_STARTED' then
      raise exception 'Reservation payment routing snapshot is already locked';
    end if;
    if new.payment_account_id is null then
      raise exception 'Reservation payment routing cannot be cleared after assignment';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_prevent_commercial_snapshot_mutation on public.reservations;
create trigger reservations_prevent_commercial_snapshot_mutation
before update on public.reservations
for each row execute function public.prevent_reservation_commercial_snapshot_mutation();

-- ---------------------------------------------------------------------------
-- 4. Payment-account resolver is tenant-safe even when called directly.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_payment_account_for_unit(target_unit_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result_id uuid;
  target_property_id uuid;
  target_organization_id uuid;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.is_active_admin() and not public.can_manage_unit(target_unit_id) then
    raise exception 'Payment routing manager access required';
  end if;

  select units.property_id, properties.organization_id
  into target_property_id, target_organization_id
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where units.id = target_unit_id;

  if target_organization_id is null then return null; end if;

  select assignments.payment_account_id into result_id
  from public.payment_account_assignments assignments
  join public.payment_accounts accounts on accounts.id = assignments.payment_account_id
  where assignments.unit_id = target_unit_id
    and accounts.organization_id = target_organization_id
    and accounts.status = 'READY'
    and accounts.charges_enabled
  limit 1;
  if result_id is not null then return result_id; end if;

  select assignments.payment_account_id into result_id
  from public.payment_account_assignments assignments
  join public.payment_accounts accounts on accounts.id = assignments.payment_account_id
  where assignments.property_id = target_property_id
    and accounts.organization_id = target_organization_id
    and accounts.status = 'READY'
    and accounts.charges_enabled
  limit 1;
  if result_id is not null then return result_id; end if;

  select accounts.id into result_id
  from public.payment_accounts accounts
  where accounts.organization_id = target_organization_id
    and accounts.is_default
    and accounts.status = 'READY'
    and accounts.charges_enabled
  order by accounts.created_at desc
  limit 1;

  return result_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Explicit database gate around local-only test reservation tools.
-- ---------------------------------------------------------------------------
create table if not exists public.platform_runtime_flags (
  singleton integer primary key default 1 check (singleton = 1),
  allow_test_reservation_tools boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.platform_runtime_flags (singleton, allow_test_reservation_tools)
values (1, false)
on conflict (singleton) do nothing;

alter table public.platform_runtime_flags enable row level security;
-- No direct authenticated policies are intentional. This row is changed only
-- from a privileged development/operations SQL session.

create or replace function public.test_reservation_tools_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select flags.allow_test_reservation_tools
    from public.platform_runtime_flags flags
    where flags.singleton = 1
  ), false);
$$;

-- Preserve the tested 10A implementation behind wrappers instead of duplicating
-- the large hold function. Internal implementations are no longer executable by
-- application roles directly.
do $$
begin
  if to_regprocedure('public.create_test_reservation_hold_unchecked(uuid,date,date,integer,integer,uuid[],text,text,text)') is null
     and to_regprocedure('public.create_test_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text)') is not null then
    execute 'alter function public.create_test_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text) rename to create_test_reservation_hold_unchecked';
  end if;

  if to_regprocedure('public.cancel_test_reservation_hold_unchecked(uuid)') is null
     and to_regprocedure('public.cancel_test_reservation_hold(uuid)') is not null then
    execute 'alter function public.cancel_test_reservation_hold(uuid) rename to cancel_test_reservation_hold_unchecked';
  end if;
end;
$$;

create or replace function public.create_test_reservation_hold(
  target_unit_id uuid,
  requested_check_in date,
  requested_check_out date,
  requested_guest_count integer,
  requested_pet_count integer default 0,
  requested_add_on_ids uuid[] default '{}'::uuid[],
  requested_promotion_code text default null,
  requested_guest_name text default 'Local test guest',
  requested_guest_email text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.test_reservation_tools_enabled() then
    raise exception 'Local reservation test tools are disabled';
  end if;

  return public.create_test_reservation_hold_unchecked(
    target_unit_id,
    requested_check_in,
    requested_check_out,
    requested_guest_count,
    requested_pet_count,
    coalesce(requested_add_on_ids, '{}'::uuid[]),
    requested_promotion_code,
    requested_guest_name,
    requested_guest_email
  );
end;
$$;

create or replace function public.cancel_test_reservation_hold(target_reservation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation_row public.reservations%rowtype;
  is_test_reservation boolean := false;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.test_reservation_tools_enabled() then
    raise exception 'Local reservation test tools are disabled';
  end if;

  select reservations.* into reservation_row
  from public.reservations reservations
  where reservations.id = target_reservation_id;
  if not found then raise exception 'Reservation not found'; end if;
  if reservation_row.status <> 'HOLD' then
    raise exception 'Only active local test holds can be released by this tool';
  end if;

  select exists (
    select 1
    from public.reservation_events events
    where events.reservation_id = target_reservation_id
      and events.event_type = 'HOLD_CREATED'
      and coalesce((events.metadata ->> 'test_only')::boolean, false)
  ) into is_test_reservation;

  if not is_test_reservation then
    raise exception 'This reservation was not created by the local test tool';
  end if;

  perform public.cancel_test_reservation_hold_unchecked(target_reservation_id);
end;
$$;

revoke all on function public.create_test_reservation_hold_unchecked(uuid,date,date,integer,integer,uuid[],text,text,text) from public;
revoke all on function public.create_test_reservation_hold_unchecked(uuid,date,date,integer,integer,uuid[],text,text,text) from anon;
revoke all on function public.create_test_reservation_hold_unchecked(uuid,date,date,integer,integer,uuid[],text,text,text) from authenticated;
revoke all on function public.cancel_test_reservation_hold_unchecked(uuid) from public;
revoke all on function public.cancel_test_reservation_hold_unchecked(uuid) from anon;
revoke all on function public.cancel_test_reservation_hold_unchecked(uuid) from authenticated;

revoke all on function public.test_reservation_tools_enabled() from public;
grant execute on function public.test_reservation_tools_enabled() to authenticated;

revoke all on function public.create_test_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text) from public;
grant execute on function public.create_test_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text) to authenticated;
revoke all on function public.cancel_test_reservation_hold(uuid) from public;
grant execute on function public.cancel_test_reservation_hold(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Hardening version marker for the health endpoint.
-- ---------------------------------------------------------------------------
create or replace function public.reservation_payment_hardening_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'reservation-payment-hardening-v1'::text;
$$;

revoke all on function public.reservation_payment_hardening_version() from public;
grant execute on function public.reservation_payment_hardening_version() to anon, authenticated;

comment on table public.platform_runtime_flags is
  'Privileged operational flags. Test reservation tools default disabled and have no direct authenticated table policy.';
comment on function public.test_reservation_tools_enabled() is
  'Returns only whether local reservation test helpers are explicitly enabled by operations.';
comment on function public.resolve_payment_account_for_unit(uuid) is
  'Manager/admin-only payment route resolver. Unit -> property -> organization ownership is verified before a processor account ID is returned.';

commit;
