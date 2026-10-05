-- Find A Place Booking
-- Public host profiles use the existing organization/profile identity created
-- during host onboarding. This does not create a second host-profile data model.
--
-- Public profile intentionally exposes only:
--   - public host/business name
--   - public host bio
--   - host profile image
--   - published stays
--   - published verified reviews
--
-- Private contact email, phone, business address/location, Stripe/payment,
-- legal/account and other onboarding data are never exposed by the public page.

begin;

alter table public.organizations
  add column if not exists public_host_slug text;

comment on column public.organizations.public_host_slug is
  'Stable guest-facing URL slug for the public host profile. Assigned from the public host name and retained when the display name changes.';

create or replace function public.assign_public_host_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  base_slug text;
  candidate text;
  suffix text;
  attempt integer := 0;
begin
  if nullif(trim(coalesce(new.public_host_slug, '')), '') is not null then
    new.public_host_slug := lower(trim(new.public_host_slug));
    return new;
  end if;

  if nullif(trim(coalesce(new.public_host_name, '')), '') is null then
    return new;
  end if;

  base_slug := lower(trim(new.public_host_name));
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '(^-+|-+$)', '', 'g');

  if base_slug = '' then
    base_slug := 'host';
  end if;

  base_slug := left(base_slug, 72);
  candidate := base_slug;
  suffix := left(replace(new.id::text, '-', ''), 8);

  while exists (
    select 1
    from public.organizations existing
    where existing.id <> new.id
      and existing.public_host_slug is not null
      and lower(existing.public_host_slug) = lower(candidate)
  ) loop
    attempt := attempt + 1;
    candidate :=
      left(base_slug, greatest(20, 68 - length(attempt::text)))
      || '-'
      || suffix
      || case when attempt > 1 then '-' || attempt::text else '' end;
  end loop;

  new.public_host_slug := candidate;
  return new;
end;
$function$;

drop trigger if exists organizations_assign_public_host_slug
  on public.organizations;

create trigger organizations_assign_public_host_slug
before insert or update of public_host_name, public_host_slug
on public.organizations
for each row
execute function public.assign_public_host_slug();

update public.organizations organizations
set public_host_name = coalesce(
  nullif(trim(organizations.public_host_name), ''),
  nullif(trim((
    select drafts.form_data ->> 'hostName'
    from public.host_onboarding_drafts drafts
    where drafts.organization_id = organizations.id
    order by drafts.updated_at desc
    limit 1
  )), ''),
  nullif(trim(organizations.name), '')
)
where nullif(trim(coalesce(organizations.public_host_name, '')), '') is null;

update public.organizations organizations
set public_host_bio = nullif(trim((
  select drafts.form_data ->> 'publicHostBio'
  from public.host_onboarding_drafts drafts
  where drafts.organization_id = organizations.id
  order by drafts.updated_at desc
  limit 1
)), '')
where nullif(trim(coalesce(organizations.public_host_bio, '')), '') is null
  and exists (
    select 1
    from public.host_onboarding_drafts drafts
    where drafts.organization_id = organizations.id
      and nullif(trim(coalesce(drafts.form_data ->> 'publicHostBio', '')), '') is not null
  );

update public.organizations
set public_host_name = public_host_name
where public_host_slug is null
  and nullif(trim(coalesce(public_host_name, '')), '') is not null;

create unique index if not exists organizations_public_host_slug_lower_uidx
  on public.organizations (lower(public_host_slug))
  where public_host_slug is not null;

alter table public.organizations
  drop constraint if exists organizations_public_host_slug_format_check;

alter table public.organizations
  add constraint organizations_public_host_slug_format_check
  check (
    public_host_slug is null
    or public_host_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  );

create table if not exists public.host_profile_inquiries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  property_id uuid
    references public.properties(id) on delete set null,
  guest_name text not null,
  guest_email text not null,
  message text not null,
  status text not null default 'NEW'
    check (status in ('NEW','READ','REPLIED','CLOSED')),
  host_reply text,
  read_by_host_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_profile_inquiries_guest_name_length
    check (char_length(guest_name) between 2 and 120),
  constraint host_profile_inquiries_guest_email_length
    check (char_length(guest_email) between 3 and 320),
  constraint host_profile_inquiries_message_length
    check (char_length(message) between 10 and 3000),
  constraint host_profile_inquiries_reply_length
    check (host_reply is null or char_length(host_reply) between 1 and 4000)
);

create index if not exists host_profile_inquiries_org_created_idx
  on public.host_profile_inquiries (organization_id, created_at desc);

create index if not exists host_profile_inquiries_unread_idx
  on public.host_profile_inquiries (organization_id, read_by_host_at)
  where read_by_host_at is null;

alter table public.host_profile_inquiries enable row level security;

drop policy if exists host_members_read_profile_inquiries
  on public.host_profile_inquiries;

create policy host_members_read_profile_inquiries
on public.host_profile_inquiries
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members members
    where members.organization_id = host_profile_inquiries.organization_id
      and members.profile_id = (select auth.uid())
      and members.status = 'ACTIVE'
      and members.role in ('OWNER','MANAGER')
  )
);

drop policy if exists host_members_update_profile_inquiries
  on public.host_profile_inquiries;

create policy host_members_update_profile_inquiries
on public.host_profile_inquiries
for update
to authenticated
using (
  exists (
    select 1
    from public.organization_members members
    where members.organization_id = host_profile_inquiries.organization_id
      and members.profile_id = (select auth.uid())
      and members.status = 'ACTIVE'
      and members.role in ('OWNER','MANAGER')
  )
)
with check (
  exists (
    select 1
    from public.organization_members members
    where members.organization_id = host_profile_inquiries.organization_id
      and members.profile_id = (select auth.uid())
      and members.status = 'ACTIVE'
      and members.role in ('OWNER','MANAGER')
  )
);

revoke all on public.host_profile_inquiries from anon;
grant select, update on public.host_profile_inquiries to authenticated;
grant all on public.host_profile_inquiries to service_role;

notify pgrst, 'reload schema';

commit;
