-- Find A Place Booking
-- Host/guest cancellation request workflow for direct-charge bookings.
--
-- The guest can request cancellation from the host. The request itself does
-- not cancel the reservation or create a refund. The host decides whether to
-- approve or decline the request. If approved through Find A Place, the
-- platform executes the host-authorized refund against the host's connected
-- processor account so the booking/payment records stay synchronized.

begin;

create table if not exists public.reservation_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  requested_by text not null default 'GUEST'
    check (requested_by in ('GUEST','HOST','ADMIN')),
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED','APPROVED','DECLINED','WITHDRAWN','COMPLETED')),
  reason text,
  host_response text,
  responded_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservation_cancellation_requests_reservation_idx
  on public.reservation_cancellation_requests(reservation_id, requested_at desc);

create unique index if not exists reservation_cancellation_requests_one_active
  on public.reservation_cancellation_requests(reservation_id)
  where status in ('REQUESTED','APPROVED');

drop trigger if exists reservation_cancellation_requests_set_updated_at
  on public.reservation_cancellation_requests;
create trigger reservation_cancellation_requests_set_updated_at
before update on public.reservation_cancellation_requests
for each row execute function public.set_updated_at();

alter table public.reservation_cancellation_requests enable row level security;

drop policy if exists reservation_cancellation_requests_select_host_or_admin
  on public.reservation_cancellation_requests;
create policy reservation_cancellation_requests_select_host_or_admin
on public.reservation_cancellation_requests
for select to authenticated
using (
  public.is_active_admin()
  or exists (
    select 1
    from public.reservations reservations
    where reservations.id = reservation_cancellation_requests.reservation_id
      and public.can_manage_organization(reservations.organization_id)
  )
);

-- Hosts can read requests through RLS, but mutations are intentionally kept
-- behind server actions after host access is verified. This prevents a browser
-- client from directly manufacturing approval/completion states.
drop policy if exists reservation_cancellation_requests_update_host_or_admin
  on public.reservation_cancellation_requests;

-- A host-owned cancellation model needs an explicit property cancellation/refund
-- rule. Generic labels such as "flexible" are not enough for a guest to know
-- what the host has actually agreed to apply.
create or replace function public.property_submission_issues(target_property_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  issues text[] := '{}'::text[];
  property_row public.properties%rowtype;
  unit_row public.property_units%rowtype;
  rate_row public.unit_rate_settings%rowtype;
  image_count integer := 0;
  cancellation_text text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.can_access_property(target_property_id) then raise exception 'Property access required'; end if;

  select properties.* into property_row
  from public.properties properties
  where properties.id = target_property_id;
  if not found then raise exception 'Property not found'; end if;

  select units.* into unit_row
  from public.property_units units
  where units.property_id = target_property_id and units.is_primary;

  if nullif(trim(coalesce(property_row.name, '')), '') is null then issues := array_append(issues, 'Property name'); end if;
  if nullif(trim(coalesce(property_row.description, '')), '') is null then issues := array_append(issues, 'Description'); end if;
  if nullif(trim(coalesce(property_row.property_type, '')), '') is null then issues := array_append(issues, 'Property type'); end if;
  if nullif(trim(coalesce(property_row.public_area, property_row.city, '')), '') is null then issues := array_append(issues, 'Public area or city'); end if;
  if nullif(trim(coalesce(property_row.region_code, '')), '') is null then issues := array_append(issues, 'State / region'); end if;

  if unit_row.id is null then
    issues := array_append(issues, 'Primary rentable unit');
    return issues;
  end if;

  if not unit_row.is_active then issues := array_append(issues, 'Active rentable unit'); end if;
  if unit_row.max_guests is null or unit_row.max_guests < 1 then issues := array_append(issues, 'Maximum guests'); end if;

  cancellation_text := lower(trim(coalesce(unit_row.cancellation_policy, '')));
  if cancellation_text = ''
     or cancellation_text in ('flexible','moderate','firm','strict')
     or char_length(cancellation_text) < 20 then
    issues := array_append(
      issues,
      'Specific cancellation/refund terms (not just a policy label)'
    );
  end if;

  select rates.* into rate_row
  from public.unit_rate_settings rates
  where rates.unit_id = unit_row.id;
  if rate_row.weeknight_cents is null or rate_row.weeknight_cents < 1 then issues := array_append(issues, 'Weeknight rate'); end if;

  select count(*) into image_count
  from public.property_images images
  where images.unit_id = unit_row.id;
  if image_count < 1 then issues := array_append(issues, 'At least one property photo'); end if;

  return issues;
end;
$$;

comment on function public.property_submission_issues(uuid) is
  'Host listing readiness guard. Requires explicit cancellation/refund terms because ordinary cancellation decisions are host-managed.';

-- Reassert that direct-charge bookings do not create Find A Place-managed
-- bank-payout rows. Historical payout records remain untouched for audit.
drop trigger if exists payments_sync_reservation_payout on public.payments;
drop trigger if exists refunds_sync_reservation_payout on public.refunds;

create or replace function public.host_guest_cancellation_requests_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'host-guest-cancellation-requests-052-v1'::text;
$$;

revoke all on function public.host_guest_cancellation_requests_version() from public;
grant execute on function public.host_guest_cancellation_requests_version()
  to anon, authenticated;

comment on table public.reservation_cancellation_requests is
  'Guest/host cancellation-request workflow. A request is not itself a cancellation or refund.';

notify pgrst, 'reload schema';

commit;
