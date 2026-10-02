begin;

create or replace function public.bridge_reservation_state_to_booking_tracking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  event_name_value text;
  stage_value text;
  success_value boolean;
  error_message_value text;
  outcome_value text;
  completed_value timestamptz;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.payment_status is distinct from old.payment_status
     or new.confirmed_at is distinct from old.confirmed_at
  then
    if new.status = 'CONFIRMED' or new.payment_status = 'SUCCEEDED' then
      event_name_value := 'booking_confirmed';
      stage_value := 'COMPLETE';
      success_value := true;
      outcome_value := 'CONFIRMED';
      completed_value := coalesce(new.confirmed_at, now());
    elsif new.status = 'PAYMENT_FAILED' or new.payment_status = 'FAILED' then
      event_name_value := 'payment_failed';
      stage_value := 'PAYMENT';
      success_value := false;
      error_message_value := 'Payment failed before booking confirmation.';
    elsif new.status = 'EXPIRED' then
      event_name_value := 'reservation_expired';
      stage_value := 'HOLD';
      success_value := false;
      outcome_value := 'EXPIRED';
    elsif new.status = 'CANCELLED' then
      event_name_value := 'reservation_cancelled';
      stage_value := 'COMPLETE';
      success_value := true;
      outcome_value := 'CANCELLED';
      completed_value := coalesce(new.cancelled_at, now());
    end if;
  end if;

  if event_name_value is null then
    return new;
  end if;

  insert into public.booking_attempt_events (
    attempt_id,
    unit_id,
    reservation_id,
    event_name,
    stage,
    success,
    error_message,
    path,
    metadata,
    created_at
  )
  select
    attempts.id,
    new.unit_id,
    new.id,
    event_name_value,
    stage_value,
    success_value,
    error_message_value,
    '/database/reservations',
    jsonb_build_object(
      'source', 'reservation_state_trigger',
      'reservation_status', new.status,
      'payment_status', new.payment_status
    ),
    now()
  from public.booking_attempts attempts
  where attempts.reservation_id = new.id
    and not exists (
      select 1
      from public.booking_attempt_events existing
      where existing.attempt_id = attempts.id
        and existing.reservation_id = new.id
        and existing.event_name = event_name_value
        and existing.metadata ->> 'source' = 'reservation_state_trigger'
    );

  update public.booking_attempts attempts
  set
    current_stage = stage_value,
    last_event = event_name_value,
    last_seen_at = now(),
    updated_at = now(),
    outcome = coalesce(outcome_value, attempts.outcome),
    completed_at = coalesce(completed_value, attempts.completed_at)
  where attempts.reservation_id = new.id;

  return new;
end;
$function$;

drop trigger if exists reservations_booking_tracking_bridge
on public.reservations;

create trigger reservations_booking_tracking_bridge
after update of status, payment_status, confirmed_at, cancelled_at
on public.reservations
for each row
execute function public.bridge_reservation_state_to_booking_tracking();

comment on function public.bridge_reservation_state_to_booking_tracking() is
  'Mirrors final reservation/payment state changes into the anonymous booking funnel so confirmation/failure is retained even if the guest closes the browser.';

commit;
