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

  if new.guest_email is null or new.checkout_recovery_sent_at is not null then
    return new;
  end if;

  if new.status = 'PAYMENT_PENDING' then
    -- Do not send an "abandoned checkout" email while a guest may still be
    -- completing Stripe / 3DS. Wait until the payment hold has actually ended.
    new.checkout_recovery_eligible_at :=
      greatest(coalesce(new.hold_expires_at, now()), now()) + interval '5 minutes';
  elsif new.status = 'HOLD' and new.checkout_recovery_eligible_at is null then
    new.checkout_recovery_eligible_at := now() + interval '8 minutes';
  elsif new.status in ('PAYMENT_FAILED', 'EXPIRED')
        and new.checkout_recovery_eligible_at is null then
    new.checkout_recovery_eligible_at := now() + interval '5 minutes';
  end if;

  return new;
end;
$function$;

create or replace function public.check_unit_availability(
  target_unit_id uuid,
  requested_check_in date,
  requested_check_out date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  public_unit boolean := false;
  conflict_count integer := 0;
begin
  if requested_check_in is null or requested_check_out is null then
    raise exception 'Check-in and check-out are required';
  end if;
  if requested_check_out <= requested_check_in then
    raise exception 'Check-out must be after check-in';
  end if;

  select exists (
    select 1
    from public.property_units units
    join public.properties properties on properties.id = units.property_id
    where units.id = target_unit_id
      and units.is_active
      and properties.status = 'PUBLISHED'
  ) into public_unit;

  if actor_id is null and not public_unit then
    raise exception 'Published unit required';
  end if;
  if actor_id is not null
     and not public_unit
     and not public.can_access_unit(target_unit_id) then
    raise exception 'Unit access required';
  end if;

  select count(*)::integer
  into conflict_count
  from public.availability_blocks blocks
  where blocks.unit_id = target_unit_id
    and blocks.state = 'ACTIVE'
    and blocks.start_date < requested_check_out
    and blocks.end_date > requested_check_in
    and (
      blocks.block_type <> 'INTERNAL_HOLD'
      or blocks.expires_at is null
      or blocks.expires_at > now()
      or (
        blocks.expires_at > now() - interval '5 minutes'
        and exists (
          select 1
          from public.reservations reservations
          where reservations.id = blocks.reservation_id
            and reservations.status = 'PAYMENT_PENDING'
            and reservations.payment_status::text = 'REQUIRES_ACTION'
        )
      )
    );

  return jsonb_build_object(
    'unit_id', target_unit_id,
    'check_in', requested_check_in,
    'check_out', requested_check_out,
    'available', conflict_count = 0,
    'conflicting_block_count', conflict_count,
    'date_semantics', '[check_in, check_out)'
  );
end;
$function$;

create or replace function public.service_expire_abandoned_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  candidate_ids uuid[] := '{}'::uuid[];
  expired_ids uuid[] := '{}'::uuid[];
  changed_count integer := 0;
begin
  select coalesce(array_agg(candidate.id), '{}'::uuid[])
  into candidate_ids
  from (
    select reservations.id
    from public.reservations reservations
    where reservations.status in ('HOLD', 'PAYMENT_PENDING', 'PAYMENT_FAILED')
      and reservations.hold_expires_at is not null
      and (
        (
          reservations.status = 'PAYMENT_PENDING'
          and reservations.hold_expires_at <= now() - interval '5 minutes'
        )
        or (
          reservations.status <> 'PAYMENT_PENDING'
          and reservations.hold_expires_at <= now()
        )
      )
      and reservations.payment_status::text not in ('SUCCEEDED', 'PROCESSING')
      and not exists (
        select 1
        from public.payments payments
        where payments.reservation_id = reservations.id
          and payments.status::text in ('SUCCEEDED', 'PROCESSING')
      )
    for update skip locked
  ) candidate;

  if cardinality(candidate_ids) = 0 then
    update public.availability_blocks blocks
    set state = 'CANCELLED',
        updated_at = now()
    where blocks.block_type = 'INTERNAL_HOLD'
      and blocks.state = 'ACTIVE'
      and blocks.expires_at is not null
      and (
        blocks.expires_at <= now()
        and not exists (
          select 1
          from public.reservations reservations
          where reservations.id = blocks.reservation_id
            and reservations.status = 'PAYMENT_PENDING'
            and reservations.payment_status::text = 'REQUIRES_ACTION'
            and blocks.expires_at > now() - interval '5 minutes'
        )
      )
      and exists (
        select 1
        from public.reservations reservations
        where reservations.id = blocks.reservation_id
          and reservations.status in ('EXPIRED', 'CANCELLED')
      );

    return 0;
  end if;

  with expired as (
    update public.reservations reservations
    set status = 'EXPIRED',
        updated_at = now()
    where reservations.id = any(candidate_ids)
      and reservations.status in ('HOLD', 'PAYMENT_PENDING', 'PAYMENT_FAILED')
      and (
        (
          reservations.status = 'PAYMENT_PENDING'
          and reservations.hold_expires_at <= now() - interval '5 minutes'
        )
        or (
          reservations.status <> 'PAYMENT_PENDING'
          and reservations.hold_expires_at <= now()
        )
      )
      and reservations.payment_status::text not in ('SUCCEEDED', 'PROCESSING')
      and not exists (
        select 1
        from public.payments payments
        where payments.reservation_id = reservations.id
          and payments.status::text in ('SUCCEEDED', 'PROCESSING')
      )
    returning reservations.id
  )
  select coalesce(array_agg(expired.id), '{}'::uuid[])
  into expired_ids
  from expired;

  changed_count := cardinality(expired_ids);

  if changed_count > 0 then
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

    insert into public.reservation_events (
      reservation_id,
      event_type,
      actor_profile_id,
      metadata
    )
    select
      expired.reservation_id,
      'HOLD_EXPIRED',
      null,
      jsonb_build_object(
        'expired_at', now(),
        'source', 'service_expire_abandoned_holds',
        'payment_record_preserved', true,
        'payment_confirmation_grace_minutes', 5
      )
    from unnest(expired_ids) as expired(reservation_id);
  end if;

  update public.availability_blocks blocks
  set state = 'CANCELLED',
      updated_at = now()
  where blocks.block_type = 'INTERNAL_HOLD'
    and blocks.state = 'ACTIVE'
    and blocks.expires_at is not null
    and blocks.expires_at <= now()
    and exists (
      select 1
      from public.reservations reservations
      where reservations.id = blocks.reservation_id
        and reservations.status in ('EXPIRED', 'CANCELLED')
    );

  return changed_count;
end;
$function$;

notify pgrst, 'reload schema';
