-- Find A Place Booking
-- Host-settled guest taxes.
--
-- Guest-facing taxes remain part of the booking total, but Find A Place no
-- longer retains those tax dollars in its Stripe application fee. The charge is
-- a connected-account direct charge; taxes therefore settle with the host.
-- Find A Place's application fee contains only the platform commission.

begin;

comment on column public.reservations.platform_tax_retained_cents is
  'Legacy compatibility field. New bookings set this to 0 because guest taxes settle to the host connected account.';

comment on column public.payments.platform_tax_retained_cents is
  'Legacy compatibility field. New direct-charge payments set this to 0; application_fee_cents contains Find A Place commission only.';

-- Open reservations created under the earlier tax-retention model have not
-- settled yet, so move them to host-tax settlement before payment starts.
update public.reservations reservations
set
  platform_tax_retained_cents = 0,
  updated_at = now()
where reservations.status in ('HOLD','PAYMENT_PENDING','PAYMENT_FAILED')
  and reservations.payment_status <> 'SUCCEEDED';

-- Unstarted payment rows can also be safely normalized. Any Stripe
-- PaymentIntent that was already created with the old fee model is deliberately
-- not rewritten; the claim function below rejects it and requires a fresh
-- reservation rather than silently changing a live processor object.
update public.payments payments
set
  application_fee_cents = reservations.platform_commission_cents,
  platform_tax_retained_cents = 0,
  host_proceeds_cents = greatest(
    payments.amount_cents - reservations.platform_commission_cents,
    0
  ),
  updated_at = now()
