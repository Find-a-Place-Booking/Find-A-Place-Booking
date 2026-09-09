-- Find A Place Booking
-- Milestone 6 hotfix 2: remove remaining organization_id ambiguity from save_host_onboarding
--
-- Migrations 004 and 005 may already be applied in development. Do not edit or
-- rerun them. This migration safely replaces only the affected RPC and fully
-- qualifies conflict/update references that collide with the function OUT field
-- named organization_id.

begin;

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
  v_contact_email text;
  v_contact_phone text;
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
  v_contact_email := nullif(lower(trim(coalesce(draft_form ->> 'email', ''))), '');
  v_contact_phone := nullif(trim(coalesce(draft_form ->> 'phone', '')), '');
  business_location_value := nullif(trim(coalesce(draft_form ->> 'businessLocation', '')), '');
  partner_answer := lower(trim(coalesce(draft_form ->> 'partnerClaim', '')));

  update public.organizations
  set name = coalesce(left(host_name, 160), name),
      primary_contact_name = left(contact_name, 160),
      contact_email = left(v_contact_email, 320),
      contact_phone = left(v_contact_phone, 80),
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
    on conflict on constraint partner_claims_organization_id_key do update
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

      update public.partner_claims as claims
      set status = 'WITHDRAWN',
          updated_at = now()
      where claims.organization_id = target_organization_id
        and claims.status = 'PENDING';

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
  on conflict on constraint host_onboarding_drafts_organization_id_key do update
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


revoke all on function public.save_host_onboarding(uuid, integer, jsonb, text[], text[], text[], boolean) from public;
grant execute on function public.save_host_onboarding(uuid, integer, jsonb, text[], text[], text[], boolean) to authenticated;

comment on function public.save_host_onboarding(uuid, integer, jsonb, text[], text[], text[], boolean) is
  'Persists host onboarding for an owned/managed organization. Hotfix fully qualifies organization_id conflicts plus contact locals. Host claims can never self-grant PARTNER_5.';

commit;
