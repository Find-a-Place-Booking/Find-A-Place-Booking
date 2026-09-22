-- Find A Place Booking
-- Keep booking chat separate from structured guest change/cancellation requests.
-- Change requests are host-reviewed records; they do not mutate dates, guests,
-- pricing, availability or payment until a later reservation-change workflow does so.

begin;

create table if not exists public.reservation_change_requests (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  requested_by text not null default 'GUEST'
    check (requested_by in ('GUEST','HOST','ADMIN')),
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED','APPROVED','DECLINED','WITHDRAWN','COMPLETED')),
  request_text text not null,
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

create index if not exists reservation_change_requests_reservation_idx
  on public.reservation_change_requests(reservation_id, requested_at desc);

create unique index if not exists reservation_change_requests_one_active
  on public.reservation_change_requests(reservation_id)
  where status = 'REQUESTED';

drop trigger if exists reservation_change_requests_set_updated_at
  on public.reservation_change_requests;
create trigger reservation_change_requests_set_updated_at
before update on public.reservation_change_requests
for each row execute function public.set_updated_at();

alter table public.reservation_change_requests enable row level security;

drop policy if exists reservation_change_requests_select_host_or_admin
  on public.reservation_change_requests;
create policy reservation_change_requests_select_host_or_admin
on public.reservation_change_requests
for select to authenticated
using (
  public.is_active_admin()
  or exists (
    select 1
    from public.reservations reservations
    where reservations.id = reservation_change_requests.reservation_id
      and public.can_manage_organization(reservations.organization_id)
  )
);

-- Request mutations are server-side only after guest-token or host access checks.
drop policy if exists reservation_change_requests_update_host_or_admin
  on public.reservation_change_requests;

create or replace function public.separate_booking_requests_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'separate-booking-requests-055-v1'::text;
$$;

revoke all on function public.separate_booking_requests_version() from public;
grant execute on function public.separate_booking_requests_version()
  to anon, authenticated;

comment on table public.reservation_change_requests is
  'Guest reservation-change requests kept separate from ordinary booking chat. Approval records host agreement only and does not automatically mutate reservation dates, guests, pricing or payment.';

notify pgrst, 'reload schema';

commit;
