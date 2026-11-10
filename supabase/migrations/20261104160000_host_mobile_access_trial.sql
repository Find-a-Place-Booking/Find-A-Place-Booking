-- Find A Place Host mobile application: organization-level access state.
-- Additive and inert until the /api/mobile/v1/* routes are deployed.
-- No changes to lodging bookings, Stripe, fees or existing host web access.
create table if not exists public.host_mobile_access (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  trial_started_at timestamptz,
  trial_expires_at timestamptz,
  subscription_owner_profile_id uuid references public.profiles(id) on delete set null,
  subscription_expires_at timestamptz,
  subscription_checked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint host_mobile_trial_valid check (
    (trial_started_at is null and trial_expires_at is null)
    or (trial_started_at is not null and trial_expires_at > trial_started_at)
  )
);
create index if not exists host_mobile_subscription_owner_idx
  on public.host_mobile_access(subscription_owner_profile_id)
  where subscription_owner_profile_id is not null;
alter table public.host_mobile_access enable row level security;
revoke all on public.host_mobile_access from public, anon, authenticated;
grant select,insert,update on public.host_mobile_access to service_role;

create or replace function public.start_host_mobile_trial(
  target_organization_id uuid,
  target_profile_id uuid
) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  trial_end timestamptz;
  is_partner boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if not exists (
    select 1 from public.organization_members members
    where members.organization_id = target_organization_id
      and members.profile_id = target_profile_id
      and members.status = 'ACTIVE'
      and members.role = 'OWNER'
  ) then
    raise exception 'An active organization owner is required';
  end if;
  select (organizations.partner_status = 'VERIFIED' and organizations.commission_tier = 'PARTNER_5')
    into is_partner from public.organizations organizations
    where organizations.id = target_organization_id;
  if coalesce(is_partner,false) then
    raise exception 'Verified partners have included host mobile access';
  end if;
  insert into public.host_mobile_access(
    organization_id, trial_started_at, trial_expires_at
  ) values (
    target_organization_id, now(), now() + interval '30 days'
  ) on conflict(organization_id) do update set
    trial_started_at = now(),
    trial_expires_at = now() + interval '30 days',
    updated_at = now()
    where public.host_mobile_access.trial_started_at is null
  returning trial_expires_at into trial_end;
  if trial_end is null then raise exception 'This organization already used its mobile trial'; end if;
  return trial_end;
end;
$$;
revoke all on function public.start_host_mobile_trial(uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_host_mobile_trial(uuid,uuid) to service_role;
