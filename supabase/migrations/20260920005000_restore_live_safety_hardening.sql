-- Find A Place Booking
-- Repair/replay of live-safety hardening 046 under migration 050.
-- The pushed 046 file was accidentally blank, so this migration safely replays the idempotent hardening body.
-- Live-safety hardening 046.
--
-- Goals:
--   * Keep TEST/LIVE payout records strictly separated.
--   * Make reservation payout claiming atomic and recoverable.
--   * Snapshot exact cancellation/payout timestamps using the property timezone.
--   * Save tax verification + local assignments atomically.
--   * Fail closed if required Arkansas statewide tax rules are missing from a LIVE snapshot.
--
-- This migration does NOT change booking totals, commission math, tax rates,
-- Stripe destination-charge math, or the proven PaymentIntent flow.

begin;

-- ---------------------------------------------------------------------------
-- 1. Property timezone for policy cutoffs.
-- ---------------------------------------------------------------------------
alter table public.properties
  add column if not exists time_zone text not null default 'America/Chicago';

comment on column public.properties.time_zone is
  'IANA timezone used for local booking-policy deadlines. Arkansas/Missouri default to America/Chicago; update explicitly for properties outside that zone.';


create or replace function public.validate_property_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if nullif(trim(coalesce(new.time_zone, '')), '') is null
     or not exists (
       select 1
       from pg_catalog.pg_timezone_names zones
       where zones.name = new.time_zone
     ) then
    raise exception 'Property time_zone must be a valid IANA timezone';
  end if;
  return new;
end;
$$;

drop trigger if exists properties_validate_time_zone on public.properties;
create trigger properties_validate_time_zone
before insert or update of time_zone on public.properties
for each row execute function public.validate_property_time_zone();

-- ---------------------------------------------------------------------------
-- 2. Payout environment + exact policy timestamps.
-- ---------------------------------------------------------------------------
alter table public.reservation_payouts
  add column if not exists payment_environment public.payment_environment,
  add column if not exists cancellation_cutoff_at timestamptz,
  add column if not exists payout_eligible_at timestamptz;

update public.reservation_payouts payouts
set payment_environment = payments.payment_environment
from public.payments payments
where payments.id = payouts.payment_id
  and payouts.payment_environment is distinct from payments.payment_environment;

update public.reservation_payouts payouts
set cancellation_cutoff_at = ((reservations.check_in - 14)::timestamp at time zone properties.time_zone),
    payout_eligible_at = ((reservations.check_in - 13)::timestamp at time zone properties.time_zone)
from public.reservations reservations
join public.properties properties on properties.id = reservations.property_id
where reservations.id = payouts.reservation_id
  and (payouts.cancellation_cutoff_at is null or payouts.payout_eligible_at is null);

alter table public.reservation_payouts
  alter column payment_environment set not null,
  alter column cancellation_cutoff_at set not null,
  alter column payout_eligible_at set not null;

alter table public.reservation_payouts
  drop constraint if exists reservation_payouts_status_check;

alter table public.reservation_payouts
  add constraint reservation_payouts_status_check check (status in (
    'SCHEDULED',
    'WAITING_FUNDS',
    'WAITING_REFUND',
    'RETRY',
    'CREATING',
    'PENDING',
    'IN_TRANSIT',
    'PAID',
    'FAILED',
    'CANCELLED'
  ));

drop index if exists public.reservation_payouts_due_idx;
create index if not exists reservation_payouts_due_environment_idx
  on public.reservation_payouts(payment_environment, status, payout_eligible_at, updated_at);

drop index if exists public.reservation_payouts_provider_payout_unique;
create unique index if not exists reservation_payouts_provider_payout_environment_unique
  on public.reservation_payouts(provider_payout_id, payment_environment)
  where provider_payout_id is not null;

create index if not exists reservation_payouts_provider_environment_idx
  on public.reservation_payouts(payment_environment, connected_account_id, provider_payout_id)
  where provider_payout_id is not null;

comment on column public.reservation_payouts.payment_environment is
  'Stripe TEST/LIVE environment inherited from the canonical payment record.';
