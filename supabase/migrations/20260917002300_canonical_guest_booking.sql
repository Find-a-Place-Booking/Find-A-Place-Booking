-- Find A Place Booking
-- Canonical guest booking/payment flow.
--
-- This migration intentionally supersedes the sandbox-only guest booking RPCs.
-- Test and live Stripe keys use the SAME reservation/payment functions.
--
-- Payment architecture:
--   Stripe Destination Charge
--   guest charge -> connected host recipient
--   application fee -> Find A Place
--
-- For HOST_FULL processing policy, application_fee_cents contains:
--   platform commission + configured processor-fee recovery
--
-- Stripe still assesses its actual processing fee to the platform balance.
-- The payment/ledger records keep the commission, fee recovery, actual fee,
-- host proceeds and any estimate variance separate for accounting.

begin;

alter table public.platform_runtime_flags
  add column if not exists allow_guest_checkout boolean not null default false;

comment on column public.platform_runtime_flags.allow_guest_checkout is
  'Database kill switch for canonical guest checkout. Server BOOKING_CHECKOUT_ENABLED must also be true.';

comment on column public.payments.application_fee_cents is
  'Total processor application fee withheld from host proceeds. For HOST_FULL this is platform commission plus processor-fee recovery.';
comment on column public.payments.processor_fee_host_share_cents is
  'Amount withheld from host proceeds to recover processor cost under the reservation processing-fee policy.';
comment on column public.payments.processor_fee_actual_cents is
  'Actual processor fee reported after payment settlement/charge creation.';
comment on column public.payments.processor_fee_platform_share_cents is
  'Actual processor cost not recovered from the host. Zero when host recovery covers the actual processor fee.';
comment on column public.payments.host_proceeds_cents is
  'Amount routed to the connected host account by the destination charge after the application fee.';

-- Fresh-database safety: the original pricing RPCs were host/admin-only.
-- Guest checkout calls them through the service-role-only reservation RPC.
-- If a prior hotfix already added the service_role branch, this block skips it.
do $pricing_access$
declare
  fn record;
  original_def text;
  patched_def text;
  old_pattern text :=
    'if\s+\(select auth\.uid\(\)\)\s+is null\s+then\s+raise exception ''Authentication required'';\s+end if;\s*' ||
    'if\s+not public\.can_access_unit\(target_unit_id\)\s+then\s+raise exception ''Unit access required'';\s+end if;';
  replacement text :=
$replacement$
if (select auth.uid()) is null
   and coalesce((select auth.role()), '') <> 'service_role'
then
  raise exception 'Authentication required';
end if;

if coalesce((select auth.role()), '') = 'service_role' then
  if not exists (
    select 1
    from public.property_units units
    join public.properties properties on properties.id = units.property_id
    where units.id = target_unit_id
      and units.is_active
      and properties.status = 'PUBLISHED'
  ) then
    raise exception 'Published unit required';
  end if;
elsif not public.can_access_unit(target_unit_id) then
  raise exception 'Unit access required';
end if;
$replacement$;
begin
  for fn in
    select
      p.oid,
      p.proname,
      pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('quote_unit_stay', 'resolve_unit_pricing_days')
  loop
    original_def := pg_get_functiondef(fn.oid);

    if position('service_role' in original_def) > 0 then
      continue;
    end if;

    patched_def := regexp_replace(
      original_def,
      old_pattern,
      replacement,
      'i'
    );

    if patched_def = original_def then
      raise exception
        'Could not locate expected pricing authentication block in public.%(%)',
        fn.proname,
        fn.identity_args;
    end if;

    execute patched_def;
  end loop;
end
$pricing_access$;

