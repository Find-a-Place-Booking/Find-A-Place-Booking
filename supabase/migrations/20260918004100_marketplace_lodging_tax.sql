-- Find A Place Booking
-- Marketplace lodging-tax collection, retention and remittance foundation.
--
-- Design:
--   * Find A Place is the marketplace collector/remitter for configured lodging taxes.
--   * Statewide rules can apply automatically by region.
--   * Local rules require verified property jurisdiction + explicit assignment.
--   * Tax is snapshotted before Stripe payment creation.
--   * Destination-charge application fees retain commission + processor recovery + tax.
--   * Commission remains based on the existing lodging commission base only.
--   * Tax liabilities are tracked separately from marketplace revenue.

begin;

create table if not exists public.tax_authorities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  jurisdiction_type text not null
    check (jurisdiction_type in ('STATE_SALES','STATE_TOURISM','COUNTY_SALES','CITY_SALES','LOCAL_LODGING','OTHER')),
  country_code text not null default 'US',
  region_code text,
  locality_name text,
  remittance_agency text not null,
  source_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(country_code) = 2)
);

create table if not exists public.tax_rules (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid not null references public.tax_authorities(id),
  code text not null unique,
  label text not null,
  rate_bps integer not null check (rate_bps between 0 and 10000),
  base_scope text not null default 'ACCOMMODATION_TOTAL'
    check (base_scope in ('LODGING_ONLY','ACCOMMODATION_TOTAL','PRE_TAX_TOTAL')),
  automatic_region boolean not null default false,
  assignment_required boolean not null default true,
  maximum_stay_nights integer check (maximum_stay_nights is null or maximum_stay_nights >= 1),
  effective_from date not null,
  effective_to date,
  source_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists tax_rules_authority_effective_idx
  on public.tax_rules(authority_id, effective_from, effective_to, is_active);

create table if not exists public.property_tax_profiles (
  property_id uuid primary key references public.properties(id) on delete cascade,
  verification_status text not null default 'PENDING'
    check (verification_status in ('PENDING','VERIFIED')),
  county_name text,
  locality_name text,
  verification_notes text,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  last_rate_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (verification_status = 'VERIFIED' and verified_at is not null)
    or verification_status = 'PENDING'
  )
);

create table if not exists public.property_tax_rule_assignments (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tax_rule_id uuid not null references public.tax_rules(id) on delete cascade,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  unique(property_id, tax_rule_id)
);

create index if not exists property_tax_assignments_property_idx
  on public.property_tax_rule_assignments(property_id);

alter table public.reservations
  add column if not exists platform_tax_retained_cents bigint
    not null default 0 check (platform_tax_retained_cents >= 0);

alter table public.payments
  add column if not exists platform_tax_retained_cents bigint
    not null default 0 check (platform_tax_retained_cents >= 0);

comment on column public.reservations.platform_tax_retained_cents is
  'Lodging tax collected from the guest and retained by Find A Place for remittance. Not marketplace revenue.';
comment on column public.payments.platform_tax_retained_cents is
  'Tax portion of the Stripe application fee retained for government remittance. Kept separate from commission and processor recovery.';

create table if not exists public.tax_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id),
  payment_id uuid references public.payments(id),
  refund_id uuid references public.refunds(id),
  authority_id uuid not null references public.tax_authorities(id),
  tax_rule_id uuid references public.tax_rules(id),
  entry_type text not null
    check (entry_type in ('COLLECTED','REFUND_REVERSAL','ADJUSTMENT')),
  amount_cents bigint not null check (amount_cents <> 0),
  currency text not null default 'USD',
  tax_period_start date not null,
  description text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  check (char_length(currency) = 3)
);

create unique index if not exists tax_ledger_one_collection_per_rule
  on public.tax_ledger_entries(reservation_id, tax_rule_id)
  where entry_type = 'COLLECTED';

create unique index if not exists tax_ledger_one_refund_reversal_per_rule
  on public.tax_ledger_entries(refund_id, tax_rule_id)
  where entry_type = 'REFUND_REVERSAL' and refund_id is not null;

create index if not exists tax_ledger_authority_period_idx
  on public.tax_ledger_entries(authority_id, tax_period_start, created_at);

create table if not exists public.tax_remittances (
  id uuid primary key default gen_random_uuid(),
  authority_id uuid not null references public.tax_authorities(id),
  period_start date not null,
  period_end date not null,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'FILED'
    check (status in ('DRAFT','FILED','PAID')),
  confirmation_reference text,
  notes text,
  created_by uuid not null references public.profiles(id),
  filed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (char_length(currency) = 3)
);