comment on column public.reservation_payouts.cancellation_cutoff_at is
  'Exact instant when ordinary self-service cancellation closes, snapshotted from the property timezone.';
comment on column public.reservation_payouts.payout_eligible_at is
  'Exact instant when the host payout may be claimed, snapshotted from the property timezone.';

-- Keep the payout row synchronized from a successful canonical payment. The
-- trigger still performs accounting only; it never initiates a Stripe payout.
create or replace function public.sync_reservation_payout_from_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_row record;
  successful_refund_cents bigint := 0;
  adjusted_proceeds bigint := 0;
  property_time_zone text := 'America/Chicago';
begin
  if new.status::text <> 'SUCCEEDED'
     or new.host_proceeds_cents is null
     or new.host_proceeds_cents < 0 then
    return new;
  end if;

  select
    reservations.id,
    reservations.organization_id,
    reservations.property_id,
    reservations.confirmation_code,
    reservations.check_in,
    reservations.provider_account_ref,
    properties.time_zone
  into reservation_row
  from public.reservations reservations
  join public.properties properties on properties.id = reservations.property_id
  where reservations.id = new.reservation_id;

  if not found or nullif(trim(coalesce(reservation_row.provider_account_ref, '')), '') is null then
    return new;
  end if;

  property_time_zone := coalesce(nullif(trim(reservation_row.time_zone), ''), 'America/Chicago');

  select coalesce(sum(refunds.amount_cents), 0)::bigint
  into successful_refund_cents
  from public.refunds refunds
  where refunds.reservation_id = new.reservation_id
    and refunds.payment_environment = new.payment_environment
    and refunds.status::text = 'SUCCEEDED';

  adjusted_proceeds := greatest(0, new.host_proceeds_cents - successful_refund_cents);

  insert into public.reservation_payouts (
    reservation_id,
    payment_id,
    organization_id,
    property_id,
    confirmation_code,
    connected_account_id,
    amount_cents,
    currency,
    payment_environment,
    cancellation_cutoff_date,
    payout_eligible_date,
    cancellation_cutoff_at,
    payout_eligible_at,
    status,
    metadata
  ) values (
    reservation_row.id,
    new.id,
    reservation_row.organization_id,
    reservation_row.property_id,
    reservation_row.confirmation_code,
    reservation_row.provider_account_ref,
    adjusted_proceeds,
    upper(coalesce(new.currency, 'USD')),
    new.payment_environment,
    reservation_row.check_in - 14,
    reservation_row.check_in - 13,
    ((reservation_row.check_in - 14)::timestamp at time zone property_time_zone),
    ((reservation_row.check_in - 13)::timestamp at time zone property_time_zone),
    case when adjusted_proceeds = 0 and successful_refund_cents > 0 then 'CANCELLED' else 'SCHEDULED' end,
    jsonb_build_object(
      'source', 'payment_succeeded',
      'policy', 'CHECKIN_MINUS_13_DAYS',
      'time_zone', property_time_zone
    )
  )
  on conflict (reservation_id) do update
    set payment_id = excluded.payment_id,
        organization_id = excluded.organization_id,
        property_id = excluded.property_id,
        confirmation_code = excluded.confirmation_code,
        connected_account_id = excluded.connected_account_id,
        currency = excluded.currency,
        payment_environment = excluded.payment_environment,
        cancellation_cutoff_date = excluded.cancellation_cutoff_date,
        payout_eligible_date = excluded.payout_eligible_date,
        cancellation_cutoff_at = excluded.cancellation_cutoff_at,
        payout_eligible_at = excluded.payout_eligible_at,
        amount_cents = case
          when public.reservation_payouts.status in (
            'SCHEDULED','WAITING_FUNDS','WAITING_REFUND','RETRY','CREATING'
          ) then excluded.amount_cents
          else public.reservation_payouts.amount_cents
        end,
        updated_at = now();

  return new;
end;
$$;

