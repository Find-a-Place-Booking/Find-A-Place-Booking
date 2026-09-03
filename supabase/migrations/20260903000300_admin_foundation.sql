-- Find A Place Booking
-- Milestone 5: real admin operations foundation
--
-- Adds only the read/search/admin-partner-review primitives needed by the
-- internal workspace. Host/property CRUD, bookings, payments, calendars and
-- operational email systems remain intentionally out of scope.

begin;

create or replace function public.admin_has_any_role(required_roles public.admin_role[])
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
      and roles.role = any(required_roles)
      and admins.status = 'ACTIVE'
  );
$$;

create or replace function public.admin_search_hosts(
  search_term text default '',
  result_limit integer default 50
)
returns table (
  profile_id uuid,
  full_name text,
  email text,
  phone text,
  profile_created_at timestamptz,
  organization_id uuid,
  organization_name text,
  organization_status public.organization_status,
  member_role public.organization_member_role,
  membership_status public.membership_status,
  partner_status public.partner_status,
  commission_tier public.commission_tier
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_search text := trim(coalesce(search_term, ''));
  safe_limit integer := least(greatest(coalesce(result_limit, 50), 1), 100);
begin
  if not public.is_active_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    profiles.id,
    profiles.full_name,
    profiles.email,
    profiles.phone,
    profiles.created_at,
    organizations.id,
    organizations.name,
    organizations.status,
    members.role,
    members.status,
    organizations.partner_status,
    organizations.commission_tier
  from public.profiles as profiles
  left join public.organization_members as members
    on members.profile_id = profiles.id
  left join public.organizations as organizations
    on organizations.id = members.organization_id
  where (
      not exists (select 1 from public.admin_users admins where admins.profile_id = profiles.id)
      or members.id is not null
    )
    and (
      normalized_search = ''
      or coalesce(profiles.full_name, '') ilike '%' || normalized_search || '%'
    or coalesce(profiles.email, '') ilike '%' || normalized_search || '%'
    or coalesce(profiles.phone, '') ilike '%' || normalized_search || '%'
    or coalesce(organizations.name, '') ilike '%' || normalized_search || '%'
    or coalesce(organizations.contact_email, '') ilike '%' || normalized_search || '%'
      or coalesce(organizations.contact_phone, '') ilike '%' || normalized_search || '%'
    )
  order by profiles.created_at desc, organizations.name nulls last
  limit safe_limit;
end;
$$;


create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_active_admin() then
    raise exception 'Admin access required';
  end if;

  select jsonb_build_object(
    'host_profiles', (
      select count(*)
      from public.profiles profiles
      where not exists (
        select 1 from public.admin_users admins
        where admins.profile_id = profiles.id
      )
      or exists (
        select 1 from public.organization_members members
        where members.profile_id = profiles.id
      )
    ),
    'organizations', (select count(*) from public.organizations),
    'partner_pending', (
      select count(*) from public.organizations
      where partner_status = 'PARTNER_PENDING'
    ),
    'audit_events', (select count(*) from public.audit_logs)
  ) into result;

  return result;
end;
$$;

create or replace function public.review_partner_verification(
  target_organization_id uuid,
  approve boolean,
  verification_note text default null
)
returns table (
  organization_id uuid,
  partner_status public.partner_status,
  commission_tier public.commission_tier,
  effective_from timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.organizations%rowtype;
  after_row public.organizations%rowtype;
  cleaned_note text := nullif(trim(coalesce(verification_note, '')), '');
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.admin_has_any_role(array['SUPER_ADMIN', 'PARTNER_ADMIN']::public.admin_role[]) then
    raise exception 'Partner verification role required';
  end if;

  select *
  into before_row
  from public.organizations
  where id = target_organization_id
  for update;

  if not found then
    raise exception 'Organization not found';
  end if;

  if before_row.partner_status <> 'PARTNER_PENDING' then
    raise exception 'Organization is not pending partner verification';
  end if;

  if approve then
    update public.organizations
    set partner_status = 'VERIFIED',
        commission_tier = 'PARTNER_5',
        commission_effective_from = now(),
        partner_verified_by = actor_id,
        partner_verified_at = now(),
        partner_verification_note = cleaned_note,
        updated_at = now()
    where id = target_organization_id
    returning * into after_row;
  else
    update public.organizations
    set partner_status = 'REJECTED',
        commission_tier = 'STANDARD_7',
        partner_verified_by = null,
        partner_verified_at = null,
        partner_verification_note = cleaned_note,
        updated_at = now()
    where id = target_organization_id
    returning * into after_row;
  end if;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    before_state,
    after_state,
    metadata
  )
  values (
    actor_id,
    case when approve then 'partner_verification.approved' else 'partner_verification.kept_standard' end,
    'organization',
    target_organization_id,
    cleaned_note,
    to_jsonb(before_row),
    to_jsonb(after_row),
    jsonb_build_object('source', 'admin_partner_verification')
  );

  return query
  select
    after_row.id,
    after_row.partner_status,
    after_row.commission_tier,
    after_row.commission_effective_from;
end;
$$;

revoke all on function public.admin_has_any_role(public.admin_role[]) from public;
revoke all on function public.admin_search_hosts(text, integer) from public;
revoke all on function public.admin_dashboard_summary() from public;
revoke all on function public.review_partner_verification(uuid, boolean, text) from public;

grant execute on function public.admin_has_any_role(public.admin_role[]) to authenticated;
grant execute on function public.admin_search_hosts(text, integer) to authenticated;
grant execute on function public.admin_dashboard_summary() to authenticated;
grant execute on function public.review_partner_verification(uuid, boolean, text) to authenticated;

comment on function public.admin_search_hosts(text, integer) is
  'Admin-only host/account lookup across profiles and organization membership. Returns no booking/payment data because those systems do not exist yet.';

comment on function public.review_partner_verification(uuid, boolean, text) is
  'Atomically approves PARTNER_5 or keeps STANDARD_7 for a pending organization and writes an append-only audit log. Only SUPER_ADMIN and PARTNER_ADMIN may execute the decision.';

commit;
