begin;

create or replace function public.prepare_onboarding_property(
  target_organization_id uuid
)
returns table(property_id uuid, unit_id uuid, slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  draft_row public.host_onboarding_drafts%rowtype;
  form jsonb;
  property_name text;
  new_property_id uuid;
  new_unit_id uuid;
  new_slug text;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  select drafts.* into draft_row
  from public.host_onboarding_drafts drafts
  where drafts.organization_id = target_organization_id
  for update;
  if not found then raise exception 'Host onboarding draft not found'; end if;

  if draft_row.created_property_id is not null then
    select properties.id, units.id, units.slug
    into new_property_id, new_unit_id, new_slug
    from public.properties properties
    join public.property_units units
      on units.property_id = properties.id and units.is_primary
    where properties.id = draft_row.created_property_id
      and properties.organization_id = target_organization_id;

    if new_property_id is null then
      raise exception 'The onboarding property could not be loaded';
    end if;

    return query select new_property_id, new_unit_id, new_slug;
    return;
  end if;

  form := coalesce(draft_row.form_data, '{}'::jsonb);
  property_name := nullif(trim(coalesce(form ->> 'propertyName', '')), '');
  if property_name is null then
    raise exception 'Add the property name before uploading photos';
  end if;

  insert into public.properties (
    organization_id,name,description,property_type,status,public_area,
    street_address,city,region_code,postal_code,country_code,
    notification_email,operations_email,source_onboarding_draft_id,created_by
  ) values (
    target_organization_id,
    left(property_name,180),
    left(nullif(trim(coalesce(form ->> 'description','')),''),10000),
    left(nullif(trim(coalesce(form ->> 'propertyType','')),''),80),
    'DRAFT',
    left(nullif(trim(coalesce(form ->> 'publicArea','')),''),180),
    left(nullif(trim(coalesce(form ->> 'street','')),''),240),
    left(nullif(trim(coalesce(form ->> 'city','')),''),120),
    upper(left(nullif(trim(coalesce(form ->> 'state','')),''),40)),
    left(nullif(trim(coalesce(form ->> 'postal','')),''),24),
    'US',
    left(nullif(lower(trim(coalesce(form ->> 'email',''))),''),320),
    left(nullif(lower(trim(coalesce(form ->> 'email',''))),''),320),
    draft_row.id,
    actor_id
  ) returning id into new_property_id;

  new_slug := public.unique_listing_slug(property_name,null);

  insert into public.property_units (
    property_id,name,slug,is_primary
  ) values (
    new_property_id,left(property_name,180),new_slug,true
  ) returning id into new_unit_id;

  insert into public.unit_rate_settings (unit_id)
  values (new_unit_id)
  on conflict (unit_id) do nothing;

  update public.host_onboarding_drafts drafts
  set created_property_id = new_property_id, updated_at = now()
  where drafts.id = draft_row.id;

  insert into public.audit_logs (
    actor_profile_id,action,entity_type,entity_id,reason,metadata
  ) values (
    actor_id,
    'property.prepared_from_onboarding',
    'property',
    new_property_id,
    'Prepared the first draft property during host onboarding so photos can be stored immediately.',
    jsonb_build_object(
      'organization_id',target_organization_id,
      'unit_id',new_unit_id,
      'slug',new_slug
    )
  );

  return query select new_property_id,new_unit_id,new_slug;
end;
$$;

create or replace function public.sync_onboarding_property(
  target_organization_id uuid
)
returns table(property_id uuid, unit_id uuid, slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  draft_row public.host_onboarding_drafts%rowtype;
  form jsonb;
  target_property public.properties%rowtype;
  target_unit public.property_units%rowtype;
  property_name text;
  calendar_value public.calendar_source_preference := 'UNSET';
  rate_weeknight integer;
  rate_weekend integer;
  fee_cleaning integer;
  fee_pet integer;
  fee_extra integer;
  included_guests_value integer;
  max_guests_value integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  select drafts.* into draft_row
  from public.host_onboarding_drafts drafts
  where drafts.organization_id = target_organization_id
  for update;
  if not found then raise exception 'Host onboarding draft not found'; end if;
  if draft_row.created_property_id is null then
    raise exception 'Prepare the onboarding property before synchronizing it';
  end if;

  select properties.* into target_property
  from public.properties properties
  where properties.id = draft_row.created_property_id
    and properties.organization_id = target_organization_id
  for update;
  if not found then raise exception 'Onboarding property not found'; end if;
  if target_property.source_onboarding_draft_id is distinct from draft_row.id then
    raise exception 'The property is not owned by this onboarding draft';
  end if;
  if target_property.status <> 'DRAFT' then
    raise exception 'Only the onboarding draft property can be synchronized';
  end if;

  select units.* into target_unit
  from public.property_units units
  where units.property_id = target_property.id and units.is_primary
  for update;
  if not found then raise exception 'Onboarding property unit not found'; end if;

  form := coalesce(draft_row.form_data,'{}'::jsonb);
  property_name := nullif(trim(coalesce(form ->> 'propertyName','')),'');
  if property_name is null then raise exception 'Property name is required'; end if;

  calendar_value := case lower(trim(coalesce(form ->> 'calendarPreference','')))
    when 'ical' then 'ICAL'::public.calendar_source_preference
    when 'pms' then 'PMS'::public.calendar_source_preference
    when 'none' then 'NONE'::public.calendar_source_preference
    else 'UNSET'::public.calendar_source_preference
  end;

  update public.properties properties set
    name=left(property_name,180),
    description=left(nullif(trim(coalesce(form ->> 'description','')),''),10000),
    property_type=left(nullif(trim(coalesce(form ->> 'propertyType','')),''),80),
    public_area=left(nullif(trim(coalesce(form ->> 'publicArea','')),''),180),
    street_address=left(nullif(trim(coalesce(form ->> 'street','')),''),240),
    city=left(nullif(trim(coalesce(form ->> 'city','')),''),120),
    region_code=upper(left(nullif(trim(coalesce(form ->> 'state','')),''),40)),
    postal_code=left(nullif(trim(coalesce(form ->> 'postal','')),''),24),
    country_code='US',
    notification_email=left(nullif(lower(trim(coalesce(form ->> 'email',''))),''),320),
    operations_email=left(nullif(lower(trim(coalesce(form ->> 'email',''))),''),320),
    calendar_preference=calendar_value,
    custom_amenities=left(nullif(trim(coalesce(form ->> 'customAmenities','')),''),5000),
    custom_policies=left(nullif(trim(coalesce(form ->> 'customPolicies','')),''),5000),
    updated_at=now()
  where properties.id=target_property.id;

  update public.property_units units set
    name=left(property_name,180),
    max_guests=public.safe_integer(form ->> 'maxGuests'),
    bedrooms=public.safe_integer(form ->> 'bedrooms'),
    beds=public.safe_integer(form ->> 'beds'),
    bathrooms=public.safe_numeric(form ->> 'bathrooms'),
    minimum_stay_nights=greatest(coalesce(public.safe_integer(form ->> 'minStay'),1),1),
    check_in=nullif(trim(coalesce(form ->> 'checkIn','')),'')::time,
    checkout=nullif(trim(coalesce(form ->> 'checkout','')),'')::time,
    cancellation_policy=left(nullif(trim(coalesce(form ->> 'cancellation','')),''),5000),
    updated_at=now()
  where units.id=target_unit.id;

  delete from public.unit_amenities where unit_id=target_unit.id;
  insert into public.unit_amenities (unit_id,amenity_code)
  select target_unit.id,catalog.code
  from public.amenity_catalog catalog
  where catalog.label=any(coalesce(draft_row.amenities,'{}'::text[]))
  on conflict do nothing;

  delete from public.unit_policies where unit_id=target_unit.id;
  insert into public.unit_policies (unit_id,policy_code,configuration)
  select
    target_unit.id,
    catalog.code,
    case catalog.code
      when 'quiet-hours' then jsonb_build_object('start',form ->> 'quietStart','end',form ->> 'quietEnd')
      when 'pets-allowed' then jsonb_build_object('max_pets',form ->> 'maxPets')
      when 'minimum-booking-age' then jsonb_build_object('minimum_age',form ->> 'minimumAge')
      else '{}'::jsonb
    end
  from public.policy_catalog catalog
  where catalog.label=any(coalesce(draft_row.policies,'{}'::text[]))
  on conflict do nothing;

  rate_weeknight:=public.money_text_to_cents(form ->> 'weeknight');
  rate_weekend:=public.money_text_to_cents(form ->> 'weekend');
  fee_cleaning:=public.money_text_to_cents(form ->> 'cleaning');
  fee_pet:=public.money_text_to_cents(form ->> 'pet');
  fee_extra:=public.money_text_to_cents(form ->> 'extraGuest');
  included_guests_value:=public.safe_integer(form ->> 'includedGuests');
  max_guests_value:=public.safe_integer(form ->> 'maxGuests');

  if included_guests_value is not null
     and (included_guests_value<1 or included_guests_value>100) then
    raise exception 'Included guest count must be between 1 and 100';
  end if;
  if included_guests_value is not null
     and max_guests_value is not null
     and included_guests_value>max_guests_value then
    raise exception 'Included guest count cannot exceed maximum guests';
  end if;
  if fee_extra is not null and fee_extra>0
     and included_guests_value is null then
    raise exception 'Set how many guests are included before charging an extra guest fee';
  end if;

  insert into public.unit_rate_settings (
    unit_id,weeknight_cents,weekend_cents,included_guests
  ) values (
    target_unit.id,rate_weeknight,rate_weekend,included_guests_value
  )
  on conflict (unit_id) do update set
    weeknight_cents=excluded.weeknight_cents,
    weekend_cents=excluded.weekend_cents,
    included_guests=excluded.included_guests,
    updated_at=now();

  delete from public.unit_fees
  where unit_id=target_unit.id
    and fee_type in ('CLEANING','PET','EXTRA_GUEST');

  if fee_cleaning is not null and fee_cleaning>0 then
    insert into public.unit_fees (unit_id,fee_type,label,amount_cents,calculation)
    values (target_unit.id,'CLEANING','Cleaning fee',fee_cleaning,'FLAT_PER_STAY');
  end if;
  if fee_pet is not null and fee_pet>0 then
    insert into public.unit_fees (unit_id,fee_type,label,amount_cents,calculation)
    values (target_unit.id,'PET','Pet fee',fee_pet,'PER_PET_PER_STAY');
  end if;
  if fee_extra is not null and fee_extra>0 then
    insert into public.unit_fees (unit_id,fee_type,label,amount_cents,calculation)
    values (target_unit.id,'EXTRA_GUEST','Extra guest fee',fee_extra,'PER_GUEST_PER_NIGHT');
  end if;

  return query select target_property.id,target_unit.id,target_unit.slug;
end;
$$;

create or replace function public.create_property_from_onboarding(
  target_organization_id uuid
)
returns table(property_id uuid, unit_id uuid, slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  draft_row public.host_onboarding_drafts%rowtype;
  result_property_id uuid;
  result_unit_id uuid;
  result_slug text;
  previous_org_status public.organization_status;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'Organization owner or manager access required';
  end if;

  select drafts.* into draft_row
  from public.host_onboarding_drafts drafts
  where drafts.organization_id=target_organization_id
  for update;
  if not found then raise exception 'Host onboarding draft not found'; end if;
  if draft_row.status<>'READY_FOR_PROPERTY'
     or not draft_row.authority_confirmed then
    raise exception 'Finish host setup before creating the property';
  end if;

  select p.property_id,p.unit_id,p.slug
  into result_property_id,result_unit_id,result_slug
  from public.prepare_onboarding_property(target_organization_id) p;

  select s.property_id,s.unit_id,s.slug
  into result_property_id,result_unit_id,result_slug
  from public.sync_onboarding_property(target_organization_id) s;

  if not exists (
    select 1 from public.property_images images
    where images.unit_id=result_unit_id
  ) then
    raise exception 'Upload at least one property photo before finishing host setup';
  end if;

  select organizations.status into previous_org_status
  from public.organizations organizations
  where organizations.id=target_organization_id
  for update;

  update public.organizations organizations
  set status=case
        when organizations.status='ARCHIVED' then organizations.status
        else 'ACTIVE'::public.organization_status
      end,
      updated_at=now()
  where organizations.id=target_organization_id;

  if previous_org_status is distinct from 'ACTIVE'::public.organization_status then
    insert into public.audit_logs (
      actor_profile_id,action,entity_type,entity_id,reason,metadata
    ) values (
      actor_id,
      'property.created_from_onboarding',
      'property',
      result_property_id,
      'Completed host onboarding and finalized the first draft property.',
      jsonb_build_object(
        'organization_id',target_organization_id,
        'unit_id',result_unit_id,
        'slug',result_slug
      )
    );
  end if;

  return query select result_property_id,result_unit_id,result_slug;
end;
$$;

revoke all on function public.prepare_onboarding_property(uuid) from public,anon;
revoke all on function public.sync_onboarding_property(uuid) from public,anon;
revoke all on function public.create_property_from_onboarding(uuid) from public,anon;

grant execute on function public.prepare_onboarding_property(uuid) to authenticated;
grant execute on function public.sync_onboarding_property(uuid) to authenticated;
grant execute on function public.create_property_from_onboarding(uuid) to authenticated;

notify pgrst,'reload schema';

commit;
