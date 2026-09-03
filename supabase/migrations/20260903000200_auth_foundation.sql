-- Find A Place Booking
-- Milestone 4: authentication lifecycle + first RLS policies
--
-- Scope intentionally stops before host organizations/property CRUD.
-- Public host signup creates/maintains a profile; admin access remains an
-- explicit internal grant through admin_users/admin_role_assignments.

begin;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        phone = coalesce(public.profiles.phone, excluded.phone),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill profiles for any Auth users created while Milestone 3 was being tested.
insert into public.profiles (id, email, full_name, phone)
select
  users.id,
  users.email,
  nullif(users.raw_user_meta_data ->> 'full_name', ''),
  nullif(users.raw_user_meta_data ->> 'phone', '')
from auth.users as users
on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      phone = coalesce(public.profiles.phone, excluded.phone),
      updated_at = now();

create or replace function public.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users admins
    join public.admin_role_assignments roles
      on roles.admin_profile_id = admins.profile_id
    where admins.profile_id = (select auth.uid())
      and admins.status = 'ACTIVE'
  );
$$;

create or replace function public.has_admin_role(required_role public.admin_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_role_assignments roles
    join public.admin_users admins
      on admins.profile_id = roles.admin_profile_id
    where roles.admin_profile_id = (select auth.uid())
      and roles.role = required_role
      and admins.status = 'ACTIVE'
  );
$$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members members
    where members.organization_id = target_organization_id
      and members.profile_id = (select auth.uid())
      and members.status = 'ACTIVE'
  );
$$;

-- Foundation RLS. Later milestones add mutation policies only when the
-- corresponding host/admin workflow exists and is regression-tested.

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) or public.is_active_admin());


drop policy if exists organizations_select_member_or_admin on public.organizations;
create policy organizations_select_member_or_admin
on public.organizations
for select
to authenticated
using (public.is_organization_member(id) or public.is_active_admin());

drop policy if exists organization_members_select_self_or_admin on public.organization_members;
create policy organization_members_select_self_or_admin
on public.organization_members
for select
to authenticated
using (profile_id = (select auth.uid()) or public.is_active_admin());

drop policy if exists admin_users_select_self on public.admin_users;
create policy admin_users_select_self
on public.admin_users
for select
to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists admin_role_assignments_select_self on public.admin_role_assignments;
create policy admin_role_assignments_select_self
on public.admin_role_assignments
for select
to authenticated
using (admin_profile_id = (select auth.uid()));

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
on public.audit_logs
for select
to authenticated
using (public.is_active_admin());

comment on function public.is_active_admin() is
  'RLS-safe authorization helper. Admin access requires an ACTIVE admin_users record plus at least one admin role; auth alone never grants admin access.';

comment on function public.is_organization_member(uuid) is
  'RLS-safe organization membership helper reserved for host data policies introduced in later milestones.';

commit;
