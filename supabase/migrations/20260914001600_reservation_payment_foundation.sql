-- Find A Place Booking
-- Milestone 10A: reservation / hold / financial / payment-routing foundation.
--
-- Local-first only. This migration creates no Stripe/Square network calls and
-- moves no live money. Public checkout remains disabled. Hosts/admins can use
-- authenticated local test holds to exercise availability + pricing snapshots.

begin;

create type public.payment_provider as enum ('STRIPE', 'SQUARE');
create type public.payment_account_status as enum ('PENDING', 'READY', 'RESTRICTED', 'DISABLED');
create type public.reservation_status as enum ('HOLD', 'PAYMENT_PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'PAYMENT_FAILED');
create type public.reservation_payment_status as enum ('NOT_STARTED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED');
create type public.processing_fee_policy as enum ('HOST_FULL', 'PLATFORM_CREDIT_PERCENT', 'PLATFORM_CREDIT_FIXED', 'PLATFORM_FULL');
create type public.reservation_tax_status as enum ('NOT_CALCULATED', 'CALCULATED', 'FAILED');
create type public.promotion_reservation_status as enum ('RESERVED', 'CONSUMED', 'RELEASED');
create type public.refund_status as enum ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

create table public.payment_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider public.payment_provider not null,
  connection_mode text not null check (connection_mode in ('STRIPE_CONNECT','STRIPE_EXISTING','SQUARE_OAUTH')),
  provider_account_id text,
  provider_location_id text,
  status public.payment_account_status not null default 'PENDING',
  is_default boolean not null default false,
  country_code text not null default 'US',
  currency text not null default 'USD',
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(country_code) = 2),
  check (char_length(currency) = 3),
  check (provider_account_id is null or char_length(provider_account_id) <= 255),
  check (provider_location_id is null or char_length(provider_location_id) <= 255)
);

create unique index payment_accounts_provider_account_unique
  on public.payment_accounts(provider, provider_account_id)
  where provider_account_id is not null;
create unique index payment_accounts_one_default_per_org
  on public.payment_accounts(organization_id)
  where is_default and status <> 'DISABLED';
create index payment_accounts_org_status_idx
  on public.payment_accounts(organization_id, status, created_at);

create table public.payment_account_assignments (
  id uuid primary key default gen_random_uuid(),
  payment_account_id uuid not null references public.payment_accounts(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((property_id is not null)::integer + (unit_id is not null)::integer = 1)
);

create unique index payment_account_assignment_property_unique
  on public.payment_account_assignments(property_id)
  where property_id is not null;
create unique index payment_account_assignment_unit_unique
  on public.payment_account_assignments(unit_id)
  where unit_id is not null;
create index payment_account_assignment_account_idx
  on public.payment_account_assignments(payment_account_id);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  confirmation_code text not null unique,
  organization_id uuid not null references public.organizations(id),
  property_id uuid not null references public.properties(id),
  unit_id uuid not null references public.property_units(id),
  status public.reservation_status not null default 'HOLD',
  check_in date not null,
  check_out date not null,
  hold_expires_at timestamptz,
  guest_name text,
  guest_email text,
  guest_phone text,
  guest_count integer not null check (guest_count between 1 and 100),
  pet_count integer not null default 0 check (pet_count between 0 and 100),
  currency text not null default 'USD',
  pricing_snapshot jsonb not null check (jsonb_typeof(pricing_snapshot) = 'object'),
  policy_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(policy_snapshot) = 'object'),
  promotion_snapshot jsonb,
  commission_tier public.commission_tier not null,
  commission_rate_bps integer not null check (commission_rate_bps between 0 and 10000),
  commission_base_cents bigint not null check (commission_base_cents >= 0),
  platform_commission_cents bigint not null check (platform_commission_cents >= 0),
  pre_tax_total_cents bigint not null check (pre_tax_total_cents >= 0),
  tax_total_cents bigint not null default 0 check (tax_total_cents >= 0),
  guest_total_cents bigint not null check (guest_total_cents >= 0),
  tax_status public.reservation_tax_status not null default 'NOT_CALCULATED',
  tax_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(tax_snapshot) = 'object'),
  processing_fee_policy public.processing_fee_policy not null default 'HOST_FULL',
  processing_credit_percent_bps integer check (processing_credit_percent_bps is null or processing_credit_percent_bps between 0 and 10000),
  processing_credit_fixed_cents bigint check (processing_credit_fixed_cents is null or processing_credit_fixed_cents >= 0),
  payment_account_id uuid references public.payment_accounts(id) on delete set null,
  payment_provider public.payment_provider,
  provider_account_ref text,
  provider_location_ref text,
  payment_status public.reservation_payment_status not null default 'NOT_STARTED',
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in),
  check (hold_expires_at is not null or status <> 'HOLD'),
  check (char_length(currency) = 3),
  check (promotion_snapshot is null or jsonb_typeof(promotion_snapshot) = 'object')
);