create index if not exists tax_remittances_authority_period_idx
  on public.tax_remittances(authority_id, period_start, period_end);

drop trigger if exists tax_authorities_set_updated_at on public.tax_authorities;
create trigger tax_authorities_set_updated_at
before update on public.tax_authorities
for each row execute function public.set_updated_at();

drop trigger if exists tax_rules_set_updated_at on public.tax_rules;
create trigger tax_rules_set_updated_at
before update on public.tax_rules
for each row execute function public.set_updated_at();

drop trigger if exists property_tax_profiles_set_updated_at on public.property_tax_profiles;
create trigger property_tax_profiles_set_updated_at
before update on public.property_tax_profiles
for each row execute function public.set_updated_at();

drop trigger if exists tax_remittances_set_updated_at on public.tax_remittances;
create trigger tax_remittances_set_updated_at
before update on public.tax_remittances
for each row execute function public.set_updated_at();

create or replace function public.prevent_tax_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'tax_ledger_entries are append-only';
end;
$$;

drop trigger if exists tax_ledger_prevent_update on public.tax_ledger_entries;
create trigger tax_ledger_prevent_update
before update on public.tax_ledger_entries
for each row execute function public.prevent_tax_ledger_mutation();

drop trigger if exists tax_ledger_prevent_delete on public.tax_ledger_entries;
create trigger tax_ledger_prevent_delete
before delete on public.tax_ledger_entries
for each row execute function public.prevent_tax_ledger_mutation();

alter table public.tax_authorities enable row level security;
alter table public.tax_rules enable row level security;
alter table public.property_tax_profiles enable row level security;
alter table public.property_tax_rule_assignments enable row level security;
alter table public.tax_ledger_entries enable row level security;
alter table public.tax_remittances enable row level security;

drop policy if exists tax_authorities_select_admin on public.tax_authorities;
create policy tax_authorities_select_admin
on public.tax_authorities for select to authenticated
using (public.is_active_admin());

drop policy if exists tax_rules_select_admin on public.tax_rules;
create policy tax_rules_select_admin
on public.tax_rules for select to authenticated
using (public.is_active_admin());

drop policy if exists property_tax_profiles_select_admin on public.property_tax_profiles;
create policy property_tax_profiles_select_admin
on public.property_tax_profiles for select to authenticated
using (public.is_active_admin());

drop policy if exists property_tax_assignments_select_admin on public.property_tax_rule_assignments;
create policy property_tax_assignments_select_admin
on public.property_tax_rule_assignments for select to authenticated
using (public.is_active_admin());

drop policy if exists tax_ledger_select_admin on public.tax_ledger_entries;
create policy tax_ledger_select_admin
on public.tax_ledger_entries for select to authenticated
using (public.is_active_admin());

drop policy if exists tax_remittances_select_admin on public.tax_remittances;
create policy tax_remittances_select_admin
on public.tax_remittances for select to authenticated
using (public.is_active_admin());

insert into public.tax_authorities (
  code,name,jurisdiction_type,country_code,region_code,locality_name,
  remittance_agency,source_url,is_active
) values
  (
    'AR_DFA_SALES',
    'Arkansas state and local sales tax',
    'STATE_SALES',
    'US','AR',null,
    'Arkansas Department of Finance and Administration',
    'https://www.dfa.arkansas.gov/office/taxes/excise-tax-administration/sales-use-tax/',
    true
  ),
  (
    'AR_DFA_TOURISM',
    'Arkansas tourism tax',
    'STATE_TOURISM',
    'US','AR',null,
    'Arkansas Department of Finance and Administration',
    'https://www.dfa.arkansas.gov/office/taxes/excise-tax-administration/sales-use-tax/',
    true
  ),
  (
    'HOT_SPRINGS_AP',
    'Hot Springs Advertising & Promotion tax',
    'LOCAL_LODGING',
    'US','AR','Hot Springs',
    'Hot Springs Advertising & Promotion Commission',
    'https://hotsprings.org/explore/tax/',
    true
  )