-- Database guard: a payout row must always match the environment and
-- reservation of its canonical payment record.
create or replace function public.validate_reservation_payout_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row record;
begin
  select payments.reservation_id, payments.payment_environment
  into payment_row
  from public.payments payments
  where payments.id = new.payment_id;

  if not found then
    raise exception 'Payout payment record not found';
  end if;

  if payment_row.reservation_id <> new.reservation_id then
    raise exception 'Payout payment does not belong to this reservation';
  end if;

  if payment_row.payment_environment <> new.payment_environment then
    raise exception 'Payout payment environment does not match';
  end if;

  return new;
end;
$$;

drop trigger if exists reservation_payouts_validate_payment on public.reservation_payouts;
create trigger reservation_payouts_validate_payment
before insert or update of payment_id, reservation_id, payment_environment
on public.reservation_payouts
for each row execute function public.validate_reservation_payout_payment();

-- A successful refund can still adjust a scheduled payout, but once a payout
-- has been atomically claimed (CREATING) or actually created at Stripe we stop
-- mutating the bank-payout amount underneath the in-flight operation.
create or replace function public.sync_reservation_payout_from_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row record;
  payout_row public.reservation_payouts%rowtype;
  successful_refund_cents bigint := 0;
  adjusted_proceeds bigint := 0;
begin
  if new.status::text <> 'SUCCEEDED' then
    return new;
  end if;

  select payments.id, payments.amount_cents, payments.host_proceeds_cents, payments.payment_environment
  into payment_row
  from public.payments payments
  where payments.id = new.payment_id;

  if not found or payment_row.host_proceeds_cents is null then
    return new;
  end if;

  select payouts.*
  into payout_row
  from public.reservation_payouts payouts
  where payouts.reservation_id = new.reservation_id
    and payouts.payment_environment = payment_row.payment_environment
  for update;

  if not found then
    return new;
  end if;

  if payout_row.status in ('CREATING','PENDING','IN_TRANSIT','PAID') then
    return new;
  end if;

  select coalesce(sum(refunds.amount_cents), 0)::bigint
  into successful_refund_cents
  from public.refunds refunds
  where refunds.reservation_id = new.reservation_id
    and refunds.payment_environment = payment_row.payment_environment
    and refunds.status::text = 'SUCCEEDED';

  adjusted_proceeds := greatest(
    0,
    payment_row.host_proceeds_cents - successful_refund_cents
  );

  update public.reservation_payouts payouts
  set amount_cents = adjusted_proceeds,
      status = case
        when adjusted_proceeds = 0 then 'CANCELLED'
        else 'SCHEDULED'
      end,
      last_error = null,
      metadata = coalesce(payouts.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'last_refund_adjustment_id', new.id,
          'successful_refund_cents', successful_refund_cents,
          'last_refund_adjustment_at', now()
        )
  where payouts.id = payout_row.id;

  return new;
end;
$$;

-- Atomically claim a bounded batch of due payouts. SKIP LOCKED prevents two
-- overlapping cron invocations from initiating the same bank payout. A stale
-- CREATING row can be reclaimed after 15 minutes; the Stripe idempotency key
-- remains tied to the payout record ID, so an uncertain network result remains
-- safe to retry.
create or replace function public.claim_due_reservation_payouts(
  expected_environment public.payment_environment,
  max_rows integer default 25
)
returns setof public.reservation_payouts
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if max_rows is null or max_rows < 1 or max_rows > 50 then
    raise exception 'Payout claim batch must be between 1 and 50 rows';
  end if;

  return query
  with candidates as (
    select payouts.id
    from public.reservation_payouts payouts
    where payouts.payment_environment = expected_environment
      and payouts.amount_cents > 0
      and payouts.payout_eligible_at <= now()
      and (
        payouts.status in ('SCHEDULED','WAITING_FUNDS','WAITING_REFUND','RETRY')
        or (
          payouts.status = 'CREATING'
          and payouts.last_attempt_at < now() - interval '15 minutes'
        )
      )
    order by payouts.payout_eligible_at, payouts.created_at
    for update skip locked
    limit max_rows
  )
  update public.reservation_payouts payouts
  set status = 'CREATING',
      attempt_count = payouts.attempt_count + 1,
      last_attempt_at = now(),
      last_error = null,
      updated_at = now()
  from candidates
  where payouts.id = candidates.id
  returning payouts.*;
