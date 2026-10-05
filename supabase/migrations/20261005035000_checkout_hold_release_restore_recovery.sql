alter table public.reservations
  add column if not exists checkout_recovery_eligible_at timestamptz,
  add column if not exists checkout_recovery_sent_at timestamptz;

create index if not exists reservations_checkout_recovery_due_idx
  on public.reservations (checkout_recovery_eligible_at)
  where checkout_recovery_sent_at is null
    and guest_email is not null;

comment on column public.reservations.checkout_recovery_eligible_at is
  'Earliest time an unfinished checkout may receive its one recovery email.';
comment on column public.reservations.checkout_recovery_sent_at is
  'Timestamp of the single abandoned-checkout recovery email for this reservation.';

create or replace function public.prepare_checkout_recovery_state()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.status in ('CONFIRMED', 'CANCELLED') then
    new.checkout_recovery_eligible_at := null;
    return new;
  end if;

  if new.guest_email is not null
     and new.checkout_recovery_sent_at is null
     and new.checkout_recovery_eligible_at is null
  then
    if new.status in ('HOLD', 'PAYMENT_PENDING', 'PAYMENT_FAILED') then
      new.checkout_recovery_eligible_at := now() + interval '8 minutes';
    elsif new.status = 'EXPIRED' then
      new.checkout_recovery_eligible_at := now() + interval '5 minutes';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists reservations_prepare_checkout_recovery
on public.reservations;

create trigger reservations_prepare_checkout_recovery
before insert or update of status, guest_email, checkout_recovery_sent_at
on public.reservations
for each row
execute function public.prepare_checkout_recovery_state();