create or replace function public.create_guest_reservation_hold(
  target_unit_id uuid,
  requested_check_in date,
  requested_check_out date,
  requested_guest_count integer,
  requested_pet_count integer default 0,
  requested_add_on_ids uuid[] default '{}'::uuid[],
  requested_promotion_code text default null,
  requested_guest_name text default null,
  requested_guest_email text default null,
  requested_guest_phone text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  unit_row record;
  organization_row record;
  quote jsonb;
  availability jsonb;
  reservation_id uuid;
  confirmation text;
  expires_at timestamptz := now() + interval '20 minutes';
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
  expired_ids uuid[] := '{}'::uuid[];
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if not coalesce((
    select flags.allow_guest_checkout
    from public.platform_runtime_flags flags
    where flags.singleton = 1
  ), false) then
    raise exception 'Guest checkout is disabled';
  end if;

  if requested_check_in is null
     or requested_check_out is null
     or requested_check_out <= requested_check_in then
    raise exception 'Checkout must be after check-in';
  end if;

  if requested_check_in < current_date then
    raise exception 'Check-in cannot be in the past';
  end if;

  if requested_guest_count is null or requested_guest_count < 1 then
    raise exception 'Guest count must be at least one';
  end if;

  if requested_pet_count is null or requested_pet_count < 0 then
    raise exception 'Pet count is invalid';
  end if;

  if nullif(trim(coalesce(requested_guest_name, '')), '') is null then
    raise exception 'Guest name is required';
  end if;

  if nullif(trim(coalesce(requested_guest_email, '')), '') is null then
    raise exception 'Guest email is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_unit_id::text, 0));

  select coalesce(array_agg(locked_reservations.id), '{}'::uuid[])
  into expired_ids
  from (
    select reservations.id
    from public.reservations reservations
    where reservations.unit_id = target_unit_id
      and reservations.status in ('HOLD','PAYMENT_PENDING','PAYMENT_FAILED')
      and reservations.hold_expires_at is not null
      and reservations.hold_expires_at <= now()
    for update
  ) as locked_reservations;

  if cardinality(expired_ids) > 0 then
    update public.reservations reservations
    set status = 'EXPIRED',
        updated_at = now()
    where reservations.id = any(expired_ids);

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
  end if;

  select
    units.id as unit_id,
    units.property_id,
    units.name as unit_name,
    units.slug,
    units.max_guests,
    units.minimum_stay_nights,
    units.check_in,
    units.checkout,
    units.cancellation_policy,
    properties.organization_id,
    properties.name as property_name,
    properties.status as property_status,
    properties.custom_policies
  into unit_row
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where units.id = target_unit_id
    and units.is_active
    and properties.status = 'PUBLISHED';

  if not found then
    raise exception 'Published rentable unit not found';
  end if;

  if requested_guest_count > coalesce(unit_row.max_guests, requested_guest_count) then
    raise exception 'Guest count exceeds this stay''s maximum';
  end if;

  if (requested_check_out - requested_check_in)
     < coalesce(unit_row.minimum_stay_nights, 1) then
    raise exception 'Stay does not meet the minimum-night requirement';
  end if;

  select organizations.id, organizations.commission_tier
  into organization_row
  from public.organizations organizations
  where organizations.id = unit_row.organization_id
  for share;

  if not found then
    raise exception 'Host organization not found';
  end if;

  availability := public.check_unit_availability(
    target_unit_id,
    requested_check_in,
    requested_check_out
  );

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

  commission_rate :=
    case organization_row.commission_tier
      when 'PARTNER_5' then 500
      else 700
    end;

  commission_base :=
    coalesce((quote ->> 'commission_base_cents')::bigint, 0);

  commission_amount :=
    round(
      (commission_base::numeric * commission_rate::numeric) / 10000
    )::bigint;

  select assignments.payment_account_id
  into payment_account_id_value
  from public.payment_account_assignments assignments
  join public.payment_accounts accounts
    on accounts.id = assignments.payment_account_id
  where assignments.unit_id = target_unit_id
    and accounts.organization_id = unit_row.organization_id
    and accounts.provider = 'STRIPE'
    and accounts.status = 'READY'
    and accounts.payouts_enabled
    and accounts.provider_account_id is not null
  limit 1;

  if payment_account_id_value is null then
    select assignments.payment_account_id
    into payment_account_id_value
    from public.payment_account_assignments assignments
    join public.payment_accounts accounts
      on accounts.id = assignments.payment_account_id
    where assignments.property_id = unit_row.property_id
      and accounts.organization_id = unit_row.organization_id
      and accounts.provider = 'STRIPE'
      and accounts.status = 'READY'
      and accounts.payouts_enabled
      and accounts.provider_account_id is not null
    limit 1;
  end if;

  if payment_account_id_value is null then
    select accounts.id
    into payment_account_id_value
    from public.payment_accounts accounts
    where accounts.organization_id = unit_row.organization_id
      and accounts.provider = 'STRIPE'
      and accounts.is_default
      and accounts.status = 'READY'
      and accounts.payouts_enabled
      and accounts.provider_account_id is not null
    order by accounts.created_at desc
    limit 1;
  end if;

  if payment_account_id_value is null then
    raise exception 'This stay is not ready to receive bookings';
  end if;

  select
    accounts.provider,
    accounts.provider_account_id,
    accounts.provider_location_id
  into
    payment_provider_value,
    provider_account_ref_value,
    provider_location_ref_value
  from public.payment_accounts accounts
  where accounts.id = payment_account_id_value;

  select coalesce(
    jsonb_build_object(
      'check_in', units.check_in,
      'checkout', units.checkout,
      'cancellation_policy', units.cancellation_policy,
      'custom_policies', properties.custom_policies,
      'policies', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'code', policies.policy_code,
            'label', catalog.label,
            'configuration', policies.configuration
          )
          order by catalog.label
        )
        from public.unit_policies policies
        join public.policy_catalog catalog
          on catalog.code = policies.policy_code
        where policies.unit_id = units.id
      ), '[]'::jsonb)
    ),
    '{}'::jsonb
  )
  into policy_snapshot_value
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where units.id = target_unit_id;

  confirmation :=
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.reservations (
    confirmation_code,
    organization_id,
    property_id,
    unit_id,
    status,
    check_in,
    check_out,
    hold_expires_at,
    guest_name,
    guest_email,
    guest_phone,
    guest_count,
    pet_count,
    currency,
    pricing_snapshot,
    policy_snapshot,
    promotion_snapshot,
    commission_tier,
    commission_rate_bps,
    commission_base_cents,
    platform_commission_cents,
    pre_tax_total_cents,
    tax_total_cents,
    guest_total_cents,
    tax_status,
    processing_fee_policy,
    payment_account_id,
    payment_provider,
    provider_account_ref,
    provider_location_ref,
    payment_status,
    created_by_profile_id
  ) values (
    confirmation,
    unit_row.organization_id,
    unit_row.property_id,
    target_unit_id,
    'HOLD',
    requested_check_in,
    requested_check_out,
    expires_at,
    left(trim(requested_guest_name), 180),
    left(lower(trim(requested_guest_email)), 320),
    left(nullif(trim(coalesce(requested_guest_phone, '')), ''), 60),
    requested_guest_count,
    requested_pet_count,
    coalesce(quote ->> 'currency', 'USD'),
    quote,
    policy_snapshot_value,
    nullif(quote -> 'promotion', 'null'::jsonb),
    organization_row.commission_tier,
    commission_rate,
    commission_base,
    commission_amount,
    coalesce((quote ->> 'pre_tax_total_cents')::bigint, 0),
    0,
    coalesce((quote ->> 'pre_tax_total_cents')::bigint, 0),
    'NOT_CALCULATED',
    'HOST_FULL',
    payment_account_id_value,
    payment_provider_value,
    provider_account_ref_value,
    provider_location_ref_value,
    'NOT_STARTED',
    null
  )
  returning id into reservation_id;

  if (quote -> 'promotion' ->> 'id') is not null then
    promotion_id := (quote -> 'promotion' ->> 'id')::uuid;
    promotion_discount :=
      coalesce((quote -> 'promotion' ->> 'discount_cents')::bigint, 0);

    select promos.*
    into promotion_row
    from public.promotion_codes promos
    where promos.id = promotion_id
    for update;

    if not found
       or not promotion_row.is_active
       or promotion_row.archived_at is not null then
      raise exception 'Promotion is no longer available';
    end if;

    select count(*)::bigint
    into reserved_promo_count
    from public.promotion_reservations promo_reservations
    where promo_reservations.promotion_code_id = promotion_id
      and promo_reservations.status = 'RESERVED'
      and promo_reservations.reserved_until > now();

    if promotion_row.max_redemptions is not null
       and promotion_row.redemption_count + reserved_promo_count
           >= promotion_row.max_redemptions then
      raise exception 'Promotion has reached its usage limit';
    end if;

    insert into public.promotion_reservations (
      reservation_id,
      promotion_code_id,
      status,
      discount_cents,
      reserved_until
    ) values (
      reservation_id,
      promotion_id,
      'RESERVED',
      promotion_discount,
      expires_at
    );
  end if;

  insert into public.availability_blocks (
    unit_id,
    block_type,
    state,
    start_date,
    end_date,
    label,
    expires_at,
    metadata,
    created_by,
    reservation_id
  ) values (
    target_unit_id,
    'INTERNAL_HOLD',
    'ACTIVE',
    requested_check_in,
    requested_check_out,
    'Find A Place checkout hold',
    expires_at,
    jsonb_build_object(
      'reservation_id', reservation_id,
      'confirmation_code', confirmation,
      'source', 'guest_checkout'
    ),
    null,
    reservation_id
  );

  insert into public.reservation_events (
    reservation_id,
    event_type,
    actor_profile_id,
    metadata
  ) values (
    reservation_id,
    'GUEST_HOLD_CREATED',
    null,
    jsonb_build_object(
      'expires_at', expires_at,
      'commission_tier', organization_row.commission_tier,
      'commission_rate_bps', commission_rate,
      'payment_account_id', payment_account_id_value,
      'provider_account_ref', provider_account_ref_value
    )
  );

  return jsonb_build_object(
    'reservation_id', reservation_id,
    'confirmation_code', confirmation,
    'status', 'HOLD',
    'hold_expires_at', expires_at,
    'quote', quote,
    'guest_total_cents',
      coalesce((quote ->> 'pre_tax_total_cents')::bigint, 0),
    'platform_commission_cents', commission_amount,
    'commission_rate_bps', commission_rate,
    'payment_account_id', payment_account_id_value,
    'provider_account_ref', provider_account_ref_value,
    'payment_ready', true
  );