create index reservations_unit_dates_idx on public.reservations(unit_id, check_in, check_out, status);
create index reservations_org_created_idx on public.reservations(organization_id, created_at desc);
create index reservations_property_created_idx on public.reservations(property_id, created_at desc);
create index reservations_status_hold_idx on public.reservations(status, hold_expires_at) where status = 'HOLD';
create index reservations_confirmation_idx on public.reservations(confirmation_code);

alter table public.availability_blocks
  add column reservation_id uuid references public.reservations(id) on delete cascade;

create unique index availability_blocks_reservation_active_unique
  on public.availability_blocks(reservation_id)
  where reservation_id is not null and state = 'ACTIVE' and block_type in ('INTERNAL_HOLD','INTERNAL_RESERVATION');

-- Serialize every canonical availability mutation per rentable unit. This makes
-- owner blocks, external sync reconciliation and checkout holds share the same
-- database-level unit lock instead of relying on each caller to remember it.
create or replace function public.lock_availability_unit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform pg_advisory_xact_lock(hashtextextended(old.unit_id::text, 0));
    return old;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.unit_id::text, 0));
  return new;
end;
$$;

create trigger availability_blocks_unit_transaction_lock
before insert or update or delete on public.availability_blocks
for each row execute function public.lock_availability_unit_mutation();

create table public.promotion_reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  promotion_code_id uuid not null references public.promotion_codes(id),
  status public.promotion_reservation_status not null default 'RESERVED',
  discount_cents bigint not null check (discount_cents >= 0),
  reserved_until timestamptz not null,
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create index promotion_reservations_code_status_idx
  on public.promotion_reservations(promotion_code_id, status, reserved_until);

create table public.reservation_events (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  event_type text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index reservation_events_reservation_idx
  on public.reservation_events(reservation_id, created_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  payment_account_id uuid references public.payment_accounts(id) on delete set null,
  provider public.payment_provider not null,
  status public.reservation_payment_status not null default 'NOT_STARTED',
  idempotency_key text not null unique,
  provider_payment_id text,
  provider_charge_id text,
  amount_cents bigint not null check (amount_cents >= 0),
  application_fee_cents bigint not null default 0 check (application_fee_cents >= 0),
  processor_fee_actual_cents bigint check (processor_fee_actual_cents is null or processor_fee_actual_cents >= 0),
  processor_fee_host_share_cents bigint check (processor_fee_host_share_cents is null or processor_fee_host_share_cents >= 0),
  processor_fee_platform_share_cents bigint check (processor_fee_platform_share_cents is null or processor_fee_platform_share_cents >= 0),
  processing_fee_credit_cents bigint not null default 0 check (processing_fee_credit_cents >= 0),
  host_proceeds_cents bigint check (host_proceeds_cents is null or host_proceeds_cents >= 0),
  currency text not null default 'USD',
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(currency) = 3)
);

create unique index payments_provider_payment_unique
  on public.payments(provider, provider_payment_id)
  where provider_payment_id is not null;
create index payments_reservation_idx on public.payments(reservation_id, created_at desc);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  payment_id uuid not null references public.payments(id),
  status public.refund_status not null default 'PENDING',
  provider_refund_id text,
  idempotency_key text not null unique,
  amount_cents bigint not null check (amount_cents > 0),
  platform_fee_refund_cents bigint not null default 0 check (platform_fee_refund_cents >= 0),
  currency text not null default 'USD',
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(currency) = 3)
);

create unique index refunds_provider_refund_unique
  on public.refunds(provider_refund_id)
  where provider_refund_id is not null;
create index refunds_reservation_idx on public.refunds(reservation_id, created_at desc);