on conflict (code) do update set
  name = excluded.name,
  jurisdiction_type = excluded.jurisdiction_type,
  country_code = excluded.country_code,
  region_code = excluded.region_code,
  locality_name = excluded.locality_name,
  remittance_agency = excluded.remittance_agency,
  source_url = excluded.source_url,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.tax_rules (
  authority_id,code,label,rate_bps,base_scope,automatic_region,
  assignment_required,maximum_stay_nights,effective_from,source_url,is_active
) values
  (
    (select id from public.tax_authorities where code = 'AR_DFA_SALES'),
    'AR_STATE_SALES_2026',
    'Arkansas state sales tax',
    650,
    'ACCOMMODATION_TOTAL',
    true,
    false,
    29,
    '2026-01-01',
    'https://www.dfa.arkansas.gov/office/taxes/excise-tax-administration/sales-use-tax/sales-and-use-tax-faqs/',
    true
  ),
  (
    (select id from public.tax_authorities where code = 'AR_DFA_TOURISM'),
    'AR_TOURISM_LODGING_2026',
    'Arkansas tourism tax',
    200,
    'ACCOMMODATION_TOTAL',
    true,
    false,
    29,
    '2026-01-01',
    'https://www.dfa.arkansas.gov/office/taxes/excise-tax-administration/sales-use-tax/',
    true
  ),
  (
    (select id from public.tax_authorities where code = 'AR_DFA_SALES'),
    'HOT_SPRINGS_GARLAND_LOCAL_SALES_2026',
    'Hot Springs + Garland County local sales tax',
    300,
    'ACCOMMODATION_TOTAL',
    false,
    true,
    29,
    '2026-01-01',
    'https://www.dfa.arkansas.gov/office/taxes/excise-tax-administration/sales-use-tax/streamlined-tax-lookup/',
    true
  ),
  (
    (select id from public.tax_authorities where code = 'HOT_SPRINGS_AP'),
    'HOT_SPRINGS_AP_LODGING_2026',
    'Hot Springs A&P lodging tax',
    300,
    'ACCOMMODATION_TOTAL',
    false,
    true,
    29,
    '2026-01-01',
    'https://hotsprings.org/explore/tax/',
    true
  )
on conflict (code) do update set
  authority_id = excluded.authority_id,
  label = excluded.label,
  rate_bps = excluded.rate_bps,
  base_scope = excluded.base_scope,
  automatic_region = excluded.automatic_region,
  assignment_required = excluded.assignment_required,
  maximum_stay_nights = excluded.maximum_stay_nights,
  effective_from = excluded.effective_from,
  source_url = excluded.source_url,
  is_active = excluded.is_active,
  updated_at = now();

