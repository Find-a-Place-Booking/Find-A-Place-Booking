-- Use the property's local calendar day for cancellation and change-policy checks.
-- Recheck pet eligibility when a host applies a change request.
begin;

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
  refundable_tax bigint := 0;
  refundable_commission bigint := 0;
  intended_application_fee_refund bigint := 0;
  commission_refund_eligible boolean := false;
  days_before_check_in integer := 0;
  property_time_zone text;
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

  select coalesce(properties.time_zone, 'America/Chicago')
  into property_time_zone
  from public.properties properties
  where properties.id = reservation_row.property_id;

  days_before_check_in := reservation_row.check_in
    - (now() at time zone coalesce(property_time_zone, 'America/Chicago'))::date;
  commission_refund_eligible := days_before_check_in >= 14;

  if requested_full_refund then
    final_amount := remaining_amount;

    refundable_tax :=
      least(
        greatest(
          coalesce(payment_row.platform_tax_retained_cents, 0),
          0
        ),
        payment_row.application_fee_cents
      );

    refundable_commission :=
      case
        when commission_refund_eligible then
          greatest(
            coalesce(reservation_row.platform_commission_cents, 0),
            0
          )
        else 0
      end;

    intended_application_fee_refund :=
      least(
        payment_row.application_fee_cents,
        refundable_tax + refundable_commission
      );

    application_fee_refund :=
      greatest(
        least(
          intended_application_fee_refund - application_fee_refunded,
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
    'platform_tax_refund_cents',
      case
        when requested_full_refund then
          least(refundable_tax, application_fee_refund)
        else 0
      end,
    'platform_commission_refund_cents',
      case
        when requested_full_refund
         and commission_refund_eligible then
          greatest(
            application_fee_refund
              - least(refundable_tax, application_fee_refund),
            0
          )
        else 0
      end,
    'commission_refund_eligible', commission_refund_eligible,
    'days_before_check_in', days_before_check_in,
    'is_full_refund', requested_full_refund,
    'currency', payment_row.currency,
    'payment_environment', payment_row.payment_environment
  );
end;
$$;

create or replace function public.apply_host_reservation_change(
  target_reservation_id uuid,
  target_change_request_id uuid,
  target_check_in date,
  target_check_out date,
  target_guest_count integer,
  target_pet_count integer,
  target_host_response text,
  target_responded_by uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation_row public.reservations%rowtype;
  change_row public.reservation_change_requests%rowtype;
  unit_row public.property_units%rowtype;
  old_check_in date;
  old_check_out date;
  old_guest_count integer;
  old_pet_count integer;
  new_guest_count integer;
  new_pet_count integer;
  stay_nights integer;
  now_value timestamptz := now();
  property_time_zone text;
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

  if reservation_row.status <> 'CONFIRMED' then
    raise exception 'Only confirmed reservations can be changed';
  end if;

  select requests.*
  into change_row
  from public.reservation_change_requests requests
  where requests.id = target_change_request_id
    and requests.reservation_id = target_reservation_id
  for update;

  if not found then
    raise exception 'Change request not found';
  end if;

  if change_row.status <> 'REQUESTED' then
    raise exception 'This change request has already been answered';
  end if;

  select units.*
  into unit_row
  from public.property_units units
  where units.id = reservation_row.unit_id
  for share;

  if not found then
    raise exception 'Rentable unit not found';
  end if;

  if target_check_in is null or target_check_out is null then
    raise exception 'Updated check-in and check-out are required';
  end if;

  if target_check_out <= target_check_in then
    raise exception 'Check-out must be after check-in';
  end if;

  select coalesce(properties.time_zone, 'America/Chicago')
  into property_time_zone
  from public.properties properties
  where properties.id = reservation_row.property_id;

  if target_check_in < (now_value at time zone coalesce(property_time_zone, 'America/Chicago'))::date then
    raise exception 'Check-in cannot be moved into the past';
  end if;

  stay_nights := target_check_out - target_check_in;

  if unit_row.minimum_stay_nights is not null
     and stay_nights < unit_row.minimum_stay_nights then
    raise exception
      'The updated stay is shorter than the property minimum stay';
  end if;

  new_guest_count :=
    coalesce(target_guest_count, reservation_row.guest_count);
  new_pet_count :=
    coalesce(target_pet_count, reservation_row.pet_count);

  if new_guest_count < 1 then
    raise exception 'Guest count must be at least one';
  end if;

  if unit_row.max_guests is not null
     and new_guest_count > unit_row.max_guests then
    raise exception 'Guest count exceeds the property maximum';
  end if;

  perform public.assert_guest_booking_options(
    reservation_row.unit_id, new_pet_count, '{}'::uuid[]
  );

  old_check_in := reservation_row.check_in;
  old_check_out := reservation_row.check_out;
  old_guest_count := reservation_row.guest_count;
  old_pet_count := reservation_row.pet_count;

  perform pg_advisory_xact_lock(
    hashtextextended(reservation_row.unit_id::text, 0)
  );

  if target_check_in <> old_check_in
     or target_check_out <> old_check_out then
    if exists (
      select 1
      from public.availability_blocks blocks
      where blocks.unit_id = reservation_row.unit_id
        and blocks.state = 'ACTIVE'
        and blocks.reservation_id is distinct from target_reservation_id
        and (
          blocks.expires_at is null
          or blocks.expires_at > now_value
        )
        and blocks.start_date < target_check_out
        and blocks.end_date > target_check_in
    ) then
      raise exception
        'The requested dates are no longer available';
    end if;
  end if;

  update public.reservations reservations
  set
    check_in = target_check_in,
    check_out = target_check_out,
    guest_count = new_guest_count,
    pet_count = new_pet_count,
    updated_at = now_value
  where reservations.id = target_reservation_id;

  update public.availability_blocks blocks
  set
    start_date = target_check_in,
    end_date = target_check_out,
    label = 'Find A Place reservation',
    metadata =
      blocks.metadata
      || jsonb_build_object(
        'last_change_request_id', target_change_request_id,
        'previous_check_in', old_check_in,
        'previous_check_out', old_check_out,
        'updated_check_in', target_check_in,
        'updated_check_out', target_check_out
      ),
    updated_at = now_value
  where blocks.reservation_id = target_reservation_id
    and blocks.state = 'ACTIVE'
    and blocks.block_type = 'INTERNAL_RESERVATION';

  if not found then
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
      reservation_row.unit_id,
      'INTERNAL_RESERVATION',
      'ACTIVE',
      target_check_in,
      target_check_out,
      'Find A Place reservation',
      null,
      jsonb_build_object(
        'reservation_id', target_reservation_id,
        'confirmation_code', reservation_row.confirmation_code,
        'source', 'reservation_change_repair',
        'change_request_id', target_change_request_id
      ),
      null,
      target_reservation_id
    );
  end if;

  update public.reservation_change_requests requests
  set
    status = 'COMPLETED',
    host_response =
      nullif(trim(coalesce(target_host_response, '')), ''),
    responded_by = target_responded_by,
    responded_at = now_value,
    completed_at = now_value,
    metadata =
      requests.metadata
      || jsonb_build_object(
        'resolution', 'HOST_APPLIED_CHANGE',
        'automatic_reservation_mutation', true,
        'previous_check_in', old_check_in,
        'previous_check_out', old_check_out,
        'updated_check_in', target_check_in,
        'updated_check_out', target_check_out,
        'previous_guest_count', old_guest_count,
        'updated_guest_count', new_guest_count,
        'previous_pet_count', old_pet_count,
        'updated_pet_count', new_pet_count,
        'payment_amount_unchanged', true,
        'source', 'host_reservation'
      ),
    updated_at = now_value
  where requests.id = target_change_request_id;

  insert into public.reservation_events (
    reservation_id,
    event_type,
    actor_profile_id,
    metadata
  ) values (
    target_reservation_id,
    'HOST_CHANGE_REQUEST_APPLIED',
    target_responded_by,
    jsonb_build_object(
      'change_request_id', target_change_request_id,
      'previous_check_in', old_check_in,
      'previous_check_out', old_check_out,
      'updated_check_in', target_check_in,
      'updated_check_out', target_check_out,
      'previous_guest_count', old_guest_count,
      'updated_guest_count', new_guest_count,
      'previous_pet_count', old_pet_count,
      'updated_pet_count', new_pet_count,
      'payment_amount_unchanged', true
    )
  );

  return jsonb_build_object(
    'confirmation_code', reservation_row.confirmation_code,
    'check_in', target_check_in,
    'check_out', target_check_out,
    'guest_count', new_guest_count,
    'pet_count', new_pet_count,
    'payment_amount_unchanged', true
  );
end;
$$;

create or replace function public.complete_host_cancellation_without_refund(
  target_reservation_id uuid,
  target_request_id uuid,
  target_host_response text,
  target_responded_by uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation_row public.reservations%rowtype;
  now_value timestamptz := now();
  property_time_zone text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select * into reservation_row
  from public.reservations
  where id = target_reservation_id
  for update;

  if not found or reservation_row.status <> 'CONFIRMED' then
    raise exception 'Only a confirmed reservation can be cancelled';
  end if;

  select coalesce(properties.time_zone, 'America/Chicago')
  into property_time_zone
  from public.properties properties
  where properties.id = reservation_row.property_id;

  if reservation_row.check_in
      - (now_value at time zone coalesce(property_time_zone, 'America/Chicago'))::date >= 14 then
    raise exception 'A cancellation at least 14 calendar days before check-in requires a full guest refund';
  end if;

  update public.reservation_cancellation_requests
  set status = 'COMPLETED',
      host_response = nullif(trim(coalesce(target_host_response, '')), ''),
      responded_by = target_responded_by,
      responded_at = now_value,
      completed_at = now_value,
      metadata = metadata || jsonb_build_object(
        'resolution', 'NO_REFUND', 'source', 'host_reservation'
      ),
      updated_at = now_value
  where id = target_request_id
    and reservation_id = target_reservation_id
    and status = 'REQUESTED';

  if not found then
    raise exception 'Cancellation request has already been answered';
  end if;

  update public.reservations
  set status = 'CANCELLED', cancelled_at = now_value, updated_at = now_value
  where id = target_reservation_id;

  update public.availability_blocks
  set state = 'CANCELLED', updated_at = now_value
  where reservation_id = target_reservation_id
    and state = 'ACTIVE'
    and block_type in ('INTERNAL_HOLD', 'INTERNAL_RESERVATION');

  insert into public.reservation_events (
    reservation_id, event_type, actor_profile_id, metadata
  ) values (
    target_reservation_id,
    'HOST_CANCELLATION_APPROVED_NO_REFUND',
    target_responded_by,
    jsonb_build_object(
      'cancellation_request_id', target_request_id,
      'resolution', 'NO_REFUND',
      'host_response', nullif(trim(coalesce(target_host_response, '')), '')
    )
  );
end;
$$;

revoke all on function public.create_refund_request(uuid,bigint,boolean,text) from public, anon, authenticated;
grant execute on function public.create_refund_request(uuid,bigint,boolean,text) to service_role;
revoke all on function public.apply_host_reservation_change(uuid,uuid,date,date,integer,integer,text,uuid) from public, anon, authenticated;
grant execute on function public.apply_host_reservation_change(uuid,uuid,date,date,integer,integer,text,uuid) to service_role;
revoke all on function public.complete_host_cancellation_without_refund(uuid,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.complete_host_cancellation_without_refund(uuid,uuid,text,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
