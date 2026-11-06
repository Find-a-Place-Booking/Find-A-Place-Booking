-- Host onboarding assistance for an owner who has not yet created a property.

-- The admin may edit factual draft fields, but cannot set host agreement,
-- identity authority, tax certification, or activate a payment connection.
create or replace function public.admin_patch_host_onboarding_draft(
 target_organization_id uuid, patch jsonb, reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid:=(select auth.uid()); d public.host_onboarding_drafts%rowtype;
  k text; val text; permitted text[]:=array[
    'hostName','contactName','phone','email','businessLocation',
    'propertyName','propertyType','description','street','city','state',
    'postal','publicArea','maxGuests','weeknight','weekend','cancellation'
  ];
  cleaned jsonb:='{}'::jsonb;
begin
  if actor_id is null or not public.admin_has_any_role(
    array['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[])
  then raise exception 'Operations admin role required'; end if;
  if length(trim(coalesce(reason,'')))<8 then
    raise exception 'Record the host assistance reason (at least eight characters)';
  end if;
  if jsonb_typeof(patch) <> 'object' or patch = '{}'::jsonb then
    raise exception 'Enter at least one factual draft field';
  end if;
  select * into d from public.host_onboarding_drafts
    where organization_id=target_organization_id for update;
  if not found then raise exception 'Onboarding draft not found'; end if;
  if d.created_property_id is not null then
    raise exception 'Property already created. Use the admin listing completion editor';
  end if;
  for k in select jsonb_object_keys(patch) loop
    if k<>all(permitted) then raise exception 'Host consent and other protected fields cannot be edited: %',k; end if;
    if jsonb_typeof(patch->k)<>'string' then raise exception 'Draft field % must be text',k; end if;
    val:=trim(patch->>k);
    if k in ('description','cancellation') then
      if length(val)>5000 then raise exception 'Draft field % is too long',k; end if;
    else
      if length(val)>250 then raise exception 'Draft field % is too long',k; end if;
    end if;
    if k in ('maxGuests','weeknight','weekend') and val <> '' and
       (val !~ '^([0-9]{1,6})(\.[0-9]{1,2})?$' or val::numeric <= 0) then
      raise exception 'Draft numerical field % is invalid',k;
    end if;
    if k='maxGuests' and val<>'' and (val !~ '^[0-9]{1,3}$' or val::integer>100) then
      raise exception 'Maximum guests must be between 1 and 100';
    end if;
    if k='state' and val<>'' and val !~* '^[a-z]{2}$' then
      raise exception 'State must be a two-letter code';
    end if;
    if k='state' then val:=upper(val); end if;
    cleaned:=cleaned||jsonb_build_object(k,val);
  end loop;
  update public.host_onboarding_drafts as target
  set form_data=coalesce(target.form_data,'{}'::jsonb)||cleaned,updated_at=now()
  where target.id=d.id;
  insert into public.audit_logs(actor_profile_id,action,entity_type,entity_id,reason,metadata)
  values(actor_id,'host.onboarding.admin_factual_assist','organization',target_organization_id,
    left(trim(reason),500),jsonb_build_object('draft_id',d.id,'edited_keys',(select jsonb_agg(key) from jsonb_object_keys(cleaned) as key),
       'host_agreement_unchanged',true,'authority_confirmation_unchanged',true));
  return jsonb_build_object('organization_id',target_organization_id,'updated_fields',
    (select jsonb_agg(key) from jsonb_object_keys(cleaned) as key));
end; $$;
revoke all on function public.admin_patch_host_onboarding_draft(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_patch_host_onboarding_draft(uuid,jsonb,text) to authenticated,service_role;

-- Safely creates a DRAFT from existing form data when the host hasn't created
-- a property yet. Does not approve, publish, accept agreements or taxes.
create or replace function public.admin_prepare_host_property_draft(
 target_organization_id uuid, reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 actor_id uuid:=(select auth.uid()); d public.host_onboarding_drafts%rowtype;
 property_id uuid; unit_id uuid; slug text; form jsonb; listing_name text;
 first_price integer; weekend_price integer; guest_capacity integer;
 pref text; before_draft jsonb;
begin
 if actor_id is null or not public.admin_has_any_role(
   array['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[])
 then raise exception 'Operations admin role required'; end if;
 if length(trim(coalesce(reason,'')))<8 then
   raise exception 'Document the reason for preparing this draft (at least eight characters)';
 end if;
 select * into d from public.host_onboarding_drafts
   where organization_id=target_organization_id for update;
 if not found then raise exception 'Host onboarding draft not found'; end if;
 if d.created_property_id is not null then
   raise exception 'A property already exists for this onboarding draft';
 end if;
 form:=coalesce(d.form_data,'{}'::jsonb);
 listing_name:=nullif(trim(coalesce(form->>'propertyName','')),'');
 if listing_name is null or length(listing_name)<3 then
   raise exception 'Add the property name before creating the draft';
 end if;
 pref:=upper(trim(coalesce(form->>'calendarPreference','UNSET')));
 if pref not in ('NONE','PMS','ICAL','UNSET') then pref:='UNSET'; end if;
 first_price:=null;
 weekend_price:=null;
 guest_capacity:=null;
 if coalesce(form->>'weeknight','') ~ '^([0-9]{1,6})(\.[0-9]{1,2})?$' then
  first_price:=round((form->>'weeknight')::numeric*100)::integer;
 end if;
 if coalesce(form->>'weekend','') ~ '^([0-9]{1,6})(\.[0-9]{1,2})?$' then
  weekend_price:=round((form->>'weekend')::numeric*100)::integer;
 end if;
 if coalesce(form->>'maxGuests','') ~ '^[0-9]{1,3}$' and
   (form->>'maxGuests')::integer between 1 and 100 then
    guest_capacity:=(form->>'maxGuests')::integer;
 end if;
 insert into public.properties(
  organization_id,name,description,property_type,status,public_area,
  street_address,city,region_code,postal_code,country_code,
  notification_email,operations_email,source_onboarding_draft_id,
  created_by,calendar_preference
 ) values(
  target_organization_id,left(listing_name,180),
  left(nullif(trim(form->>'description'),''),10000),
  left(nullif(trim(form->>'propertyType'),''),80),'DRAFT',
  left(nullif(trim(form->>'publicArea'),''),180),
  left(nullif(trim(form->>'street'),''),240),
  left(nullif(trim(form->>'city'),''),120),
  upper(left(nullif(trim(form->>'state'),''),40)),
  left(nullif(trim(form->>'postal'),''),24),'US',
  left(nullif(lower(trim(form->>'email')),''),320),
  left(nullif(lower(trim(form->>'email')),''),320),
  d.id,actor_id,pref::public.calendar_source_preference
 ) returning id into property_id;
 slug:=public.unique_listing_slug(listing_name,null);
 insert into public.property_units(property_id,name,slug,is_primary,max_guests,cancellation_policy)
 values(property_id,left(listing_name,180),slug,true,guest_capacity,
  left(nullif(trim(form->>'cancellation'),''),5000))
 returning id into unit_id;
 insert into public.unit_rate_settings(unit_id,weeknight_cents,weekend_cents)
 values(unit_id,first_price,weekend_price);
 update public.host_onboarding_drafts set created_property_id=property_id,updated_at=now()
 where id=d.id;
 insert into public.audit_logs(actor_profile_id,action,entity_type,entity_id,reason,metadata)
 values(actor_id,'host.onboarding.admin_prepared_property_draft','property',property_id,
  left(trim(reason),500),jsonb_build_object('organization_id',target_organization_id,
     'draft_id',d.id,'unit_id',unit_id,'source','admin_host_assistance',
     'host_policy_accepted',d.host_policy_accepted_at is not null,
     'host_authority_confirmed',d.authority_confirmed));
 return jsonb_build_object('property_id',property_id,'slug',slug,'status','DRAFT');
end; $$;
revoke all on function public.admin_prepare_host_property_draft(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_prepare_host_property_draft(uuid,text) to authenticated,service_role;