create or replace function public.calculate_reservation_lodging_tax(
  target_reservation_id uuid,
  expected_environment public.payment_environment
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation_row public.reservations%rowtype;
  property_row public.properties%rowtype;
  profile_row public.property_tax_profiles%rowtype;
  profile_verified boolean := false;
  calculation_id uuid := gen_random_uuid();
  nights integer;
  lodging_cents bigint := 0;
  cleaning_cents bigint := 0;
  pet_cents bigint := 0;
  extra_guest_cents bigint := 0;
  addon_cents bigint := 0;
  accommodation_total_cents bigint := 0;
  taxable_base_cents bigint;
  line_tax_cents bigint;
  tax_total bigint := 0;
  tax_lines jsonb := '[]'::jsonb;
  rule_count integer := 0;
  rule_row record;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select reservations.* into reservation_row
  from public.reservations reservations
  where reservations.id = target_reservation_id
  for update;
  if not found then raise exception 'Reservation not found'; end if;

  if reservation_row.payment_environment <> expected_environment then
    raise exception 'Reservation belongs to the wrong payment environment';
  end if;

  if reservation_row.status not in ('HOLD','PAYMENT_PENDING','PAYMENT_FAILED') then
    raise exception 'Taxes cannot be recalculated after the reservation leaves checkout';
  end if;

  select properties.* into property_row
  from public.properties properties
  where properties.id = reservation_row.property_id;
  if not found then raise exception 'Reservation property not found'; end if;

  select profiles.* into profile_row
  from public.property_tax_profiles profiles
  where profiles.property_id = reservation_row.property_id;

  profile_verified := found and profile_row.verification_status = 'VERIFIED';
  nights := reservation_row.check_out - reservation_row.check_in;

  if expected_environment = 'LIVE' then
    if nullif(trim(coalesce(property_row.street_address, '')), '') is null
       or nullif(trim(coalesce(property_row.city, '')), '') is null
       or nullif(trim(coalesce(property_row.region_code, '')), '') is null
       or nullif(trim(coalesce(property_row.postal_code, '')), '') is null then
      raise exception 'Live checkout requires a complete property address for lodging-tax verification';
    end if;

    if not profile_verified then
      raise exception 'Live checkout requires the property tax jurisdiction to be verified by Find A Place';
    end if;

    if nights >= 30 then
      raise exception 'Live checkout for stays of 30 nights or more is blocked pending contract-based transient-tax handling';
    end if;
  end if;

  lodging_cents := greatest(coalesce((reservation_row.pricing_snapshot ->> 'lodging_subtotal_cents')::bigint, 0), 0);
  cleaning_cents := greatest(coalesce((reservation_row.pricing_snapshot ->> 'cleaning_fee_cents')::bigint, 0), 0);
  pet_cents := greatest(coalesce((reservation_row.pricing_snapshot ->> 'pet_fee_cents')::bigint, 0), 0);
  extra_guest_cents := greatest(coalesce((reservation_row.pricing_snapshot ->> 'extra_guest_fee_cents')::bigint, 0), 0);
  addon_cents := greatest(coalesce((reservation_row.pricing_snapshot ->> 'add_on_subtotal_cents')::bigint, 0), 0);
  accommodation_total_cents := lodging_cents + cleaning_cents + pet_cents + extra_guest_cents;

  for rule_row in
    select
      rules.id as rule_id,
      rules.code as rule_code,
      rules.label,
      rules.rate_bps,
      rules.base_scope,
      rules.maximum_stay_nights,
      authorities.id as authority_id,
      authorities.code as authority_code,
      authorities.name as authority_name,
      authorities.remittance_agency
    from public.tax_rules rules
    join public.tax_authorities authorities on authorities.id = rules.authority_id
    where rules.is_active
      and authorities.is_active
      and upper(authorities.country_code) = upper(coalesce(property_row.country_code, 'US'))
      and (authorities.region_code is null or upper(authorities.region_code) = upper(coalesce(property_row.region_code, '')))
      and reservation_row.check_in >= rules.effective_from
      and (rules.effective_to is null or reservation_row.check_in <= rules.effective_to)
      and (rules.maximum_stay_nights is null or nights <= rules.maximum_stay_nights)
      and (
        (rules.automatic_region and not rules.assignment_required)
        or exists (
          select 1
          from public.property_tax_rule_assignments assignments
          where assignments.property_id = reservation_row.property_id
            and assignments.tax_rule_id = rules.id
        )
      )
    order by authorities.jurisdiction_type, rules.code
  loop
    taxable_base_cents := case rule_row.base_scope
      when 'LODGING_ONLY' then lodging_cents
      when 'PRE_TAX_TOTAL' then reservation_row.pre_tax_total_cents
      else accommodation_total_cents
    end;

    taxable_base_cents := greatest(coalesce(taxable_base_cents, 0), 0);
    line_tax_cents := round(taxable_base_cents::numeric * rule_row.rate_bps::numeric / 10000)::bigint;
    tax_total := tax_total + greatest(line_tax_cents, 0);
    rule_count := rule_count + 1;

    tax_lines := tax_lines || jsonb_build_array(jsonb_build_object(
      'authority_id', rule_row.authority_id,
      'authority_code', rule_row.authority_code,
      'authority_name', rule_row.authority_name,
      'remittance_agency', rule_row.remittance_agency,
      'rule_id', rule_row.rule_id,
      'rule_code', rule_row.rule_code,
      'label', rule_row.label,
      'rate_bps', rule_row.rate_bps,
      'base_scope', rule_row.base_scope,
      'taxable_base_cents', taxable_base_cents,
      'tax_cents', greatest(line_tax_cents, 0)
    ));
  end loop;

  if expected_environment = 'LIVE'
     and upper(coalesce(property_row.region_code, '')) = 'AR'
     and rule_count < 2 then
    raise exception 'Arkansas live checkout requires current state sales and tourism tax rules';
  end if;

  update public.reservations reservations
  set
    tax_total_cents = tax_total,
    guest_total_cents = reservations.pre_tax_total_cents + tax_total,
    tax_status = 'CALCULATED',
    tax_snapshot = jsonb_build_object(
      'calculation_id', calculation_id,
      'calculated_at', now(),
      'calculation_engine', 'FAP_MARKETPLACE_RULES_V1',
      'payment_environment', expected_environment,
      'property', jsonb_build_object(
        'property_id', property_row.id,
        'street_address', property_row.street_address,
        'city', property_row.city,
        'region_code', property_row.region_code,
        'postal_code', property_row.postal_code,
        'country_code', property_row.country_code,
        'county_name', case when profile_verified then profile_row.county_name else null end,
        'locality_name', case when profile_verified then profile_row.locality_name else null end,
        'jurisdiction_verified', profile_verified
      ),
      'components', jsonb_build_object(
        'lodging_cents', lodging_cents,
        'cleaning_cents', cleaning_cents,
        'pet_cents', pet_cents,
        'extra_guest_cents', extra_guest_cents,
        'add_on_cents', addon_cents,
        'pre_tax_total_cents', reservations.pre_tax_total_cents
      ),
      'rules', tax_lines,
      'tax_total_cents', tax_total
    ),
    tax_provider = 'FAP_MARKETPLACE_RULES',
    tax_provider_calculation_id = calculation_id::text,
    platform_tax_retained_cents = tax_total,
    updated_at = now()
  where reservations.id = target_reservation_id
  returning * into reservation_row;

  insert into public.reservation_events (reservation_id,event_type,actor_profile_id,metadata)
  values (
    target_reservation_id,
    'TAX_CALCULATED',
    null,
    jsonb_build_object(
      'calculation_id', calculation_id,
      'tax_total_cents', tax_total,
      'guest_total_cents', reservation_row.guest_total_cents,
      'rule_count', rule_count,
      'jurisdiction_verified', profile_verified,
      'payment_environment', expected_environment
    )
  );

  return jsonb_build_object(
    'calculation_id', calculation_id,
    'tax_status', 'CALCULATED',
    'tax_total_cents', tax_total,
    'guest_total_cents', reservation_row.guest_total_cents,
    'platform_tax_retained_cents', tax_total,
    'tax_snapshot', reservation_row.tax_snapshot
  );
end;
$$;

revoke all on function public.calculate_reservation_lodging_tax(uuid,public.payment_environment) from public, anon, authenticated;
grant execute on function public.calculate_reservation_lodging_tax(uuid,public.payment_environment) to service_role;

create or replace function public.create_guest_taxed_reservation_hold(
  target_unit_id uuid,
  requested_check_in date,
  requested_check_out date,
  requested_guest_count integer,
  requested_pet_count integer default 0,
  requested_add_on_ids uuid[] default '{}'::uuid[],
  requested_promotion_code text default null,
  requested_guest_name text default null,
  requested_guest_email text default null,
  requested_guest_phone text default null,
  requested_payment_environment public.payment_environment default 'TEST'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hold_result jsonb;
  tax_result jsonb;
  combined_quote jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  hold_result := public.create_guest_reservation_hold(
    target_unit_id,
    requested_check_in,
    requested_check_out,
    requested_guest_count,
    requested_pet_count,
    requested_add_on_ids,
    requested_promotion_code,
    requested_guest_name,
    requested_guest_email,
    requested_guest_phone,
    requested_payment_environment
  );

  tax_result := public.calculate_reservation_lodging_tax(
    (hold_result ->> 'reservation_id')::uuid,
    requested_payment_environment
  );

  combined_quote := coalesce(hold_result -> 'quote', '{}'::jsonb) || jsonb_build_object(
    'taxes_calculated', true,
    'tax_total_cents', (tax_result ->> 'tax_total_cents')::bigint,
    'guest_total_cents', (tax_result ->> 'guest_total_cents')::bigint,
    'tax_lines', tax_result -> 'tax_snapshot' -> 'rules'
  );

  return hold_result || jsonb_build_object(
    'quote', combined_quote,
    'tax_status', tax_result ->> 'tax_status',
    'tax_total_cents', (tax_result ->> 'tax_total_cents')::bigint,
    'guest_total_cents', (tax_result ->> 'guest_total_cents')::bigint,
    'platform_tax_retained_cents', (tax_result ->> 'platform_tax_retained_cents')::bigint
  );
end;
$$;

revoke all on function public.create_guest_taxed_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment
) from public, anon, authenticated;
grant execute on function public.create_guest_taxed_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment
) to service_role;

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
  platform_tax bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select reservations.* into reservation_row
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

  if reservation_row.hold_expires_at is not null and reservation_row.hold_expires_at <= now() then
    raise exception 'Reservation hold expired';
  end if;

  if expected_environment = 'LIVE' and reservation_row.tax_status <> 'CALCULATED' then
    raise exception 'Live checkout requires a completed lodging-tax calculation';
  end if;

  platform_tax := greatest(coalesce(reservation_row.platform_tax_retained_cents, 0), 0);

  if reservation_row.tax_status = 'CALCULATED' and platform_tax <> reservation_row.tax_total_cents then
    raise exception 'Reservation tax retention does not match the calculated tax snapshot';
  end if;

  select accounts.* into account_row
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

  select payments.* into payment_row
  from public.payments payments
  where payments.reservation_id = target_reservation_id
    and payments.provider = 'STRIPE'
    and payments.payment_environment = expected_environment
    and payments.status <> 'CANCELLED'
  order by payments.created_at desc
  limit 1
  for update;

  if found then
    if payment_row.platform_tax_retained_cents <> platform_tax then
      raise exception 'Existing Stripe payment attempt has a stale tax-retention snapshot';
    end if;

    return to_jsonb(payment_row) || jsonb_build_object('connected_account_id', account_row.provider_account_id);
  end if;

  if processor_fee_recovery_cents is null or processor_fee_recovery_cents < 0 then
    raise exception 'Processor fee recovery is invalid';
  end if;

  application_fee := least(
    reservation_row.guest_total_cents,
    reservation_row.platform_commission_cents + processor_fee_recovery_cents + platform_tax
  );

  payment_id := gen_random_uuid();

  insert into public.payments (
    id,reservation_id,payment_account_id,provider,payment_environment,status,
    idempotency_key,amount_cents,application_fee_cents,
    platform_tax_retained_cents,processor_fee_host_share_cents,
    processor_fee_platform_share_cents,processing_fee_credit_cents,
    host_proceeds_cents,currency
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
    platform_tax,
    processor_fee_recovery_cents,
    0,
    0,
    greatest(reservation_row.guest_total_cents - application_fee, 0),
    reservation_row.currency
  ) returning * into payment_row;

  return to_jsonb(payment_row) || jsonb_build_object('connected_account_id', account_row.provider_account_id);
