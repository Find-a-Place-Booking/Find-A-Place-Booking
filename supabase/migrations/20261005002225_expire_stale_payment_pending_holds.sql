-- Production migration already applied on 2026-10-04/05.
-- Expired checkout attempts remain auditable, but no longer remain "open".
-- This intentionally preserves payment rows and reservation history.

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
      and reservations.hold_expires_at <= now()
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
      and blocks.expires_at <= now()
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
      and reservations.hold_expires_at <= now()
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
        'payment_record_preserved', true
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

create or replace function public.expire_reservation_holds(
  target_unit_id uuid default null::uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  expired_ids uuid[] := '{}'::uuid[];
  changed_count integer := 0;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if target_unit_id is not null
     and not public.is_active_admin()
     and not public.can_manage_unit_calendar(target_unit_id)
  then
    raise exception 'Calendar manager access required';
  end if;

  select coalesce(array_agg(reservations.id), '{}'::uuid[])
  into expired_ids
  from public.reservations reservations
  where reservations.status in ('HOLD', 'PAYMENT_PENDING', 'PAYMENT_FAILED')
    and reservations.hold_expires_at is not null
    and reservations.hold_expires_at <= now()
    and reservations.payment_status::text not in ('SUCCEEDED', 'PROCESSING')
    and (target_unit_id is null or reservations.unit_id = target_unit_id)
    and (
      public.is_active_admin()
      or public.can_manage_organization(reservations.organization_id)
    )
    and not exists (
      select 1
      from public.payments payments
      where payments.reservation_id = reservations.id
        and payments.status::text in ('SUCCEEDED', 'PROCESSING')
    );

  if cardinality(expired_ids) = 0 then
    return 0;
  end if;

  update public.reservations reservations
  set status = 'EXPIRED',
      updated_at = now()
  where reservations.id = any(expired_ids);
  get diagnostics changed_count = row_count;

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
    (select auth.uid()),
    jsonb_build_object(
      'expired_at', now(),
      'source', 'expire_reservation_holds',
      'payment_record_preserved', true
    )
  from unnest(expired_ids) as expired(reservation_id);

  return changed_count;
end;
$function$;