from public.reservations reservations
where payments.reservation_id = reservations.id
  and payments.provider = 'STRIPE'
  and payments.provider_payment_id is null
  and payments.status = 'NOT_STARTED';

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
      'calculation_engine', 'FAP_TAX_CALC_V2_HOST_SETTLED',
      'payment_environment', expected_environment,
      'settlement', 'HOST_CONNECTED_ACCOUNT',
      'platform_tax_retained_cents', 0,
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
    platform_tax_retained_cents = 0,
    updated_at = now()
  where reservations.id = target_reservation_id
  returning * into reservation_row;

  insert into public.reservation_events (
    reservation_id,event_type,actor_profile_id,metadata
  ) values (
    target_reservation_id,
    'TAX_CALCULATED',
    null,
    jsonb_build_object(
      'calculation_id', calculation_id,
      'tax_total_cents', tax_total,
      'guest_total_cents', reservation_row.guest_total_cents,
      'platform_tax_retained_cents', 0,
      'tax_settlement', 'HOST_CONNECTED_ACCOUNT',
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
    'platform_tax_retained_cents', 0,
    'host_tax_cents', tax_total,
    'tax_settlement', 'HOST_CONNECTED_ACCOUNT',
    'tax_snapshot', reservation_row.tax_snapshot
  );
end;
$$;

revoke all on function public.calculate_reservation_lodging_tax(
  uuid,public.payment_environment
) from public, anon, authenticated;
grant execute on function public.calculate_reservation_lodging_tax(
  uuid,public.payment_environment
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

  if reservation_row.hold_expires_at is not null
     and reservation_row.hold_expires_at <= now() then
    raise exception 'Reservation hold expired';
  end if;

  if expected_environment = 'LIVE'
     and reservation_row.tax_status <> 'CALCULATED' then
    raise exception 'Live checkout requires a completed lodging-tax calculation';
  end if;

  if coalesce(processor_fee_recovery_cents, 0) <> 0 then
    raise exception 'Direct-charge payments do not recover Stripe processing fees through the platform';
  end if;

  -- Guest taxes are included in guest_total_cents but settle with the host.
  -- Find A Place application fee is commission only.
  application_fee := least(
    greatest(reservation_row.guest_total_cents - 1, 0),
    greatest(reservation_row.platform_commission_cents, 0)
  );

  select accounts.* into account_row
  from public.payment_accounts accounts
  where accounts.id = reservation_row.payment_account_id
  for share;

  if not found
     or account_row.provider <> 'STRIPE'
     or account_row.environment <> expected_environment
     or account_row.status <> 'READY'
     or not account_row.charges_enabled
     or account_row.provider_account_id is null then
    raise exception 'Stripe merchant account is not ready for this environment';
  end if;

  if coalesce(account_row.metadata ->> 'account_configuration', '') <> 'merchant'
     or coalesce(account_row.metadata ->> 'charge_model', '') <> 'DIRECT' then
    raise exception 'Stripe account is not configured for direct charges';
  end if;

  if reservation_row.provider_account_ref is distinct from account_row.provider_account_id then
    raise exception 'Reservation Stripe merchant no longer matches its snapshot';
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
    if payment_row.application_fee_cents <> application_fee
       or coalesce(payment_row.platform_tax_retained_cents, 0) <> 0
       or coalesce(payment_row.processor_fee_host_share_cents, 0) <> 0 then
      raise exception 'Existing Stripe payment attempt uses the legacy settlement model; start a fresh reservation';
    end if;

    return to_jsonb(payment_row)
      || jsonb_build_object('connected_account_id', account_row.provider_account_id);
  end if;

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
    0,
    0,
    0,
    0,
    greatest(reservation_row.guest_total_cents - application_fee, 0),
    reservation_row.currency
  ) returning * into payment_row;

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

-- Preserve the paid-reservation calendar guard from migration 058 while
-- changing settlement so taxes remain with the host.
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
  processor_fee bigint;
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
    return jsonb_build_object(
      'status', 'CONFIRMED',
      'confirmation_code', reservation_row.confirmation_code
    );
  end if;

  if reservation_row.status not in ('HOLD','PAYMENT_PENDING','PAYMENT_FAILED') then
    raise exception 'Reservation is no longer confirmable';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(reservation_row.unit_id::text, 0)
  );

  if not exists (
    select 1 from public.availability_blocks blocks
    where blocks.reservation_id = target_reservation_id
      and blocks.unit_id = reservation_row.unit_id
      and blocks.state = 'ACTIVE'
      and blocks.block_type = 'INTERNAL_HOLD'
      and blocks.start_date = reservation_row.check_in
      and blocks.end_date = reservation_row.check_out
  ) then
    raise exception 'Paid reservation has no active matching calendar hold; manual payment reconciliation required';
  end if;

  if exists (
    select 1 from public.availability_blocks blocks
    where blocks.unit_id = reservation_row.unit_id
      and blocks.state = 'ACTIVE'
      and blocks.reservation_id is distinct from target_reservation_id
      and (blocks.expires_at is null or blocks.expires_at > now())
      and blocks.start_date < reservation_row.check_out
      and blocks.end_date > reservation_row.check_in
  ) then
    raise exception 'Paid reservation overlaps an existing calendar block; manual payment reconciliation required';
  end if;

  if payment_row.application_fee_cents
       <> greatest(reservation_row.platform_commission_cents, 0)
     or coalesce(payment_row.platform_tax_retained_cents, 0) <> 0 then
    raise exception 'Payment uses a legacy tax-retention settlement model; manual payment reconciliation required';
  end if;

  processor_fee := greatest(
    coalesce(target_processor_fee_actual_cents, 0),
    0
  );

  host_proceeds := greatest(
    payment_row.amount_cents
      - payment_row.application_fee_cents
      - processor_fee,
    0
  );

  update public.payments payments
  set
    status = 'SUCCEEDED',
    provider_payment_id = coalesce(
      target_provider_payment_id,
      payments.provider_payment_id
    ),
    provider_charge_id = coalesce(
      target_provider_charge_id,
      payments.provider_charge_id
    ),
    platform_tax_retained_cents = 0,
    processor_fee_actual_cents = processor_fee,
    processor_fee_host_share_cents = processor_fee,
    processor_fee_platform_share_cents = 0,
    host_proceeds_cents = host_proceeds,
    failure_code = null,
    failure_message = null,
    updated_at = now()
  where payments.id = target_payment_id;

  update public.reservations reservations
  set
    status = 'CONFIRMED',
    payment_status = 'SUCCEEDED',
    platform_tax_retained_cents = 0,
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
      'provider_payment_id', target_provider_payment_id,
      'charge_model', 'DIRECT'
    ),
    updated_at = now()
  where blocks.reservation_id = target_reservation_id
    and blocks.state = 'ACTIVE'
    and blocks.block_type = 'INTERNAL_HOLD';

  update public.promotion_reservations promo_reservations
  set status = 'CONSUMED', consumed_at = now()
  where promo_reservations.reservation_id = target_reservation_id
    and promo_reservations.status = 'RESERVED'
  returning promo_reservations.promotion_code_id
  into consumed_promotion_code_id;

  if consumed_promotion_code_id is not null then
    update public.promotion_codes promotions
    set
      redemption_count = promotions.redemption_count + 1,
      updated_at = now()
    where promotions.id = consumed_promotion_code_id;
  end if;

  if not exists (
    select 1
    from public.financial_ledger_entries ledger
    where ledger.payment_id = target_payment_id
      and ledger.entry_type = 'GUEST_CHARGE'
  ) then
    insert into public.financial_ledger_entries (
      reservation_id,payment_id,entry_group_id,entry_type,amount_cents,
      currency,description,metadata
    ) values
      (
        target_reservation_id,target_payment_id,ledger_group,'GUEST_CHARGE',
        payment_row.amount_cents,reservation_row.currency,
        'Guest charge processed directly on the host Stripe account',
        jsonb_build_object(
          'provider', payment_row.provider,
          'provider_payment_id', target_provider_payment_id,
          'charge_model', 'DIRECT',
          'provider_account_ref', reservation_row.provider_account_ref,
          'guest_tax_cents', reservation_row.tax_total_cents,
          'tax_settlement', 'HOST_CONNECTED_ACCOUNT'
        )
      ),
      (
        target_reservation_id,target_payment_id,ledger_group,'HOST_PROCEEDS',
        -host_proceeds,reservation_row.currency,
        'Host net proceeds after Find A Place commission and Stripe processing',
        jsonb_build_object(
          'provider_account_ref', reservation_row.provider_account_ref,
          'charge_model', 'DIRECT',
          'guest_tax_cents', reservation_row.tax_total_cents,
          'tax_settlement', 'HOST_CONNECTED_ACCOUNT'
        )
      ),
      (
        target_reservation_id,target_payment_id,ledger_group,'PLATFORM_COMMISSION',
        -reservation_row.platform_commission_cents,reservation_row.currency,
        'Find A Place platform commission collected as the application fee',
        jsonb_build_object(
          'commission_rate_bps', reservation_row.commission_rate_bps,
          'application_fee_contains_tax', false
        )
      );

    if processor_fee > 0 then
      insert into public.financial_ledger_entries (
        reservation_id,payment_id,entry_group_id,entry_type,amount_cents,
        currency,description,metadata
      ) values (
        target_reservation_id,target_payment_id,ledger_group,'PROCESSOR_FEE',
        -processor_fee,reservation_row.currency,
        'Stripe processing fee charged to the connected host account',
        jsonb_build_object(
          'host_share_cents', processor_fee,
          'platform_share_cents', 0,
          'charge_model', 'DIRECT'
        )
      );
    end if;
  end if;

  -- Intentionally do not create platform COLLECTED tax-ledger entries.
  -- Find A Place calculates guest taxes, but the tax money remains in the
  -- host-connected-account charge.

  insert into public.reservation_events (
    reservation_id,event_type,actor_profile_id,metadata
  ) values (
    target_reservation_id,
    'PAYMENT_SUCCEEDED',
    null,
    jsonb_build_object(
      'provider', payment_row.provider,
      'payment_id', target_payment_id,
      'provider_payment_id', target_provider_payment_id,
      'provider_charge_id', target_provider_charge_id,
      'provider_account_ref', reservation_row.provider_account_ref,
      'charge_model', 'DIRECT',
      'application_fee_cents', payment_row.application_fee_cents,
      'platform_commission_cents', reservation_row.platform_commission_cents,
      'guest_tax_cents', reservation_row.tax_total_cents,
      'platform_tax_retained_cents', 0,
      'tax_settlement', 'HOST_CONNECTED_ACCOUNT',
      'processor_fee_recovery_cents', 0,
      'processor_fee_actual_cents', processor_fee,
      'processor_fee_host_share_cents', processor_fee,
      'processor_fee_platform_share_cents', 0,
      'host_proceeds_cents', host_proceeds
    )
  );

  return jsonb_build_object(
    'status', 'CONFIRMED',
    'confirmation_code', reservation_row.confirmation_code,
    'charge_model', 'DIRECT',
    'host_proceeds_cents', host_proceeds,
    'platform_commission_cents', reservation_row.platform_commission_cents,
    'guest_tax_cents', reservation_row.tax_total_cents,
    'platform_tax_retained_cents', 0,
    'tax_settlement', 'HOST_CONNECTED_ACCOUNT',
    'application_fee_cents', payment_row.application_fee_cents,
    'processor_fee_recovery_cents', 0,
    'processor_fee_actual_cents', processor_fee
  );
