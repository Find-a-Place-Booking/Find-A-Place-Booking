-- Find A Place Booking
-- Cancellation must release inventory immediately when the host approves it.
-- Refund processing/reconciliation is separate from reservation cancellation.

begin;

create or replace function public.approve_host_cancellation_with_refund(
  target_reservation_id uuid,
  target_request_id uuid,
  target_refund_id uuid,
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
  request_row public.reservation_cancellation_requests%rowtype;
  refund_reservation_id uuid;
  refund_status public.refund_status;
  now_value timestamptz := now();
  released_blocks integer := 0;
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

  if reservation_row.status not in ('CONFIRMED','CANCELLED') then
    raise exception 'Only a confirmed reservation can be cancelled';
  end if;

  select requests.*
  into request_row
  from public.reservation_cancellation_requests requests
  where requests.id = target_request_id
    and requests.reservation_id = target_reservation_id
  for update;

  if not found then
    raise exception 'Cancellation request not found';
  end if;

  if request_row.status not in ('REQUESTED','APPROVED','COMPLETED') then
    raise exception 'Cancellation request cannot be approved from its current status';
  end if;

  select refunds.reservation_id, refunds.status
  into refund_reservation_id, refund_status
  from public.refunds refunds
  where refunds.id = target_refund_id
  for update;

  if not found or refund_reservation_id <> target_reservation_id then
    raise exception 'Refund request does not belong to this reservation';
  end if;

  -- Idempotent retry support: if another request already cancelled the booking,
  -- still make sure no internal reservation block remains active.
  update public.reservations reservations
  set
    status = 'CANCELLED',
    cancelled_at = coalesce(reservations.cancelled_at, now_value),
    hold_expires_at = null,
    updated_at = now_value
  where reservations.id = target_reservation_id;

  update public.availability_blocks blocks
  set
    state = 'CANCELLED',
    expires_at = null,
    updated_at = now_value,
    metadata = blocks.metadata || jsonb_build_object(
      'cancelled_by_request_id', target_request_id,
      'refund_id', target_refund_id,
      'cancellation_released_at', now_value
    )
  where blocks.reservation_id = target_reservation_id
    and blocks.state = 'ACTIVE'
    and blocks.block_type in ('INTERNAL_HOLD','INTERNAL_RESERVATION');

  get diagnostics released_blocks = row_count;

  update public.reservation_cancellation_requests requests
  set
    status = case
      when refund_status = 'SUCCEEDED' then 'COMPLETED'
      else 'APPROVED'
    end,
    host_response = nullif(trim(coalesce(target_host_response, '')), ''),
    responded_by = target_responded_by,
    responded_at = coalesce(requests.responded_at, now_value),
    completed_at = case
      when refund_status = 'SUCCEEDED'
        then coalesce(requests.completed_at, now_value)
      else requests.completed_at
    end,
    metadata = requests.metadata || jsonb_build_object(
      'resolution', 'CANCELLED_REFUND',
      'reservation_cancelled', true,
      'calendar_released', true,
      'calendar_released_at', now_value,
      'refund_id', target_refund_id,
      'refund_status_at_cancellation', refund_status
    ),
    updated_at = now_value
  where requests.id = target_request_id;

  insert into public.reservation_events (
    reservation_id,
    event_type,
    actor_profile_id,
    metadata
  ) values (
    target_reservation_id,
    'HOST_CANCELLATION_RELEASED_CALENDAR',
    target_responded_by,
    jsonb_build_object(
      'cancellation_request_id', target_request_id,
      'refund_id', target_refund_id,
      'refund_status', refund_status,
      'released_block_count', released_blocks,
      'reservation_status', 'CANCELLED'
    )
  );

  return jsonb_build_object(
    'reservation_status', 'CANCELLED',
    'calendar_released', true,
    'released_block_count', released_blocks,
    'refund_status', refund_status
  );
end;
$$;

revoke all on function public.approve_host_cancellation_with_refund(
  uuid,uuid,uuid,text,uuid
) from public, anon, authenticated;

grant execute on function public.approve_host_cancellation_with_refund(
  uuid,uuid,uuid,text,uuid
) to service_role;

-- Repair cancellation requests approved under the earlier workflow. Those
-- requests represented a host decision to cancel, but the previous code could
-- leave the reservation CONFIRMED until Stripe finished the refund.
with approved_cancellations as (
  select distinct requests.reservation_id
  from public.reservation_cancellation_requests requests
  where requests.status in ('APPROVED','COMPLETED')
)
update public.reservations reservations
set
  status = 'CANCELLED',
  cancelled_at = coalesce(reservations.cancelled_at, now()),
  hold_expires_at = null,
  updated_at = now()
from approved_cancellations approved
where reservations.id = approved.reservation_id
  and reservations.status = 'CONFIRMED';

with approved_cancellations as (
  select distinct requests.reservation_id
  from public.reservation_cancellation_requests requests
  where requests.status in ('APPROVED','COMPLETED')
)
update public.availability_blocks blocks
set
  state = 'CANCELLED',
  expires_at = null,
  updated_at = now(),
  metadata = blocks.metadata || jsonb_build_object(
    'repaired_by_migration', '061',
    'cancellation_released_at', now()
  )
from approved_cancellations approved
where blocks.reservation_id = approved.reservation_id
  and blocks.state = 'ACTIVE'
  and blocks.block_type in ('INTERNAL_HOLD','INTERNAL_RESERVATION');

update public.reservation_cancellation_requests requests
set
  metadata = requests.metadata || jsonb_build_object(
    'reservation_cancelled', true,
    'calendar_released', true,
    'history_repaired_by_migration', '061'
  ),
  updated_at = now()
where requests.status in ('APPROVED','COMPLETED');

create or replace function public.cancellation_release_history_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'cancellation-release-history-061-v1'::text;
$$;

revoke all on function public.cancellation_release_history_version()
  from public;

grant execute on function public.cancellation_release_history_version()
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