end;
$$;

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
  processor_recovery bigint;
  processor_platform_share bigint;
  processor_variance bigint;
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
  where payments.id = target_payment_id
    and payments.reservation_id = target_reservation_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

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

  host_proceeds :=
    greatest(payment_row.amount_cents - payment_row.application_fee_cents, 0);

  processor_recovery :=
    greatest(
      payment_row.application_fee_cents
      - reservation_row.platform_commission_cents,
      0
    );

  processor_platform_share :=
    greatest(
      coalesce(target_processor_fee_actual_cents, 0) - processor_recovery,
      0
    );

  processor_variance :=
    coalesce(target_processor_fee_actual_cents, 0) - processor_recovery;

  update public.payments payments
  set
    status = 'SUCCEEDED',
    provider_payment_id =
      coalesce(target_provider_payment_id, payments.provider_payment_id),
    provider_charge_id =
      coalesce(target_provider_charge_id, payments.provider_charge_id),
    processor_fee_actual_cents =
      greatest(coalesce(target_processor_fee_actual_cents, 0), 0),
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
    metadata =
      blocks.metadata
      || jsonb_build_object(
        'payment_id', target_payment_id,
        'provider_payment_id', target_provider_payment_id
      ),
    updated_at = now()
  where blocks.reservation_id = target_reservation_id
    and blocks.state = 'ACTIVE'
    and blocks.block_type = 'INTERNAL_HOLD';

  update public.promotion_reservations promo_reservations
  set
    status = 'CONSUMED',
    consumed_at = now()
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
      reservation_id,
      payment_id,
      entry_group_id,
      entry_type,
      amount_cents,
      currency,
      description,
      metadata
    ) values
      (
        target_reservation_id,
        target_payment_id,
        ledger_group,
        'GUEST_CHARGE',
        payment_row.amount_cents,
        reservation_row.currency,
        'Guest charge processed by Stripe',
        jsonb_build_object(
          'provider', payment_row.provider,
          'provider_payment_id', target_provider_payment_id
        )
      ),
      (
        target_reservation_id,
        target_payment_id,
        ledger_group,
        'HOST_PROCEEDS',
        -host_proceeds,
        reservation_row.currency,
        'Host proceeds routed by destination charge',
        jsonb_build_object(
          'provider_account_ref', reservation_row.provider_account_ref
        )
      ),
      (
        target_reservation_id,
        target_payment_id,
        ledger_group,
        'PLATFORM_COMMISSION',
        -reservation_row.platform_commission_cents,
        reservation_row.currency,
        'Find A Place marketplace commission',
        jsonb_build_object(
          'commission_rate_bps', reservation_row.commission_rate_bps
        )
      );

    if greatest(coalesce(target_processor_fee_actual_cents, 0), 0) > 0 then
      insert into public.financial_ledger_entries (
        reservation_id,
        payment_id,
        entry_group_id,
        entry_type,
        amount_cents,
        currency,
        description,
        metadata
      ) values (
        target_reservation_id,
        target_payment_id,
        ledger_group,
        'PROCESSOR_FEE',
        -greatest(coalesce(target_processor_fee_actual_cents, 0), 0),
        reservation_row.currency,
        'Stripe processor fee',
        jsonb_build_object(
          'host_recovery_cents', processor_recovery,
          'platform_unrecovered_cents', processor_platform_share
        )
      );
    end if;

    if processor_variance <> 0 then
      insert into public.financial_ledger_entries (
        reservation_id,
        payment_id,
        entry_group_id,
        entry_type,
        amount_cents,
        currency,
        description,
        metadata
      ) values (
        target_reservation_id,
        target_payment_id,
        ledger_group,
        'ADJUSTMENT',
        processor_variance,
        reservation_row.currency,
        'Processor fee recovery variance',
        jsonb_build_object(
          'processor_fee_actual_cents',
            coalesce(target_processor_fee_actual_cents, 0),
          'processor_fee_recovery_cents', processor_recovery
        )
      );
    end if;
  end if;

  insert into public.reservation_events (
    reservation_id,
    event_type,
    actor_profile_id,
    metadata
  ) values (
    target_reservation_id,
    'PAYMENT_SUCCEEDED',
    null,
    jsonb_build_object(
      'provider', payment_row.provider,
      'payment_id', target_payment_id,
      'provider_payment_id', target_provider_payment_id,
      'provider_charge_id', target_provider_charge_id,
      'application_fee_cents', payment_row.application_fee_cents,
      'platform_commission_cents',
        reservation_row.platform_commission_cents,
      'processor_fee_recovery_cents', processor_recovery,
      'processor_fee_actual_cents', target_processor_fee_actual_cents,
      'host_proceeds_cents', host_proceeds
    )
  );

  return jsonb_build_object(
    'status', 'CONFIRMED',
    'confirmation_code', reservation_row.confirmation_code,
    'host_proceeds_cents', host_proceeds,
    'platform_commission_cents',
      reservation_row.platform_commission_cents,
    'application_fee_cents', payment_row.application_fee_cents,
    'processor_fee_recovery_cents', processor_recovery,
    'processor_fee_actual_cents', target_processor_fee_actual_cents
  );