end;
$$;

revoke all on function public.confirm_reservation_payment(
  uuid,uuid,text,text,bigint
) from public, anon, authenticated;
grant execute on function public.confirm_reservation_payment(
  uuid,uuid,text,text,bigint
) to service_role;

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
  application_fee_refunded bigint;
  remaining_amount bigint;
  remaining_application_fee bigint;
  final_amount bigint;
  application_fee_refund bigint := 0;
  refundable_commission bigint := 0;
  commission_refund_eligible boolean := false;
  days_before_check_in integer := 0;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select reservations.*
  into reservation_row
  from public.reservations reservations
  where reservations.id = target_reservation_id
  for update;

  if not found then
    raise exception 'Reservation not found';
  end if;

  select payments.*
  into payment_row
  from public.payments payments
  where payments.reservation_id = target_reservation_id
    and payments.provider = 'STRIPE'
    and payments.status in (
      'SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED','DISPUTED'
    )
  order by payments.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No refundable Stripe payment found';
  end if;

  select
    coalesce(sum(refunds.amount_cents), 0),
    coalesce(sum(refunds.platform_fee_refund_cents), 0)
  into refunded_total, application_fee_refunded
  from public.refunds refunds
  where refunds.payment_id = payment_row.id
    and refunds.status in ('PENDING','SUCCEEDED');

  remaining_amount :=
    greatest(payment_row.amount_cents - refunded_total, 0);

  remaining_application_fee :=
    greatest(
      payment_row.application_fee_cents - application_fee_refunded,
      0
    );

  if remaining_amount <= 0 then
    raise exception 'Payment is already fully refunded';
  end if;

  days_before_check_in := reservation_row.check_in - current_date;
  commission_refund_eligible := days_before_check_in >= 14;

  if requested_full_refund then
    final_amount := remaining_amount;

    refundable_commission :=
      case
        when commission_refund_eligible then
          greatest(
            coalesce(reservation_row.platform_commission_cents, 0),
            0
          )
        else 0
      end;

    application_fee_refund :=
      greatest(
        least(
          refundable_commission - application_fee_refunded,
          remaining_application_fee
        ),
        0
      );
  else
    final_amount := requested_amount_cents;
    application_fee_refund := 0;

    if final_amount is null
       or final_amount <= 0
       or final_amount >= remaining_amount then
      raise exception
        'Partial refund must be greater than zero and less than the remaining charge';
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
    reason,
    application_fee_refund_status
  ) values (
    refund_id,
    reservation_row.id,
    payment_row.id,
    payment_row.payment_environment,
    'PENDING',
    'fap-refund-' || refund_id::text,
    final_amount,
    application_fee_refund,
    payment_row.currency,
    left(
      nullif(trim(coalesce(requested_reason, '')), ''),
      500
    ),
    case
      when application_fee_refund > 0 then 'PENDING'
      else 'NOT_REQUIRED'
    end
  );

  return jsonb_build_object(
    'refund_id', refund_id,
    'payment_id', payment_row.id,
    'provider_payment_id', payment_row.provider_payment_id,
    'provider_charge_id', payment_row.provider_charge_id,
    'amount_cents', final_amount,
    'platform_fee_refund_cents', application_fee_refund,
    'platform_tax_refund_cents', 0,
    'platform_commission_refund_cents', application_fee_refund,
    'commission_refund_eligible', commission_refund_eligible,
    'days_before_check_in', days_before_check_in,
    'is_full_refund', requested_full_refund,
    'currency', payment_row.currency,
    'payment_environment', payment_row.payment_environment
  );
