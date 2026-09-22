-- Complete host-approved, no-refund cancellations in one transaction.
begin;

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

  if reservation_row.check_in - current_date >= 14 then
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

revoke all on function public.complete_host_cancellation_without_refund(
  uuid,uuid,text,uuid
) from public, anon, authenticated;
grant execute on function public.complete_host_cancellation_without_refund(
  uuid,uuid,text,uuid
) to service_role;

notify pgrst, 'reload schema';
commit;