create table public.financial_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  payment_id uuid references public.payments(id),
  refund_id uuid references public.refunds(id),
  entry_group_id uuid not null default gen_random_uuid(),
  entry_type text not null check (entry_type in (
    'GUEST_CHARGE','LODGING','HOST_FEE','ADD_ON','TAX','PLATFORM_COMMISSION',
    'PROCESSOR_FEE','PROCESSING_CREDIT','HOST_PROCEEDS','REFUND','CHARGEBACK','ADJUSTMENT'
  )),
  amount_cents bigint not null,
  currency text not null default 'USD',
  description text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (amount_cents <> 0),
  check (char_length(currency) = 3)
);

create index financial_ledger_reservation_idx
  on public.financial_ledger_entries(reservation_id, created_at);
create index financial_ledger_payment_idx
  on public.financial_ledger_entries(payment_id, created_at)
  where payment_id is not null;

create table public.processor_events (
  id uuid primary key default gen_random_uuid(),
  provider public.payment_provider not null,
  external_event_id text not null,
  event_type text not null,
  external_object_id text,
  payload_sha256 text,
  processing_status text not null default 'RECEIVED' check (processing_status in ('RECEIVED','PROCESSED','IGNORED','ERROR')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_message text,
  unique (provider, external_event_id)
);

create index processor_events_status_idx on public.processor_events(processing_status, received_at);

create trigger payment_accounts_set_updated_at before update on public.payment_accounts
for each row execute function public.set_updated_at();
create trigger reservations_set_updated_at before update on public.reservations
for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
for each row execute function public.set_updated_at();
create trigger refunds_set_updated_at before update on public.refunds
for each row execute function public.set_updated_at();

create or replace function public.prevent_financial_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'financial_ledger_entries are append-only';
end;
$$;

create trigger financial_ledger_prevent_update
before update on public.financial_ledger_entries
for each row execute function public.prevent_financial_ledger_mutation();
create trigger financial_ledger_prevent_delete
before delete on public.financial_ledger_entries
for each row execute function public.prevent_financial_ledger_mutation();

create or replace function public.prevent_reservation_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'reservation_events are append-only';
end;
$$;

create trigger reservation_events_prevent_update
before update on public.reservation_events
for each row execute function public.prevent_reservation_event_mutation();
create trigger reservation_events_prevent_delete
before delete on public.reservation_events
for each row execute function public.prevent_reservation_event_mutation();

alter table public.payment_accounts enable row level security;
alter table public.payment_account_assignments enable row level security;
alter table public.reservations enable row level security;
alter table public.promotion_reservations enable row level security;
alter table public.reservation_events enable row level security;
alter table public.payments enable row level security;
alter table public.refunds enable row level security;
alter table public.financial_ledger_entries enable row level security;
alter table public.processor_events enable row level security;

create policy payment_accounts_select_manager_or_admin on public.payment_accounts
for select to authenticated
using (public.is_active_admin() or public.can_manage_organization(organization_id));

create policy payment_account_assignments_select_manager_or_admin on public.payment_account_assignments
for select to authenticated
using (
  public.is_active_admin() or exists (
    select 1 from public.payment_accounts accounts
    where accounts.id = payment_account_assignments.payment_account_id
      and public.can_manage_organization(accounts.organization_id)
  )
);

create policy reservations_select_member_or_admin on public.reservations
for select to authenticated
using (public.can_access_unit(unit_id));

create policy promotion_reservations_select_manager_or_admin on public.promotion_reservations
for select to authenticated
using (
  public.is_active_admin() or exists (
    select 1 from public.reservations reservations
    where reservations.id = promotion_reservations.reservation_id
      and public.can_manage_organization(reservations.organization_id)
  )
);

create policy reservation_events_select_member_or_admin on public.reservation_events
for select to authenticated
using (
  exists (
    select 1 from public.reservations reservations
    where reservations.id = reservation_events.reservation_id
      and public.can_access_unit(reservations.unit_id)
  )
);

create policy payments_select_manager_or_admin on public.payments
for select to authenticated
using (
  public.is_active_admin() or exists (
    select 1 from public.reservations reservations
    where reservations.id = payments.reservation_id
      and public.can_manage_organization(reservations.organization_id)
  )
);

create policy refunds_select_manager_or_admin on public.refunds
for select to authenticated
using (
  public.is_active_admin() or exists (
    select 1 from public.reservations reservations
    where reservations.id = refunds.reservation_id
      and public.can_manage_organization(reservations.organization_id)
  )
);

create policy financial_ledger_select_manager_or_admin on public.financial_ledger_entries
for select to authenticated
using (
  public.is_active_admin() or exists (
    select 1 from public.reservations reservations
    where reservations.id = financial_ledger_entries.reservation_id
      and public.can_manage_organization(reservations.organization_id)
  )
);

create policy processor_events_select_admin on public.processor_events
for select to authenticated
using (public.is_active_admin());

create or replace function public.resolve_payment_account_for_unit(target_unit_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_id uuid;
  target_property_id uuid;
  target_organization_id uuid;
begin
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

create or replace function public.expire_reservation_holds(target_unit_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  expired_ids uuid[] := '{}'::uuid[];
  changed_count integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if target_unit_id is not null and not public.is_active_admin() and not public.can_manage_unit_calendar(target_unit_id) then
    raise exception 'Calendar manager access required';
  end if;

  select coalesce(array_agg(reservations.id), '{}'::uuid[]) into expired_ids
  from public.reservations reservations
  where reservations.status = 'HOLD'
    and reservations.hold_expires_at <= now()
    and (target_unit_id is null or reservations.unit_id = target_unit_id)
    and (public.is_active_admin() or public.can_manage_organization(reservations.organization_id));

  if cardinality(expired_ids) = 0 then return 0; end if;

  update public.reservations reservations
  set status = 'EXPIRED', updated_at = now()
  where reservations.id = any(expired_ids);
  get diagnostics changed_count = row_count;

  update public.availability_blocks blocks
  set state = 'CANCELLED', updated_at = now()
  where blocks.reservation_id = any(expired_ids)
    and blocks.block_type = 'INTERNAL_HOLD'
    and blocks.state = 'ACTIVE';

  update public.promotion_reservations promo_reservations
  set status = 'RELEASED', released_at = now()
  where promo_reservations.reservation_id = any(expired_ids)
    and promo_reservations.status = 'RESERVED';

  insert into public.reservation_events (reservation_id, event_type, actor_profile_id, metadata)
  select expired.reservation_id, 'HOLD_EXPIRED', (select auth.uid()), jsonb_build_object('expired_at', now())
  from unnest(expired_ids) as expired(reservation_id);

  return changed_count;
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
declare
  actor_id uuid := (select auth.uid());
  unit_row record;
  organization_row record;
  quote jsonb;
  availability jsonb;
  reservation_id uuid;
  confirmation text;
  expires_at timestamptz := now() + interval '10 minutes';
  commission_rate integer;
  commission_base bigint;
  commission_amount bigint;
  payment_account_id_value uuid;
  payment_provider_value public.payment_provider;
  provider_account_ref_value text;
  provider_location_ref_value text;
  promotion_id uuid;
  promotion_discount bigint;
  reserved_promo_count bigint := 0;
  promotion_row record;
  policy_snapshot_value jsonb;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_calendar(target_unit_id) then raise exception 'Calendar manager access required'; end if;
  if requested_check_in is null or requested_check_out is null or requested_check_out <= requested_check_in then raise exception 'Checkout must be after check-in'; end if;
  if requested_check_in < current_date then raise exception 'Test hold cannot begin in the past'; end if;
  if requested_guest_count is null or requested_guest_count < 1 then raise exception 'Guest count must be at least one'; end if;
  if requested_pet_count is null or requested_pet_count < 0 then raise exception 'Pet count is invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_unit_id::text, 0));
  perform public.expire_reservation_holds(target_unit_id);

  select units.id as unit_id, units.property_id, units.name as unit_name, units.slug,
         units.check_in, units.checkout, units.cancellation_policy,
         properties.organization_id, properties.name as property_name, properties.status as property_status,
         properties.custom_policies
  into unit_row
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where units.id = target_unit_id and units.is_active;
  if not found then raise exception 'Rentable unit not found'; end if;

  select organizations.id, organizations.commission_tier
  into organization_row
  from public.organizations organizations
  where organizations.id = unit_row.organization_id
  for share;
  if not found then raise exception 'Host organization not found'; end if;

  availability := public.check_unit_availability(target_unit_id, requested_check_in, requested_check_out);
  if coalesce((availability ->> 'available')::boolean, false) is not true then
    raise exception 'Those dates are no longer available';
  end if;

  quote := public.quote_unit_stay(
    target_unit_id,
    requested_check_in,
    requested_check_out,
    requested_guest_count,
    requested_pet_count,
    coalesce(requested_add_on_ids, '{}'::uuid[]),
    requested_promotion_code
  );

  commission_rate := case organization_row.commission_tier when 'PARTNER_5' then 500 else 700 end;
  commission_base := coalesce((quote ->> 'commission_base_cents')::bigint, 0);
  commission_amount := round((commission_base::numeric * commission_rate::numeric) / 10000)::bigint;

  payment_account_id_value := public.resolve_payment_account_for_unit(target_unit_id);
  if payment_account_id_value is not null then
    select accounts.provider, accounts.provider_account_id, accounts.provider_location_id
    into payment_provider_value, provider_account_ref_value, provider_location_ref_value
    from public.payment_accounts accounts
    where accounts.id = payment_account_id_value;
  end if;

  select coalesce(jsonb_build_object(
    'check_in', units.check_in,
    'checkout', units.checkout,
    'cancellation_policy', units.cancellation_policy,
    'custom_policies', properties.custom_policies,
    'policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', policies.policy_code,
        'label', catalog.label,
        'configuration', policies.configuration
      ) order by catalog.label)
      from public.unit_policies policies
      join public.policy_catalog catalog on catalog.code = policies.policy_code
      where policies.unit_id = units.id
    ), '[]'::jsonb)
  ), '{}'::jsonb)
  into policy_snapshot_value
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where units.id = target_unit_id;

  confirmation := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.reservations (
    confirmation_code, organization_id, property_id, unit_id, status,
    check_in, check_out, hold_expires_at, guest_name, guest_email,
    guest_count, pet_count, currency, pricing_snapshot, policy_snapshot,
    promotion_snapshot, commission_tier, commission_rate_bps,
    commission_base_cents, platform_commission_cents, pre_tax_total_cents,
    tax_total_cents, guest_total_cents, tax_status, processing_fee_policy,
    payment_account_id, payment_provider, provider_account_ref, provider_location_ref, payment_status, created_by_profile_id
  ) values (
    confirmation, unit_row.organization_id, unit_row.property_id, target_unit_id, 'HOLD',
    requested_check_in, requested_check_out, expires_at,
    left(nullif(trim(coalesce(requested_guest_name, '')), ''), 180),
    left(nullif(lower(trim(coalesce(requested_guest_email, ''))), ''), 320),
    requested_guest_count, requested_pet_count, coalesce(quote ->> 'currency', 'USD'),
    quote, policy_snapshot_value, quote -> 'promotion', organization_row.commission_tier,
    commission_rate, commission_base, commission_amount,
    coalesce((quote ->> 'pre_tax_total_cents')::bigint, 0), 0,
    coalesce((quote ->> 'pre_tax_total_cents')::bigint, 0), 'NOT_CALCULATED',
    'HOST_FULL', payment_account_id_value,
    payment_provider_value, provider_account_ref_value, provider_location_ref_value,
    'NOT_STARTED', actor_id
  ) returning id into reservation_id;

  if (quote -> 'promotion' ->> 'id') is not null then
    promotion_id := (quote -> 'promotion' ->> 'id')::uuid;
    promotion_discount := coalesce((quote -> 'promotion' ->> 'discount_cents')::bigint, 0);

    select promos.* into promotion_row
    from public.promotion_codes promos
    where promos.id = promotion_id
    for update;
    if not found or not promotion_row.is_active or promotion_row.archived_at is not null then
      raise exception 'Promotion is no longer available';
    end if;

    select count(*)::bigint into reserved_promo_count
    from public.promotion_reservations promo_reservations
    where promo_reservations.promotion_code_id = promotion_id
      and promo_reservations.status = 'RESERVED'
      and promo_reservations.reserved_until > now();

    if promotion_row.max_redemptions is not null
       and promotion_row.redemption_count + reserved_promo_count >= promotion_row.max_redemptions then
      raise exception 'Promotion has reached its usage limit';
    end if;

    insert into public.promotion_reservations (
      reservation_id, promotion_code_id, status, discount_cents, reserved_until
    ) values (
      reservation_id, promotion_id, 'RESERVED', promotion_discount, expires_at
    );
  end if;

  insert into public.availability_blocks (
    unit_id, block_type, state, start_date, end_date, label, expires_at,
    metadata, created_by, reservation_id
  ) values (
    target_unit_id, 'INTERNAL_HOLD', 'ACTIVE', requested_check_in, requested_check_out,
    'Find A Place checkout hold', expires_at,
    jsonb_build_object('reservation_id', reservation_id, 'confirmation_code', confirmation, 'source', 'reservation_foundation_test'),
    actor_id, reservation_id
  );

  insert into public.reservation_events (
    reservation_id, event_type, actor_profile_id, metadata
  ) values (
    reservation_id, 'HOLD_CREATED', actor_id,
    jsonb_build_object(
      'expires_at', expires_at,
      'availability', availability,
      'commission_tier', organization_row.commission_tier,
      'commission_rate_bps', commission_rate,
      'payment_account_id', payment_account_id_value,
      'payment_provider', payment_provider_value,
      'provider_account_ref', provider_account_ref_value,
      'provider_location_ref', provider_location_ref_value,
      'test_only', true
    )
  );

  return jsonb_build_object(
    'reservation_id', reservation_id,
    'confirmation_code', confirmation,
    'status', 'HOLD',
    'hold_expires_at', expires_at,
    'quote', quote,
    'commission_tier', organization_row.commission_tier,
    'commission_rate_bps', commission_rate,
    'platform_commission_cents', commission_amount,
    'payment_account_id', payment_account_id_value,
    'payment_provider', payment_provider_value,
    'provider_account_ref', provider_account_ref_value,
    'provider_location_ref', provider_location_ref_value,
    'payment_ready', payment_account_id_value is not null,
    'tax_ready', false,
    'live_money_enabled', false
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
  actor_id uuid := (select auth.uid());
  reservation_row public.reservations%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;

  select reservations.* into reservation_row
  from public.reservations reservations
  where reservations.id = target_reservation_id
  for update;
  if not found then raise exception 'Reservation not found'; end if;
  if not public.is_active_admin() and not public.can_manage_organization(reservation_row.organization_id) then
    raise exception 'Reservation manager access required';
  end if;
  if reservation_row.status not in ('HOLD','PAYMENT_PENDING') then
    raise exception 'Only active test holds can be cancelled here';
  end if;

  update public.reservations reservations
  set status = 'CANCELLED', cancelled_at = now(), updated_at = now()
  where reservations.id = target_reservation_id;

  update public.availability_blocks blocks
  set state = 'CANCELLED', updated_at = now()
  where blocks.reservation_id = target_reservation_id
    and blocks.block_type = 'INTERNAL_HOLD'
    and blocks.state = 'ACTIVE';

  update public.promotion_reservations promo_reservations
  set status = 'RELEASED', released_at = now()
  where promo_reservations.reservation_id = target_reservation_id
    and promo_reservations.status = 'RESERVED';

  insert into public.reservation_events (reservation_id, event_type, actor_profile_id, metadata)
  values (target_reservation_id, 'HOLD_CANCELLED', actor_id, jsonb_build_object('test_only', true));
end;
$$;

create or replace function public.reservation_payment_foundation_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'reservation-payment-foundation-v1'::text;
$$;

revoke all on function public.resolve_payment_account_for_unit(uuid) from public;
revoke all on function public.expire_reservation_holds(uuid) from public;
revoke all on function public.create_test_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text) from public;
revoke all on function public.cancel_test_reservation_hold(uuid) from public;
revoke all on function public.reservation_payment_foundation_version() from public;

grant execute on function public.resolve_payment_account_for_unit(uuid) to authenticated;
grant execute on function public.expire_reservation_holds(uuid) to authenticated;
grant execute on function public.create_test_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text) to authenticated;
grant execute on function public.cancel_test_reservation_hold(uuid) to authenticated;
grant execute on function public.reservation_payment_foundation_version() to anon, authenticated;

comment on table public.payment_accounts is
  'Processor account references only. Raw bank details, SSNs and provider secret credentials are never stored here.';
comment on table public.reservations is
  'Immutable-at-booking commercial snapshot boundary. Pricing, commission tier/rate/base, processing policy, tax state and routed payment account are snapshotted per reservation.';
comment on table public.promotion_reservations is
  'Temporary/consumed promo reservations so limited promo inventory can be protected atomically before payment confirmation.';
comment on table public.financial_ledger_entries is
  'Append-only financial journal. Corrections use reversing/adjusting entries rather than mutation.';
comment on function public.create_test_reservation_hold(uuid,date,date,integer,integer,uuid[],text,text,text) is
  'Authenticated local-development hold creator. It is intentionally not granted to anon and does not contact a payment processor.';

commit;