end;
$$;

revoke all on function public.claim_due_reservation_payouts(public.payment_environment,integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_reservation_payouts(public.payment_environment,integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Atomic tax-profile + local-rule replacement.
-- ---------------------------------------------------------------------------
create or replace function public.service_save_property_tax_profile(
  target_property_id uuid,
  actor_profile_id uuid,
  county_name_value text,
  locality_name_value text,
  verification_notes_value text,
  verified_value boolean,
  selected_rule_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  now_value timestamptz := now();
  requested_count integer := 0;
  valid_count integer := 0;
  property_city text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select properties.city into property_city
  from public.properties properties
  where properties.id = target_property_id;
  if not found then
    raise exception 'Property not found';
  end if;

  if actor_profile_id is null then
    raise exception 'Admin actor is required';
  end if;

  select count(*) into requested_count
  from (select distinct unnest(coalesce(selected_rule_ids, '{}'::uuid[])) as id) requested;

  select count(*) into valid_count
  from (
    select distinct requested.id
    from (select unnest(coalesce(selected_rule_ids, '{}'::uuid[])) as id) requested
    join public.tax_rules rules on rules.id = requested.id
    where rules.assignment_required
      and rules.is_active
  ) valid;

  if requested_count <> valid_count then
    raise exception 'One or more selected local tax rules are invalid or inactive';
  end if;

  if verified_value
     and upper(coalesce(nullif(trim(locality_name_value), ''), nullif(trim(property_city), ''), '')) = 'HOT SPRINGS' then
    if not exists (
      select 1 from public.tax_rules rules
      where rules.code = 'HOT_SPRINGS_GARLAND_LOCAL_SALES_2026'
        and rules.id = any(coalesce(selected_rule_ids, '{}'::uuid[]))
        and rules.is_active
    ) then
      raise exception 'Verified Hot Springs properties require the Hot Springs + Garland County local sales-tax rule';
    end if;

    if not exists (
      select 1 from public.tax_rules rules
      where rules.code = 'HOT_SPRINGS_AP_LODGING_2026'
        and rules.id = any(coalesce(selected_rule_ids, '{}'::uuid[]))
        and rules.is_active
    ) then
      raise exception 'Verified Hot Springs properties require the Hot Springs A&P lodging-tax rule';
    end if;
  end if;

  insert into public.property_tax_profiles (
    property_id,
    verification_status,
    county_name,
    locality_name,
    verification_notes,
    verified_by,
    verified_at,
    last_rate_review_at,
    updated_at
  ) values (
    target_property_id,
    case when verified_value then 'VERIFIED' else 'PENDING' end,
    nullif(trim(coalesce(county_name_value, '')), ''),
    nullif(trim(coalesce(locality_name_value, '')), ''),
    nullif(trim(coalesce(verification_notes_value, '')), ''),
    case when verified_value then actor_profile_id else null end,
    case when verified_value then now_value else null end,
    case when verified_value then now_value else null end,
    now_value
  )
  on conflict (property_id) do update
    set verification_status = excluded.verification_status,
        county_name = excluded.county_name,
        locality_name = excluded.locality_name,
        verification_notes = excluded.verification_notes,
        verified_by = excluded.verified_by,
        verified_at = excluded.verified_at,
        last_rate_review_at = excluded.last_rate_review_at,
        updated_at = excluded.updated_at;

  delete from public.property_tax_rule_assignments assignments
  where assignments.property_id = target_property_id;

  insert into public.property_tax_rule_assignments (
    property_id,
    tax_rule_id,
    verified_by,
    verified_at
  )
  select
    target_property_id,
    rules.id,
    actor_profile_id,
    now_value
  from public.tax_rules rules
  join (
    select distinct unnest(coalesce(selected_rule_ids, '{}'::uuid[])) as id
  ) requested on requested.id = rules.id
  where rules.assignment_required
    and rules.is_active;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    actor_profile_id,
    'tax.property_profile.saved',
    'property',
    target_property_id,
    'Finance admin saved the verified property tax configuration atomically.',
    jsonb_build_object(
      'verified', verified_value,
      'selected_rule_count', requested_count,
      'county_name', nullif(trim(coalesce(county_name_value, '')), ''),
      'locality_name', nullif(trim(coalesce(locality_name_value, '')), '')
    )
  );
end;
$$;

revoke all on function public.service_save_property_tax_profile(uuid,uuid,text,text,text,boolean,uuid[])
  from public, anon, authenticated;
grant execute on function public.service_save_property_tax_profile(uuid,uuid,text,text,text,boolean,uuid[])
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. LIVE Arkansas tax snapshots must include the exact required statewide
--    rules, not merely any two matching tax rules.
-- ---------------------------------------------------------------------------
create or replace function public.validate_live_required_tax_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  property_region text;
  property_city text;
  verified_locality text;
  rules_json jsonb;
begin
  if new.payment_environment <> 'LIVE'::public.payment_environment
     or new.tax_status::text <> 'CALCULATED' then
    return new;
  end if;

  select
    upper(coalesce(properties.region_code, '')),
    upper(coalesce(properties.city, '')),
    upper(coalesce(profiles.locality_name, ''))
  into property_region, property_city, verified_locality
  from public.properties properties
  left join public.property_tax_profiles profiles on profiles.property_id = properties.id
  where properties.id = new.property_id;

  if property_region <> 'AR' then
    return new;
  end if;

  rules_json := coalesce(new.tax_snapshot -> 'rules', '[]'::jsonb);

  if not exists (
    select 1
    from jsonb_array_elements(rules_json) rule
    where rule ->> 'rule_code' = 'AR_STATE_SALES_2026'
  ) then
    raise exception 'Arkansas LIVE checkout requires AR_STATE_SALES_2026 in the tax snapshot';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(rules_json) rule
    where rule ->> 'rule_code' = 'AR_TOURISM_LODGING_2026'
  ) then
    raise exception 'Arkansas LIVE checkout requires AR_TOURISM_LODGING_2026 in the tax snapshot';
  end if;

  if coalesce(nullif(verified_locality, ''), property_city) = 'HOT SPRINGS' then
    if not exists (
      select 1
      from jsonb_array_elements(rules_json) rule
      where rule ->> 'rule_code' = 'HOT_SPRINGS_GARLAND_LOCAL_SALES_2026'
    ) then
      raise exception 'Hot Springs LIVE checkout requires HOT_SPRINGS_GARLAND_LOCAL_SALES_2026 in the tax snapshot';
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(rules_json) rule
      where rule ->> 'rule_code' = 'HOT_SPRINGS_AP_LODGING_2026'
    ) then
      raise exception 'Hot Springs LIVE checkout requires HOT_SPRINGS_AP_LODGING_2026 in the tax snapshot';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_validate_live_required_tax_snapshot on public.reservations;
create trigger reservations_validate_live_required_tax_snapshot
before insert or update of tax_status, tax_snapshot, payment_environment, property_id
on public.reservations
for each row execute function public.validate_live_required_tax_snapshot();

-- ---------------------------------------------------------------------------
-- 5. Health marker.
-- ---------------------------------------------------------------------------
create or replace function public.live_safety_hardening_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'live-safety-hardening-046-v1'::text;
$$;

revoke all on function public.live_safety_hardening_version() from public;
grant execute on function public.live_safety_hardening_version() to anon, authenticated;

comment on function public.live_safety_hardening_version() is
  'Marker for payout environment, policy-timezone, atomic tax-profile and exact LIVE Arkansas tax-rule hardening.';

create or replace function public.pilot_readiness_cleanup_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'pilot-readiness-cleanup-050-v1'::text;
$$;

revoke all on function public.pilot_readiness_cleanup_version() from public;
grant execute on function public.pilot_readiness_cleanup_version() to anon, authenticated;

comment on function public.pilot_readiness_cleanup_version() is
  'Marker that the blank-046 repository repair and pilot-readiness cleanup migration has been applied.';

notify pgrst, 'reload schema';

commit;