end;
$$;

create or replace function public.mark_reservation_payment_failed(
  target_reservation_id uuid,
  target_payment_id uuid,
  target_failure_code text default null,
  target_failure_message text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  update public.payments payments
  set
    status = 'FAILED',
    failure_code = left(target_failure_code, 120),
    failure_message = left(target_failure_message, 500),
    updated_at = now()
  where payments.id = target_payment_id
    and payments.reservation_id = target_reservation_id
    and payments.status <> 'SUCCEEDED';

  update public.reservations reservations
  set
    status = 'PAYMENT_FAILED',
    payment_status = 'FAILED',
    updated_at = now()
  where reservations.id = target_reservation_id
    and reservations.status in ('HOLD','PAYMENT_PENDING','PAYMENT_FAILED')
    and reservations.payment_status <> 'SUCCEEDED';

  insert into public.reservation_events (
    reservation_id,
    event_type,
    actor_profile_id,
    metadata
  ) values (
    target_reservation_id,
    'PAYMENT_FAILED',
    null,
    jsonb_build_object(
      'payment_id', target_payment_id,
      'failure_code', target_failure_code
    )
  );
end;
$$;

revoke all on function public.create_guest_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text
) from public, anon, authenticated;

revoke all on function public.confirm_reservation_payment(
  uuid,uuid,text,text,bigint
) from public, anon, authenticated;

revoke all on function public.mark_reservation_payment_failed(
  uuid,uuid,text,text
) from public, anon, authenticated;

grant execute on function public.create_guest_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text
) to service_role;

grant execute on function public.confirm_reservation_payment(
  uuid,uuid,text,text,bigint
) to service_role;

grant execute on function public.mark_reservation_payment_failed(
  uuid,uuid,text,text
) to service_role;

-- Retire the parallel sandbox-only database API. Historical migration files
-- remain untouched, but no application code should call these functions now.
drop function if exists public.create_sandbox_guest_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text
);

drop function if exists public.confirm_sandbox_reservation_payment(
  uuid,uuid,text,text,bigint
);

drop function if exists public.mark_sandbox_reservation_payment_failed(
  uuid,uuid,text,text
);

alter table public.platform_runtime_flags
  drop column if exists allow_sandbox_guest_checkout;

commit;