end;
$$;

revoke all on function public.create_refund_request(
  uuid,bigint,boolean,text
) from public, anon, authenticated;
grant execute on function public.create_refund_request(
  uuid,bigint,boolean,text
) to service_role;

-- Preserve refund-status monotonicity from migration 059, but platform tax
-- reversal accounting is no longer created for new bookings because taxes
-- never enter Find A Place's application fee or platform tax ledger.
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

  if refund_row.status = 'SUCCEEDED' then
    return jsonb_build_object(
      'status', 'SUCCEEDED',
      'duplicate', true
    );
  end if;

  update public.refunds refunds
  set
    status = target_status,
    provider_refund_id = coalesce(
      target_provider_refund_id,
      refunds.provider_refund_id
    ),
    reason = case
      when target_status = 'FAILED'
       and target_failure_message is not null
        then left(
          coalesce(refunds.reason || ' · ', '')
            || target_failure_message,
          500
        )
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
  set
    status = case
      when is_full then 'REFUNDED'
      else 'PARTIALLY_REFUNDED'
    end,
    updated_at = now()
  where payments.id = payment_row.id;

  update public.reservations reservations
  set
    payment_status = case
      when is_full then 'REFUNDED'
      else 'PARTIALLY_REFUNDED'
    end,
    status = case
      when is_full then 'CANCELLED'
      else reservations.status
    end,
    cancelled_at = case
      when is_full
        then coalesce(reservations.cancelled_at, now())
      else reservations.cancelled_at
    end,
    updated_at = now()
  where reservations.id = refund_row.reservation_id;

  if is_full then
    update public.availability_blocks blocks
    set state = 'CANCELLED', updated_at = now()
    where blocks.reservation_id = refund_row.reservation_id
      and blocks.state = 'ACTIVE'
      and blocks.block_type in (
        'INTERNAL_HOLD','INTERNAL_RESERVATION'
      );
  end if;

  if not exists (
    select 1
    from public.financial_ledger_entries ledger
    where ledger.refund_id = refund_row.id
      and ledger.entry_type = 'REFUND'
  ) then
    insert into public.financial_ledger_entries (
      reservation_id,payment_id,refund_id,entry_type,amount_cents,
      currency,description,metadata
    ) values (
      refund_row.reservation_id,
      refund_row.payment_id,
      refund_row.id,
      'REFUND',
      -refund_row.amount_cents,
      refund_row.currency,
      case
        when is_full then 'Full guest refund from host connected charge'
        else 'Host-funded partial guest refund'
      end,
      jsonb_build_object(
        'provider_refund_id', refund_row.provider_refund_id,
        'platform_fee_refund_cents',
          refund_row.platform_fee_refund_cents,
        'is_full_refund', is_full,
        'guest_tax_refunded_with_host_charge', is_full,
        'platform_tax_reversal_required', false
      )
    );
  end if;

  insert into public.reservation_events (
    reservation_id,event_type,actor_profile_id,metadata
  ) values (
    refund_row.reservation_id,
    case
      when is_full then 'FULL_REFUND_SUCCEEDED'
      else 'PARTIAL_REFUND_SUCCEEDED'
    end,
    null,
    jsonb_build_object(
      'refund_id', refund_row.id,
      'provider_refund_id', refund_row.provider_refund_id,
      'amount_cents', refund_row.amount_cents,
      'platform_fee_refund_cents',
        refund_row.platform_fee_refund_cents,
      'guest_tax_refunded_with_host_charge', is_full,
      'platform_tax_reversal_required', false
    )
  );

  return jsonb_build_object(
    'status', 'SUCCEEDED',
    'full_refund', is_full,
    'refunded_total_cents', succeeded_total
  );
end;
$$;

revoke all on function public.record_refund_result(
  uuid,text,public.refund_status,text
) from public, anon, authenticated;
grant execute on function public.record_refund_result(
  uuid,text,public.refund_status,text
) to service_role;

create or replace function public.host_tax_settlement_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'host-tax-settlement-060-v1'::text;
$$;

revoke all on function public.host_tax_settlement_version() from public;
grant execute on function public.host_tax_settlement_version()
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