create or replace function public.service_release_guest_reservation_hold(
  target_reservation_id uuid,
  expected_environment public.payment_environment
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  reservation_row public.reservations%rowtype;
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

  if reservation_row.status = 'CONFIRMED'
     or reservation_row.payment_status = 'SUCCEEDED'
     or reservation_row.payment_status = 'PROCESSING'
     or exists (
       select 1 from public.payments payments
       where payments.reservation_id = target_reservation_id
         and payments.status::text in ('SUCCEEDED', 'PROCESSING')
     )
  then
    raise exception 'A paid or processing reservation cannot be released';
  end if;

  if exists (
    select 1 from public.payments payments
    where payments.reservation_id = target_reservation_id
      and payments.status::text not in ('CANCELLED', 'FAILED')
  ) then
    raise exception 'Cancel the open payment attempt before releasing this hold';
  end if;

  if reservation_row.status <> 'EXPIRED' then
    update public.reservations reservations
    set
      status = 'EXPIRED',
      payment_status = case
        when reservations.payment_status in ('NOT_STARTED','FAILED','CANCELLED')
          then 'CANCELLED'
        else reservations.payment_status
      end,
      hold_expires_at = now(),
      checkout_recovery_eligible_at = case
        when reservations.checkout_recovery_sent_at is null
          then now() + interval '5 minutes'
        else reservations.checkout_recovery_eligible_at
      end,
      updated_at = now()
    where reservations.id = target_reservation_id;
  end if;

  update public.availability_blocks blocks
  set
    state = 'CANCELLED',
    expires_at = least(coalesce(blocks.expires_at, now()), now()),
    metadata = blocks.metadata || jsonb_build_object(
      'released_at', now(),
      'release_source', 'guest_checkout_exit'
    ),
    updated_at = now()
  where blocks.reservation_id = target_reservation_id
    and blocks.block_type = 'INTERNAL_HOLD'
    and blocks.state = 'ACTIVE';

  update public.promotion_reservations promo_reservations
  set
    status = 'RELEASED',
    released_at = now(),
    reserved_until = least(coalesce(promo_reservations.reserved_until, now()), now())
  where promo_reservations.reservation_id = target_reservation_id
    and promo_reservations.status = 'RESERVED';

  if not exists (
    select 1 from public.reservation_events events
    where events.reservation_id = target_reservation_id
      and events.event_type = 'GUEST_HOLD_RELEASED'
  ) then
    insert into public.reservation_events (
      reservation_id,event_type,actor_profile_id,metadata
    ) values (
      target_reservation_id,
      'GUEST_HOLD_RELEASED',
      null,
      jsonb_build_object(
        'released_at', now(),
        'source', 'guest_checkout_exit',
        'confirmation_code', reservation_row.confirmation_code
      )
    );
  end if;

  return jsonb_build_object(
    'reservation_id', target_reservation_id,
    'confirmation_code', reservation_row.confirmation_code,
    'status', 'EXPIRED',
    'released', true
  );
end;
$function$;

create or replace function public.service_restore_guest_reservation_hold(
  target_reservation_id uuid,
  expected_environment public.payment_environment
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  reservation_row public.reservations%rowtype;
  availability jsonb;
  expires_at timestamptz := now() + interval '20 minutes';
  promotion_reservation_row public.promotion_reservations%rowtype;
  promotion_row public.promotion_codes%rowtype;
  reserved_promo_count bigint := 0;
  nights integer := 0;
  lodging_cents bigint := 0;
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

  if reservation_row.status = 'CONFIRMED'
     or reservation_row.payment_status = 'SUCCEEDED'
  then
    return jsonb_build_object(
      'reservation_id', reservation_row.id,
      'confirmation_code', reservation_row.confirmation_code,
      'status', 'CONFIRMED',
      'restored', false
    );
  end if;

  if reservation_row.status in ('HOLD','PAYMENT_PENDING','PAYMENT_FAILED')
     and reservation_row.hold_expires_at is not null
     and reservation_row.hold_expires_at > now()
  then
    return jsonb_build_object(
      'reservation_id', reservation_row.id,
      'confirmation_code', reservation_row.confirmation_code,
      'status', reservation_row.status,
      'hold_expires_at', reservation_row.hold_expires_at,
      'restored', false,
      'already_active', true
    );
  end if;

  if reservation_row.status not in ('EXPIRED','HOLD','PAYMENT_PENDING','PAYMENT_FAILED') then
    raise exception 'This reservation cannot be restored';
  end if;

  if reservation_row.created_at < now() - interval '24 hours' then
    raise exception 'This checkout is too old to restore. Start a new booking.';
  end if;

  if reservation_row.check_in < current_date then
    raise exception 'These stay dates can no longer be restored';
  end if;

  if reservation_row.payment_status = 'PROCESSING'
     or exists (
       select 1 from public.payments payments
       where payments.reservation_id = target_reservation_id
         and payments.status::text in ('SUCCEEDED','PROCESSING')
     )
  then
    raise exception 'Payment is already processing for this reservation';
  end if;

  if exists (
    select 1 from public.payments payments
    where payments.reservation_id = target_reservation_id
      and payments.status::text <> 'CANCELLED'
  ) then
    raise exception 'Old payment attempt must be closed before restoring checkout';
  end if;

  if not exists (
    select 1
    from public.property_units units
    join public.properties properties on properties.id = units.property_id
    where units.id = reservation_row.unit_id
      and units.is_active
      and properties.status = 'PUBLISHED'
  ) then
    raise exception 'This stay is no longer available for booking';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(reservation_row.unit_id::text, 0)
  );

  availability := public.check_unit_availability(
    reservation_row.unit_id,
    reservation_row.check_in,
    reservation_row.check_out
  );

  if coalesce((availability ->> 'available')::boolean, false) is not true then
    raise exception 'Those dates are no longer available';
  end if;

  select promo_reservations.* into promotion_reservation_row
  from public.promotion_reservations promo_reservations
  where promo_reservations.reservation_id = target_reservation_id
  for update;

  if found then
    select promotions.* into promotion_row
    from public.promotion_codes promotions
    where promotions.id = promotion_reservation_row.promotion_code_id
    for update;

    nights := reservation_row.check_out - reservation_row.check_in;
    lodging_cents := greatest(coalesce(
      (reservation_row.pricing_snapshot ->> 'lodging_subtotal_cents')::bigint, 0), 0);

    if not found
       or not promotion_row.is_active
       or promotion_row.archived_at is not null
       or (promotion_row.unit_id is not null and promotion_row.unit_id <> reservation_row.unit_id)
       or (promotion_row.eligible_check_in_start is not null and reservation_row.check_in < promotion_row.eligible_check_in_start)
       or (promotion_row.eligible_check_in_end is not null and reservation_row.check_in > promotion_row.eligible_check_in_end)
       or (promotion_row.minimum_nights is not null and nights < promotion_row.minimum_nights)
       or (promotion_row.minimum_lodging_cents is not null and lodging_cents < promotion_row.minimum_lodging_cents)
       or lower(coalesce(promotion_row.currency, reservation_row.currency)) <> lower(reservation_row.currency)
    then
      raise exception 'The promotion on this checkout is no longer available';
    end if;

    select count(*)::bigint into reserved_promo_count
    from public.promotion_reservations promo_reservations
    where promo_reservations.promotion_code_id = promotion_row.id
      and promo_reservations.reservation_id <> target_reservation_id
      and promo_reservations.status = 'RESERVED'
      and promo_reservations.reserved_until > now();

    if promotion_row.max_redemptions is not null
       and promotion_row.redemption_count + reserved_promo_count
           >= promotion_row.max_redemptions
    then
      raise exception 'The promotion on this checkout has reached its usage limit';
    end if;

    update public.promotion_reservations promo_reservations
    set
      status = 'RESERVED',
      reserved_until = expires_at,
      released_at = null,
      consumed_at = null
    where promo_reservations.reservation_id = target_reservation_id;
  end if;

  update public.reservations reservations
  set
    status = 'HOLD',
    payment_status = 'NOT_STARTED',
    hold_expires_at = expires_at,
    checkout_recovery_eligible_at = case
      when reservations.checkout_recovery_sent_at is null
        then now() + interval '8 minutes'
      else reservations.checkout_recovery_eligible_at
    end,
    updated_at = now()
  where reservations.id = target_reservation_id;

  insert into public.availability_blocks (
    unit_id,block_type,state,start_date,end_date,label,expires_at,
    metadata,created_by,reservation_id
  ) values (
    reservation_row.unit_id,
    'INTERNAL_HOLD',
    'ACTIVE',
    reservation_row.check_in,
    reservation_row.check_out,
    'Find A Place recovered checkout hold',
    expires_at,
    jsonb_build_object(
      'reservation_id', reservation_row.id,
      'confirmation_code', reservation_row.confirmation_code,
      'source', 'checkout_recovery'
    ),
    null,
    reservation_row.id
  );

  insert into public.reservation_events (
    reservation_id,event_type,actor_profile_id,metadata
  ) values (
    target_reservation_id,
    'GUEST_HOLD_RESTORED',
    null,
    jsonb_build_object(
      'restored_at', now(),
      'expires_at', expires_at,
      'source', 'checkout_recovery',
      'confirmation_code', reservation_row.confirmation_code
    )
  );

  return jsonb_build_object(
    'reservation_id', reservation_row.id,
    'confirmation_code', reservation_row.confirmation_code,
    'status', 'HOLD',
    'hold_expires_at', expires_at,
    'restored', true
  );
end;
$function$;

create or replace function public.service_restore_guest_taxed_reservation_hold(
  target_reservation_id uuid,
  expected_environment public.payment_environment
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  hold_result jsonb;
  tax_result jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  hold_result := public.service_restore_guest_reservation_hold(
    target_reservation_id,
    expected_environment
  );

  if coalesce(hold_result ->> 'status', '') = 'CONFIRMED' then
    return hold_result;
  end if;

  tax_result := public.calculate_reservation_checkout_tax(
    target_reservation_id,
    expected_environment
  );

  return hold_result || jsonb_build_object(
    'tax_status', tax_result ->> 'tax_status',
    'tax_total_cents', (tax_result ->> 'tax_total_cents')::bigint,
    'guest_total_cents', (tax_result ->> 'guest_total_cents')::bigint,
    'tax_snapshot', tax_result -> 'tax_snapshot'
  );
end;
$function$;

revoke all on function public.service_release_guest_reservation_hold(uuid, public.payment_environment)
  from public, anon, authenticated;
grant execute on function public.service_release_guest_reservation_hold(uuid, public.payment_environment)
  to service_role;

revoke all on function public.service_restore_guest_reservation_hold(uuid, public.payment_environment)
  from public, anon, authenticated;
grant execute on function public.service_restore_guest_reservation_hold(uuid, public.payment_environment)
  to service_role;

revoke all on function public.service_restore_guest_taxed_reservation_hold(uuid, public.payment_environment)
  from public, anon, authenticated;
grant execute on function public.service_restore_guest_taxed_reservation_hold(uuid, public.payment_environment)
  to service_role;

notify pgrst, 'reload schema';
