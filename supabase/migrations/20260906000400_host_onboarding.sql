-- Find A Place Booking
-- Milestone 6: real host organizations + persisted onboarding
--
-- Creates the first real host-owned organization automatically, persists the
-- stabilized onboarding draft, and makes partner claims real without allowing
-- hosts to self-grant PARTNER_5. Property/listing tables remain out of scope.

begin;

create type public.host_onboarding_status as enum (
  'IN_PROGRESS',
  'READY_FOR_PROPERTY'
);

create type public.partner_claim_record_status as enum (
  'PENDING',
  'VERIFIED',
  'REJECTED',
  'WITHDRAWN'
);

alter table public.organizations
  add column primary_contact_name text,
  add column business_location text,
  add column onboarding_ready_at timestamptz;

create table public.host_onboarding_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  current_step smallint not null default 0 check (current_step between 0 and 10),
  status public.host_onboarding_status not null default 'IN_PROGRESS',
  form_data jsonb not null default '{}'::jsonb check (jsonb_typeof(form_data) = 'object'),
  amenities text[] not null default '{}'::text[],
  policies text[] not null default '{}'::text[],
  photo_names text[] not null default '{}'::text[],
  authority_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.partner_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  business_name text,
  owner_name text,
  email text,
  phone text,
  status public.partner_claim_record_status not null default 'PENDING',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index host_onboarding_owner_idx
  on public.host_onboarding_drafts(owner_profile_id);

create index host_onboarding_status_idx
  on public.host_onboarding_drafts(status, updated_at desc);

create index partner_claims_status_idx
  on public.partner_claims(status, updated_at asc);

create trigger host_onboarding_drafts_set_updated_at
before update on public.host_onboarding_drafts
for each row execute function public.set_updated_at();

create trigger partner_claims_set_updated_at
before update on public.partner_claims
for each row execute function public.set_updated_at();

alter table public.host_onboarding_drafts enable row level security;
alter table public.partner_claims enable row level security;

create policy host_onboarding_select_member_or_admin
on public.host_onboarding_drafts
for select
to authenticated
using (public.is_organization_member(organization_id) or public.is_active_admin());

create policy partner_claims_select_member_or_admin
on public.partner_claims
for select
to authenticated
using (public.is_organization_member(organization_id) or public.is_active_admin());

create or replace function public.ensure_host_onboarding()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  host_profile public.profiles%rowtype;
  target_organization_id uuid;
  organization_name text;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select members.organization_id
  into target_organization_id
  from public.organization_members members
  join public.organizations organizations
    on organizations.id = members.organization_id
  where members.profile_id = actor_id
    and members.role = 'OWNER'
    and members.status = 'ACTIVE'
    and organizations.status <> 'ARCHIVED'
  order by members.created_at asc
  limit 1;

  if target_organization_id is null then
    select * into host_profile
    from public.profiles
    where id = actor_id;

    if not found then
      raise exception 'Profile not found';
    end if;

    organization_name := nullif(trim(coalesce(host_profile.full_name, '')), '');
    if organization_name is null then
      organization_name := split_part(coalesce(host_profile.email, 'Host'), '@', 1);
    end if;

    insert into public.organizations (
      name,
      contact_email,
      contact_phone,
      primary_contact_name,
      status,
      partner_status,
      commission_tier
    ) values (
      left(organization_name, 160),
      nullif(lower(trim(coalesce(host_profile.email, ''))), ''),
      nullif(trim(coalesce(host_profile.phone, '')), ''),
      nullif(trim(coalesce(host_profile.full_name, '')), ''),
      'ONBOARDING',
      'NOT_CLAIMED',
      'STANDARD_7'
    )
    returning id into target_organization_id;

    insert into public.organization_members (
      organization_id,
      profile_id,
      role,
      status
    ) values (
      target_organization_id,
      actor_id,
      'OWNER',
      'ACTIVE'
    );

    insert into public.audit_logs (
      actor_profile_id,
      action,
      entity_type,
      entity_id,
      reason,
      metadata
    ) values (
      actor_id,
      'host_organization.created',
      'organization',
      target_organization_id,
      'Host onboarding initialized.',
      jsonb_build_object('source', 'host_onboarding')
    );
  end if;

  insert into public.host_onboarding_drafts (
    organization_id,
    owner_profile_id
  ) values (
    target_organization_id,
    actor_id
  )
  on conflict (organization_id) do nothing;

  return target_organization_id;
end;
$$;

