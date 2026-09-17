-- Find A Place Booking
-- Hotfix: sandbox guest hold stale-reservation row locking.
-- Fixes PostgreSQL error:
--   FOR UPDATE is not allowed with aggregate functions
--
-- Safe to apply after 20260917001800_sandbox_guest_booking.sql.
-- No Stripe settings or payment records are changed.

begin;

create or replace function public.create_sandbox_guest_reservation_hold(
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
  if not coalesce((
    select flags.allow_sandbox_guest_checkout
    from public.platform_runtime_flags flags
    where flags.singleton = 1
  ), false) then
    raise exception 'Sandbox guest checkout is disabled';
  end if;

  if requested_check_in is null or requested_check_out is null or requested_check_out <= requested_check_in then
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

  -- Clean up stale sandbox holds on this unit before re-checking availability.
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
    set status = 'EXPIRED', updated_at = now()
    where reservations.id = any(expired_ids);

    update public.availability_blocks blocks
    set state = 'CANCELLED', updated_at = now()
    where blocks.reservation_id = any(expired_ids)
      and blocks.block_type = 'INTERNAL_HOLD'
      and blocks.state = 'ACTIVE';

    update public.promotion_reservations promo_reservations
    set status = 'RELEASED', released_at = now()
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

  if not found then raise exception 'Published rentable unit not found'; end if;

  if requested_guest_count > coalesce(unit_row.max_guests, requested_guest_count) then
    raise exception 'Guest count exceeds this stay''s maximum';
  end if;

  if (requested_check_out - requested_check_in) < coalesce(unit_row.minimum_stay_nights, 1) then
    raise exception 'Stay does not meet the minimum-night requirement';
  end if;

  select organizations.id, organizations.commission_tier
  into organization_row
  from public.organizations organizations
  where organizations.id = unit_row.organization_id
  for share;

  if not found then raise exception 'Host organization not found'; end if;

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
    case organization_row.commission_tier when 'PARTNER_5' then 500 else 700 end;
  commission_base := coalesce((quote ->> 'commission_base_cents')::bigint, 0);
  commission_amount :=
    round((commission_base::numeric * commission_rate::numeric) / 10000)::bigint;

  -- Guest checkout resolves the same unit -> property -> organization precedence,
  -- but without exposing the manager-only resolver to anonymous callers.
  select assignments.payment_account_id into payment_account_id_value
  from public.payment_account_assignments assignments
  join public.payment_accounts accounts on accounts.id = assignments.payment_account_id
  where assignments.unit_id = target_unit_id
    and accounts.organization_id = unit_row.organization_id
    and accounts.provider = 'STRIPE'
    and accounts.status = 'READY'
    and accounts.payouts_enabled
    and accounts.provider_account_id is not null
  limit 1;

  if payment_account_id_value is null then
    select assignments.payment_account_id into payment_account_id_value
    from public.payment_account_assignments assignments
    join public.payment_accounts accounts on accounts.id = assignments.payment_account_id
    where assignments.property_id = unit_row.property_id
      and accounts.organization_id = unit_row.organization_id
      and accounts.provider = 'STRIPE'
      and accounts.status = 'READY'
      and accounts.payouts_enabled
      and accounts.provider_account_id is not null
    limit 1;
  end if;

  if payment_account_id_value is null then
    select accounts.id into payment_account_id_value
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
    raise exception 'This stay is not ready to receive Stripe sandbox bookings';
  end if;

  select accounts.provider, accounts.provider_account_id, accounts.provider_location_id
  into payment_provider_value, provider_account_ref_value, provider_location_ref_value
  from public.payment_accounts accounts
  where accounts.id = payment_account_id_value;

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
    check_in, check_out, hold_expires_at, guest_name, guest_email, guest_phone,
    guest_count, pet_count, currency, pricing_snapshot, policy_snapshot,
    promotion_snapshot, commission_tier, commission_rate_bps,
    commission_base_cents, platform_commission_cents, pre_tax_total_cents,
    tax_total_cents, guest_total_cents, tax_status, processing_fee_policy,
    payment_account_id, payment_provider, provider_account_ref,
    provider_location_ref, payment_status, created_by_profile_id
  ) values (
    confirmation, unit_row.organization_id, unit_row.property_id, target_unit_id, 'HOLD',
    requested_check_in, requested_check_out, expires_at,
    left(trim(requested_guest_name), 180),
    left(lower(trim(requested_guest_email)), 320),
    left(nullif(trim(coalesce(requested_guest_phone, '')), ''), 60),
    requested_guest_count, requested_pet_count, coalesce(quote ->> 'currency', 'USD'),
    quote, policy_snapshot_value, quote -> 'promotion',
    organization_row.commission_tier, commission_rate, commission_base,
    commission_amount, coalesce((quote ->> 'pre_tax_total_cents')::bigint, 0),
    0, coalesce((quote ->> 'pre_tax_total_cents')::bigint, 0),
    'NOT_CALCULATED', 'HOST_FULL', payment_account_id_value,
    payment_provider_value, provider_account_ref_value, provider_location_ref_value,
    'NOT_STARTED', null
  )
  returning id into reservation_id;

  if (quote -> 'promotion' ->> 'id') is not null then
    promotion_id := (quote -> 'promotion' ->> 'id')::uuid;
    promotion_discount :=
      coalesce((quote -> 'promotion' ->> 'discount_cents')::bigint, 0);

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
    target_unit_id, 'INTERNAL_HOLD', 'ACTIVE',
    requested_check_in, requested_check_out,
    'Find A Place sandbox checkout hold', expires_at,
    jsonb_build_object(
      'reservation_id', reservation_id,
      'confirmation_code', confirmation,
      'source', 'sandbox_guest_checkout'
    ),
    null, reservation_id
  );

  insert into public.reservation_events (
    reservation_id, event_type, actor_profile_id, metadata
  ) values (
    reservation_id, 'SANDBOX_GUEST_HOLD_CREATED', null,
    jsonb_build_object(
      'expires_at', expires_at,
      'commission_tier', organization_row.commission_tier,
      'commission_rate_bps', commission_rate,
      'payment_account_id', payment_account_id_value,
      'provider_account_ref', provider_account_ref_value,
      'sandbox_only', true
    )
  );

  return jsonb_build_object(
    'reservation_id', reservation_id,
    'confirmation_code', confirmation,
    'status', 'HOLD',
    'hold_expires_at', expires_at,
    'quote', quote,
    'guest_total_cents', coalesce((quote ->> 'pre_tax_total_cents')::bigint, 0),
    'platform_commission_cents', commission_amount,
    'commission_rate_bps', commission_rate,
    'payment_account_id', payment_account_id_value,
    'provider_account_ref', provider_account_ref_value,
    'payment_ready', true,
    'sandbox_only', true
  );
end;
$$;

comment on function public.create_sandbox_guest_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text
) is
  'Service-role-only sandbox guest hold creator. Hotfixed so stale hold rows are locked in a subquery before aggregation.';

commit;
