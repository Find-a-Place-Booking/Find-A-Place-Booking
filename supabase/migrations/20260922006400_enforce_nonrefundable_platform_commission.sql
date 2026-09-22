-- Find A Place Booking
-- Final non-refundable platform commission enforcement.
--
-- This is a database-level guard in addition to the host/guest policy text.
-- Guest refunds remain possible from the host-owned connected charge, but a
-- refund record may never request an application-fee/platform-commission refund.

begin;

-- This project has not processed live bookings yet. Normalize historical TEST
-- rows so the database constraint can represent the launch policy exactly.
update public.refunds
set
  platform_fee_refund_cents = 0,
  application_fee_refund_status = 'NOT_REQUIRED',
  application_fee_refund_id = null,
  application_fee_refund_error = null,
  updated_at = now()
where coalesce(platform_fee_refund_cents, 0) <> 0
   or application_fee_refund_status is distinct from 'NOT_REQUIRED';

alter table public.refunds
  drop constraint if exists refunds_platform_commission_nonrefundable;

alter table public.refunds
  add constraint refunds_platform_commission_nonrefundable
  check (coalesce(platform_fee_refund_cents, 0) = 0);

create or replace function public.enforce_nonrefundable_platform_commission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.platform_fee_refund_cents, 0) <> 0 then
    raise exception
      'Find A Place platform commission is non-refundable';
  end if;

  new.platform_fee_refund_cents := 0;
  new.application_fee_refund_status := 'NOT_REQUIRED';
  new.application_fee_refund_id := null;
  new.application_fee_refund_error := null;

  return new;
end;
$$;

drop trigger if exists refunds_enforce_nonrefundable_platform_commission
  on public.refunds;

create trigger refunds_enforce_nonrefundable_platform_commission
before insert or update of
  platform_fee_refund_cents,
  application_fee_refund_status,
  application_fee_refund_id,
  application_fee_refund_error
on public.refunds
for each row
execute function public.enforce_nonrefundable_platform_commission();

create or replace function public.record_application_fee_refund_result(
  target_refund_id uuid,
  target_status text,
  target_application_fee_refund_id text default null,
  target_error text default null
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

  if target_status <> 'NOT_REQUIRED' then
    raise exception
      'Application-fee refunds are disabled because Find A Place platform commission is non-refundable';
  end if;

  update public.refunds refunds
  set
    platform_fee_refund_cents = 0,
    application_fee_refund_status = 'NOT_REQUIRED',
    application_fee_refund_id = null,
    application_fee_refund_error = null,
    updated_at = now()
  where refunds.id = target_refund_id;

  if not found then
    raise exception 'Refund not found';
  end if;
end;
$$;

revoke all on function public.record_application_fee_refund_result(
  uuid,text,text,text
) from public, anon, authenticated;

grant execute on function public.record_application_fee_refund_result(
  uuid,text,text,text
) to service_role;

create or replace function public.nonrefundable_platform_commission_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'nonrefundable-platform-commission-064-v1'::text;
$$;

revoke all on function public.nonrefundable_platform_commission_version()
  from public;

grant execute on function public.nonrefundable_platform_commission_version()
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