end;
$$;

revoke all on function public.claim_stripe_payment_attempt(uuid,public.payment_environment,bigint) from public, anon, authenticated;
grant execute on function public.claim_stripe_payment_attempt(uuid,public.payment_environment,bigint) to service_role;

create or replace function public.confirm_reservation_payment(
  target_reservation_id uuid,
  target_payment_id uuid,
  target_provider_payment_id text,
  target_provider_charge_id text,
  target_processor_fee_actual_cents bigint
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
  consumed_promotion_code_id uuid;
  ledger_group uuid := gen_random_uuid();
  host_proceeds bigint;
  platform_tax bigint;
  processor_recovery bigint;
  processor_platform_share bigint;
  processor_variance bigint;
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
  where payments.id = target_payment_id
    and payments.reservation_id = target_reservation_id
  for update;
  if not found then raise exception 'Payment not found'; end if;

  if reservation_row.status = 'CONFIRMED'
     and reservation_row.payment_status = 'SUCCEEDED'
     and payment_row.status = 'SUCCEEDED' then
    return jsonb_build_object('status', 'CONFIRMED', 'confirmation_code', reservation_row.confirmation_code);
  end if;

  if reservation_row.status not in ('HOLD','PAYMENT_PENDING','PAYMENT_FAILED') then
    raise exception 'Reservation is no longer confirmable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(reservation_row.unit_id::text, 0));

  platform_tax := greatest(coalesce(payment_row.platform_tax_retained_cents, 0), 0);
  host_proceeds := greatest(payment_row.amount_cents - payment_row.application_fee_cents, 0);
  processor_recovery := greatest(
    payment_row.application_fee_cents - reservation_row.platform_commission_cents - platform_tax,
    0
  );
  processor_platform_share := greatest(coalesce(target_processor_fee_actual_cents, 0) - processor_recovery, 0);
  processor_variance := coalesce(target_processor_fee_actual_cents, 0) - processor_recovery;

  update public.payments payments
  set
    status = 'SUCCEEDED',
    provider_payment_id = coalesce(target_provider_payment_id, payments.provider_payment_id),
    provider_charge_id = coalesce(target_provider_charge_id, payments.provider_charge_id),
    processor_fee_actual_cents = greatest(coalesce(target_processor_fee_actual_cents, 0), 0),
    processor_fee_host_share_cents = processor_recovery,
    processor_fee_platform_share_cents = processor_platform_share,
    host_proceeds_cents = host_proceeds,
    failure_code = null,
    failure_message = null,
    updated_at = now()
  where payments.id = target_payment_id;

  update public.reservations reservations
  set
    status = 'CONFIRMED',
    payment_status = 'SUCCEEDED',
    hold_expires_at = null,
    confirmed_at = coalesce(reservations.confirmed_at, now()),
    updated_at = now()
  where reservations.id = target_reservation_id;

  update public.availability_blocks blocks
  set
    block_type = 'INTERNAL_RESERVATION',
    expires_at = null,
    label = 'Find A Place reservation',
    metadata = blocks.metadata || jsonb_build_object(
      'payment_id', target_payment_id,
      'provider_payment_id', target_provider_payment_id
    ),
    updated_at = now()
  where blocks.reservation_id = target_reservation_id
    and blocks.state = 'ACTIVE'
    and blocks.block_type = 'INTERNAL_HOLD';

  update public.promotion_reservations promo_reservations
  set status = 'CONSUMED', consumed_at = now()
  where promo_reservations.reservation_id = target_reservation_id
    and promo_reservations.status = 'RESERVED'
  returning promo_reservations.promotion_code_id into consumed_promotion_code_id;

  if consumed_promotion_code_id is not null then
    update public.promotion_codes promotions
    set redemption_count = promotions.redemption_count + 1, updated_at = now()
    where promotions.id = consumed_promotion_code_id;
  end if;

  if not exists (
    select 1 from public.financial_ledger_entries ledger
    where ledger.payment_id = target_payment_id and ledger.entry_type = 'GUEST_CHARGE'
  ) then
    insert into public.financial_ledger_entries (
      reservation_id,payment_id,entry_group_id,entry_type,amount_cents,currency,description,metadata
    ) values
      (
        target_reservation_id,target_payment_id,ledger_group,'GUEST_CHARGE',payment_row.amount_cents,
        reservation_row.currency,'Guest charge processed by Stripe',
        jsonb_build_object('provider', payment_row.provider, 'provider_payment_id', target_provider_payment_id)
      ),
      (
        target_reservation_id,target_payment_id,ledger_group,'HOST_PROCEEDS',-host_proceeds,
        reservation_row.currency,'Host proceeds routed by destination charge',
        jsonb_build_object('provider_account_ref', reservation_row.provider_account_ref)
      ),
      (
        target_reservation_id,target_payment_id,ledger_group,'PLATFORM_COMMISSION',-reservation_row.platform_commission_cents,
        reservation_row.currency,'Find A Place marketplace commission',
        jsonb_build_object('commission_rate_bps', reservation_row.commission_rate_bps)
      );

    if platform_tax > 0 then
      insert into public.financial_ledger_entries (
        reservation_id,payment_id,entry_group_id,entry_type,amount_cents,currency,description,metadata
      ) values (
        target_reservation_id,target_payment_id,ledger_group,'TAX',-platform_tax,
        reservation_row.currency,'Lodging tax retained by Find A Place for remittance',
        jsonb_build_object('tax_snapshot', reservation_row.tax_snapshot)
      );
    end if;

    if greatest(coalesce(target_processor_fee_actual_cents, 0), 0) > 0 then
      insert into public.financial_ledger_entries (
        reservation_id,payment_id,entry_group_id,entry_type,amount_cents,currency,description,metadata
      ) values (
        target_reservation_id,target_payment_id,ledger_group,'PROCESSOR_FEE',
        -greatest(coalesce(target_processor_fee_actual_cents, 0), 0),reservation_row.currency,
        'Stripe processor fee',jsonb_build_object(
          'host_recovery_cents', processor_recovery,
          'platform_unrecovered_cents', processor_platform_share
        )
      );
    end if;

    if processor_variance <> 0 then
      insert into public.financial_ledger_entries (
        reservation_id,payment_id,entry_group_id,entry_type,amount_cents,currency,description,metadata
      ) values (
        target_reservation_id,target_payment_id,ledger_group,'ADJUSTMENT',processor_variance,
        reservation_row.currency,'Processor fee recovery variance',jsonb_build_object(
          'processor_fee_actual_cents', coalesce(target_processor_fee_actual_cents, 0),
          'processor_fee_recovery_cents', processor_recovery
        )
      );
    end if;
  end if;

  if platform_tax > 0 then
    insert into public.tax_ledger_entries (
      reservation_id,payment_id,authority_id,tax_rule_id,entry_type,amount_cents,
      currency,tax_period_start,description,metadata
    )
    select
      target_reservation_id,
      target_payment_id,
      (line ->> 'authority_id')::uuid,
      (line ->> 'rule_id')::uuid,
      'COLLECTED',
      (line ->> 'tax_cents')::bigint,
      reservation_row.currency,
      date_trunc('month', now())::date,
      coalesce(line ->> 'label', 'Lodging tax collected'),
      jsonb_build_object(
        'calculation_id', reservation_row.tax_provider_calculation_id,
        'authority_code', line ->> 'authority_code',
        'rule_code', line ->> 'rule_code',
        'rate_bps', line ->> 'rate_bps',
        'taxable_base_cents', line ->> 'taxable_base_cents',
        'remittance_agency', line ->> 'remittance_agency'
      )
    from jsonb_array_elements(coalesce(reservation_row.tax_snapshot -> 'rules', '[]'::jsonb)) as line
    where coalesce((line ->> 'tax_cents')::bigint, 0) > 0
    on conflict (reservation_id, tax_rule_id) where entry_type = 'COLLECTED' do nothing;
  end if;

  insert into public.reservation_events (reservation_id,event_type,actor_profile_id,metadata)
  values (
    target_reservation_id,
    'PAYMENT_SUCCEEDED',
    null,
    jsonb_build_object(
      'provider', payment_row.provider,
      'payment_id', target_payment_id,
      'provider_payment_id', target_provider_payment_id,
      'provider_charge_id', target_provider_charge_id,
      'application_fee_cents', payment_row.application_fee_cents,
      'platform_commission_cents', reservation_row.platform_commission_cents,
      'platform_tax_retained_cents', platform_tax,
      'processor_fee_recovery_cents', processor_recovery,
      'processor_fee_actual_cents', target_processor_fee_actual_cents,
      'host_proceeds_cents', host_proceeds
    )
  );

  return jsonb_build_object(
    'status', 'CONFIRMED',
    'confirmation_code', reservation_row.confirmation_code,
    'host_proceeds_cents', host_proceeds,
    'platform_commission_cents', reservation_row.platform_commission_cents,
    'platform_tax_retained_cents', platform_tax,
    'application_fee_cents', payment_row.application_fee_cents,
    'processor_fee_recovery_cents', processor_recovery,
    'processor_fee_actual_cents', target_processor_fee_actual_cents
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
  set
    status = target_status,
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
  where refunds.payment_id = payment_row.id and refunds.status = 'SUCCEEDED';

  is_full := succeeded_total >= payment_row.amount_cents;

  update public.payments payments
  set status = case when is_full then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,
      updated_at = now()
  where payments.id = payment_row.id;

  update public.reservations reservations
  set
    payment_status = case when is_full then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,
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

    insert into public.tax_ledger_entries (
      reservation_id,payment_id,refund_id,authority_id,tax_rule_id,entry_type,
      amount_cents,currency,tax_period_start,description,metadata
    )
    select
      collected.reservation_id,
      collected.payment_id,
      refund_row.id,
      collected.authority_id,
      collected.tax_rule_id,
      'REFUND_REVERSAL',
      -collected.amount_cents,
      collected.currency,
      date_trunc('month', now())::date,
      'Full guest refund tax reversal',
      jsonb_build_object(
        'provider_refund_id', refund_row.provider_refund_id,
        'original_tax_entry_id', collected.id
      )
    from public.tax_ledger_entries collected
    where collected.reservation_id = refund_row.reservation_id
      and collected.payment_id = refund_row.payment_id
      and collected.entry_type = 'COLLECTED'
    on conflict (refund_id, tax_rule_id)
      where entry_type = 'REFUND_REVERSAL' and refund_id is not null
      do nothing;
  end if;

  if not exists (
    select 1 from public.financial_ledger_entries ledger
    where ledger.refund_id = refund_row.id and ledger.entry_type = 'REFUND'
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
        'is_full_refund', is_full,
        'tax_reversed', is_full
      )
    );
  end if;

  insert into public.reservation_events (reservation_id,event_type,actor_profile_id,metadata)
  values (
    refund_row.reservation_id,
    case when is_full then 'FULL_REFUND_SUCCEEDED' else 'PARTIAL_REFUND_SUCCEEDED' end,
    null,
    jsonb_build_object(
      'refund_id', refund_row.id,
      'provider_refund_id', refund_row.provider_refund_id,
      'amount_cents', refund_row.amount_cents,
      'platform_fee_refund_cents', refund_row.platform_fee_refund_cents,
      'tax_reversed', is_full
    )
  );

  return jsonb_build_object(
    'status', 'SUCCEEDED',
    'full_refund', is_full,
    'refunded_total_cents', succeeded_total
  );
end;
$$;

revoke all on function public.record_refund_result(uuid,text,public.refund_status,text) from public, anon, authenticated;
grant execute on function public.record_refund_result(uuid,text,public.refund_status,text) to service_role;

comment on table public.tax_authorities is
  'Government/remittance destinations for marketplace-collected lodging taxes.';
comment on table public.tax_rules is
  'Effective-dated tax rates and taxable-base policies. Local rules require explicit property assignment.';
comment on table public.property_tax_profiles is
  'Finance-admin verification that the exact property address/locality tax treatment has been reviewed.';
comment on table public.tax_ledger_entries is
  'Append-only marketplace tax liability ledger, separate from Find A Place commission revenue.';
comment on table public.tax_remittances is
  'Manual filing/payment record for government tax remittances. Government payments are not auto-sent.';

commit;