create or replace function public.save_host_onboarding(
  target_organization_id uuid,
  target_step integer,
  draft_form jsonb,
  selected_amenities text[] default '{}'::text[],
  selected_policies text[] default '{}'::text[],
  selected_photo_names text[] default '{}'::text[],
  confirmed_authority boolean default false
)
returns table (
  organization_id uuid,
  partner_status public.partner_status,
  commission_tier public.commission_tier,
  onboarding_status public.host_onboarding_status,
  saved_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_org public.organizations%rowtype;
  after_org public.organizations%rowtype;
  normalized_step integer := least(greatest(coalesce(target_step, 0), 0), 10);
  partner_answer text;
  next_onboarding_status public.host_onboarding_status;
  host_name text;
  contact_name text;
  contact_email text;
  contact_phone text;
  business_location_value text;
  claim_business text;
  claim_owner text;
  claim_email text;
  claim_phone text;
  previous_partner_status public.partner_status;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(draft_form) <> 'object' then
    raise exception 'Invalid onboarding payload';
  end if;

  if octet_length(draft_form::text) > 60000 then
    raise exception 'Onboarding payload is too large';
  end if;

  if coalesce(array_length(selected_amenities, 1), 0) > 100
    or coalesce(array_length(selected_policies, 1), 0) > 100
    or coalesce(array_length(selected_photo_names, 1), 0) > 24 then
    raise exception 'Onboarding selection limit exceeded';
  end if;

  if not exists (
    select 1
    from public.organization_members members
    where members.organization_id = target_organization_id
      and members.profile_id = actor_id
      and members.status = 'ACTIVE'
      and members.role in ('OWNER', 'MANAGER')
  ) then
    raise exception 'Organization owner or manager access required';
  end if;

  select * into before_org
  from public.organizations
  where id = target_organization_id
  for update;

  if not found then
    raise exception 'Organization not found';
  end if;

  previous_partner_status := before_org.partner_status;

  host_name := nullif(trim(coalesce(draft_form ->> 'hostName', '')), '');
  contact_name := nullif(trim(coalesce(draft_form ->> 'contactName', '')), '');
  contact_email := nullif(lower(trim(coalesce(draft_form ->> 'email', ''))), '');
  contact_phone := nullif(trim(coalesce(draft_form ->> 'phone', '')), '');
  business_location_value := nullif(trim(coalesce(draft_form ->> 'businessLocation', '')), '');
  partner_answer := lower(trim(coalesce(draft_form ->> 'partnerClaim', '')));

  update public.organizations
  set name = coalesce(left(host_name, 160), name),
      primary_contact_name = left(contact_name, 160),
      contact_email = left(contact_email, 320),
      contact_phone = left(contact_phone, 80),
      business_location = left(business_location_value, 180),
      status = case when status = 'ARCHIVED' then status else 'ONBOARDING' end,
      onboarding_ready_at = case when confirmed_authority then coalesce(onboarding_ready_at, now()) else null end,
      updated_at = now()
  where id = target_organization_id;

  if partner_answer = 'yes' then
    claim_business := nullif(trim(coalesce(draft_form ->> 'partnerBusiness', '')), '');
    claim_owner := nullif(trim(coalesce(draft_form ->> 'partnerOwner', '')), '');
    claim_email := nullif(lower(trim(coalesce(draft_form ->> 'partnerEmail', ''))), '');
    claim_phone := nullif(trim(coalesce(draft_form ->> 'partnerPhone', '')), '');

    if claim_business is null and claim_owner is null and claim_email is null and claim_phone is null then
      raise exception 'Partner claim requires identifying information';
    end if;

    insert into public.partner_claims (
      organization_id,
      submitted_by,
      business_name,
      owner_name,
      email,
      phone,
      status,
      submitted_at
    ) values (
      target_organization_id,
      actor_id,
      left(claim_business, 180),
      left(claim_owner, 160),
      left(claim_email, 320),
      left(claim_phone, 80),
      case
        when before_org.partner_status = 'VERIFIED' then 'VERIFIED'::public.partner_claim_record_status
        when before_org.partner_status = 'REJECTED' then 'REJECTED'::public.partner_claim_record_status
        else 'PENDING'::public.partner_claim_record_status
      end,
      now()
    )
    on conflict (organization_id) do update
      set submitted_by = excluded.submitted_by,
          business_name = excluded.business_name,
          owner_name = excluded.owner_name,
          email = excluded.email,
          phone = excluded.phone,
          status = case
            when public.partner_claims.status = 'VERIFIED' then 'VERIFIED'::public.partner_claim_record_status
            when public.partner_claims.status = 'REJECTED' then 'REJECTED'::public.partner_claim_record_status
            else 'PENDING'::public.partner_claim_record_status
          end,
          submitted_at = case
            when public.partner_claims.status = 'WITHDRAWN' then now()
            else public.partner_claims.submitted_at
          end,
          updated_at = now();

    if before_org.partner_status not in ('VERIFIED', 'REJECTED') then
      update public.organizations
      set partner_status = 'PARTNER_PENDING',
          commission_tier = 'STANDARD_7',
          partner_verified_by = null,
          partner_verified_at = null,
          partner_verification_note = null,
          updated_at = now()
      where id = target_organization_id;

      if previous_partner_status <> 'PARTNER_PENDING' then
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
        select
          actor_id,
          'partner_claim.submitted',
          'organization',
          target_organization_id,
          'Host claimed an existing Find A Place partnership. Commission remains STANDARD_7 pending verification.',
          to_jsonb(before_org),
          to_jsonb(organizations),
          jsonb_build_object('source', 'host_onboarding')
        from public.organizations organizations
        where organizations.id = target_organization_id;
      end if;
    end if;
  elsif partner_answer = 'no' then
    if before_org.partner_status = 'PARTNER_PENDING' then
      update public.organizations
      set partner_status = 'NOT_CLAIMED',
          commission_tier = 'STANDARD_7',
          partner_verified_by = null,
          partner_verified_at = null,
          partner_verification_note = null,
          updated_at = now()
      where id = target_organization_id;

      update public.partner_claims
      set status = 'WITHDRAWN',
          updated_at = now()
      where organization_id = target_organization_id
        and status = 'PENDING';

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
      select
        actor_id,
        'partner_claim.withdrawn',
        'organization',
        target_organization_id,
        'Host changed the onboarding answer to not currently being a Find A Place partner.',
        to_jsonb(before_org),
        to_jsonb(organizations),
        jsonb_build_object('source', 'host_onboarding')
      from public.organizations organizations
      where organizations.id = target_organization_id;
    end if;
  end if;

  next_onboarding_status := case
    when confirmed_authority then 'READY_FOR_PROPERTY'::public.host_onboarding_status
    else 'IN_PROGRESS'::public.host_onboarding_status
  end;

  insert into public.host_onboarding_drafts (
    organization_id,
    owner_profile_id,
    current_step,
    status,
    form_data,
    amenities,
    policies,
    photo_names,
    authority_confirmed
  ) values (
    target_organization_id,
    actor_id,
    normalized_step,
    next_onboarding_status,
    draft_form,
    coalesce(selected_amenities, '{}'::text[]),
    coalesce(selected_policies, '{}'::text[]),
    coalesce(selected_photo_names, '{}'::text[]),
    confirmed_authority
  )
  on conflict (organization_id) do update
    set current_step = excluded.current_step,
        status = excluded.status,
        form_data = excluded.form_data,
        amenities = excluded.amenities,
        policies = excluded.policies,
        photo_names = excluded.photo_names,
        authority_confirmed = excluded.authority_confirmed,
        updated_at = now();

  select * into after_org
  from public.organizations
  where id = target_organization_id;

  return query
  select
    after_org.id,
    after_org.partner_status,
    after_org.commission_tier,
    next_onboarding_status,
    now();
end;
$$;

-- Keep the existing admin decision function atomic while also updating the
-- normalized partner-claim record created by host onboarding.
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

    update public.partner_claims
    set status = 'VERIFIED',
        updated_at = now()
    where organization_id = target_organization_id;
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

    update public.partner_claims
    set status = 'REJECTED',
        updated_at = now()
    where organization_id = target_organization_id;
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

revoke all on function public.ensure_host_onboarding() from public;
revoke all on function public.save_host_onboarding(uuid, integer, jsonb, text[], text[], text[], boolean) from public;

grant execute on function public.ensure_host_onboarding() to authenticated;
grant execute on function public.save_host_onboarding(uuid, integer, jsonb, text[], text[], text[], boolean) to authenticated;

comment on table public.host_onboarding_drafts is
  'Persistent pre-property host onboarding state. Property-specific draft data is promoted into real property tables in the property CRUD milestone.';

comment on table public.partner_claims is
  'Host-supplied evidence for an existing Find A Place partnership. A claim never grants PARTNER_5 without an authorized admin verification decision.';

comment on function public.ensure_host_onboarding() is
  'Creates the authenticated host first owner organization + onboarding draft once, then safely returns the existing organization on later visits.';

comment on function public.save_host_onboarding(uuid, integer, jsonb, text[], text[], text[], boolean) is
  'Persists host onboarding for an owned/managed organization. Host partner claims can only create PARTNER_PENDING + STANDARD_7; this function can never self-grant PARTNER_5.';

commit;
