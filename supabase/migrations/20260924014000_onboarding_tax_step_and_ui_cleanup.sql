-- Find A Place Booking
-- Add the property-tax step to host onboarding and keep existing in-progress
-- hosts on the same logical step after insertion.

begin;

update public.host_onboarding_drafts
set
  current_step = least(current_step + 1, 10),
  updated_at = now()
where current_step between 6 and 9;

create or replace function public.save_host_onboarding(
  target_organization_id uuid,
  target_step integer,
  draft_form jsonb,
  selected_amenities text[] default '{}'::text[],
  selected_policies text[] default '{}'::text[],
  selected_photo_names text[] default '{}'::text[],
  confirmed_authority boolean default false
)
returns table(
  organization_id uuid,
  partner_status public.partner_status,
  commission_tier public.commission_tier,
  onboarding_status public.host_onboarding_status,
  saved_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  organization_row public.organizations%rowtype;
  normalized_step integer :=
    least(greatest(coalesce(target_step, 0), 0), 10);
  next_onboarding_status public.host_onboarding_status;
  host_name text;
  contact_name text;
  v_contact_email text;
  v_contact_phone text;
  business_location_value text;
  cleaned_form jsonb;
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
     or coalesce(array_length(selected_photo_names, 1), 0) > 24
  then
    raise exception 'Onboarding selection limit exceeded';
  end if;

  if not exists (
    select 1
    from public.organization_members members
    where members.organization_id = target_organization_id
      and members.profile_id = actor_id
      and members.status = 'ACTIVE'
      and members.role in ('OWNER','MANAGER')
  ) then
    raise exception
      'Organization owner or manager access required';
  end if;

  select organizations.*
  into organization_row
  from public.organizations organizations
  where organizations.id = target_organization_id
  for update;

  if not found then
    raise exception 'Organization not found';
  end if;

  cleaned_form :=
    draft_form
      - 'partnerClaim'
      - 'partnerBusiness'
      - 'partnerOwner'
      - 'partnerEmail'
      - 'partnerPhone';

  host_name :=
    nullif(
      trim(coalesce(cleaned_form ->> 'hostName', '')),
      ''
    );
  contact_name :=
    nullif(
      trim(coalesce(cleaned_form ->> 'contactName', '')),
      ''
    );
  v_contact_email :=
    nullif(
      lower(trim(coalesce(cleaned_form ->> 'email', ''))),
      ''
    );
  v_contact_phone :=
    nullif(
      trim(coalesce(cleaned_form ->> 'phone', '')),
      ''
    );
  business_location_value :=
    nullif(
      trim(
        coalesce(
          cleaned_form ->> 'businessLocation',
          ''
        )
      ),
      ''
    );

  update public.organizations organizations
  set
    name =
      coalesce(
        left(host_name, 160),
        organizations.name
      ),
    primary_contact_name = left(contact_name, 160),
    contact_email = left(v_contact_email, 320),
    contact_phone = left(v_contact_phone, 80),
    business_location =
      left(business_location_value, 180),
    status =
      case
        when organizations.status = 'ARCHIVED'
          then organizations.status
        else 'ONBOARDING'
      end,
    onboarding_ready_at =
      case
        when confirmed_authority
          then coalesce(
            organizations.onboarding_ready_at,
            now()
          )
        else null
      end,
    updated_at = now()
  where organizations.id = target_organization_id
  returning organizations.* into organization_row;

  next_onboarding_status :=
    case
      when confirmed_authority
        then 'READY_FOR_PROPERTY'::public.host_onboarding_status
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
    cleaned_form,
    coalesce(selected_amenities, '{}'::text[]),
    coalesce(selected_policies, '{}'::text[]),
    coalesce(selected_photo_names, '{}'::text[]),
    confirmed_authority
  )
  on conflict on constraint
    host_onboarding_drafts_organization_id_key
  do update set
    current_step = excluded.current_step,
    status = excluded.status,
    form_data = excluded.form_data,
    amenities = excluded.amenities,
    policies = excluded.policies,
    photo_names = excluded.photo_names,
    authority_confirmed = excluded.authority_confirmed,
    updated_at = now();

  return query
  select
    organization_row.id,
    organization_row.partner_status,
    organization_row.commission_tier,
    next_onboarding_status,
    now();
end;
$function$;

notify pgrst, 'reload schema';

commit;
