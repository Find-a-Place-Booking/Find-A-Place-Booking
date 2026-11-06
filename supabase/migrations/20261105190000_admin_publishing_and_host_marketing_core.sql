-- Find A Place Booking / 2026-11-05
-- Admin publishing readiness and host marketing-interest preferences.
-- ADDS only: never changes existing book/pay, tax, calendar or publication guards.

create table if not exists public.host_marketing_preferences (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  three_discounted_stays_interest boolean not null default false,
  additional_social_advertising_interest boolean not null default false,
  request_notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint marketing_notes_len check (char_length(coalesce(request_notes,'')) <= 1000)
);
alter table public.host_marketing_preferences enable row level security;
revoke all on public.host_marketing_preferences from public, anon, authenticated;
grant select, insert, update on public.host_marketing_preferences to service_role;

create or replace function public.get_host_marketing_preferences(target_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o record; preference record;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_organization(target_organization_id)
     and not public.admin_has_any_role(array['SUPER_ADMIN','OPERATIONS_ADMIN','PARTNER_ADMIN']::public.admin_role[])
  then raise exception 'Host organization access required'; end if;
  select id, name, partner_status::text as partner_status, commission_tier::text as commission_tier
  into o from public.organizations where id=target_organization_id;
  if not found then raise exception 'Host organization not found'; end if;
  select * into preference from public.host_marketing_preferences where organization_id=target_organization_id;
  return jsonb_build_object(
    'organization_id',o.id,'organization_name',o.name,
    'is_partner',o.partner_status='VERIFIED' and o.commission_tier='PARTNER_5',
    'commission_tier',o.commission_tier,
    'three_discounted_stays_interest',coalesce(preference.three_discounted_stays_interest,false),
    'additional_social_advertising_interest',coalesce(preference.additional_social_advertising_interest,false),
    'request_notes',coalesce(preference.request_notes,''),
    'updated_at',preference.updated_at
  );
end; $$;
revoke all on function public.get_host_marketing_preferences(uuid) from public,anon,authenticated;
grant execute on function public.get_host_marketing_preferences(uuid) to authenticated,service_role;

create or replace function public.set_host_marketing_preferences(
 target_organization_id uuid, offer_three_discounted_stays boolean,
 request_social_advertising boolean, details text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); cleaned_note text;
begin
  if actor_id is null or not public.can_manage_organization(target_organization_id)
  then raise exception 'Only an authorized host may change these preferences'; end if;
  cleaned_note := nullif(left(trim(coalesce(details,'')),1000),'');
  insert into public.host_marketing_preferences (
    organization_id,three_discounted_stays_interest,additional_social_advertising_interest,
    request_notes,updated_by,updated_at
  ) values (target_organization_id,coalesce(offer_three_discounted_stays,false),
    coalesce(request_social_advertising,false),cleaned_note,actor_id,now())
  on conflict(organization_id) do update set
    three_discounted_stays_interest=excluded.three_discounted_stays_interest,
    additional_social_advertising_interest=excluded.additional_social_advertising_interest,
    request_notes=excluded.request_notes,updated_by=actor_id,updated_at=now();
  insert into public.audit_logs (
    actor_profile_id,action,entity_type,entity_id,reason,metadata
  ) values (actor_id,'host.marketing.interest_updated','organization',target_organization_id,
    'Host updated optional marketing preferences',
    jsonb_build_object('three_discounted_stays_interest',coalesce(offer_three_discounted_stays,false),
      'additional_social_advertising_interest',coalesce(request_social_advertising,false)));
  return public.get_host_marketing_preferences(target_organization_id);
end; $$;
revoke all on function public.set_host_marketing_preferences(uuid,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.set_host_marketing_preferences(uuid,boolean,boolean,text) to authenticated,service_role;

-- Mirrors the host submission checks PLUS the live-publish triggers. The
-- existing triggers/RPCs remain authoritative if state changes in the meantime.
create or replace function public.admin_property_publication_issues(target_property_id uuid)
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare
 p public.properties%rowtype;
 u public.property_units%rowtype;
 rates public.unit_rate_settings%rowtype;
 issues text[] := '{}'::text[];
 photos integer;
 healthy_calendar boolean;
 cancellation_text text;
 normalized_region text;
 linked_draft public.host_onboarding_drafts%rowtype;
begin
 if (select auth.uid()) is null or not public.admin_has_any_role(
    array['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[])
 then raise exception 'Operations admin role required'; end if;
 select * into p from public.properties where id=target_property_id;
 if not found then raise exception 'Property not found'; end if;
 if p.status='ARCHIVED' then return array['Archived listings cannot be published']; end if;
 if p.status='PUBLISHED' then return '{}'::text[]; end if;
 if nullif(trim(coalesce(p.name,'')),'') is null then issues:=array_append(issues,'Property name'); end if;
 if nullif(trim(coalesce(p.description,'')),'') is null then issues:=array_append(issues,'Description'); end if;
 if nullif(trim(coalesce(p.property_type,'')),'') is null then issues:=array_append(issues,'Property type'); end if;
 if nullif(trim(coalesce(p.public_area,p.city,'')),'') is null then issues:=array_append(issues,'Public area or city'); end if;
 if nullif(trim(coalesce(p.region_code,'')),'') is null then issues:=array_append(issues,'State / region'); end if;
 if nullif(trim(coalesce(p.street_address,'')),'') is null or
    nullif(trim(coalesce(p.city,'')),'') is null or
    nullif(trim(coalesce(p.postal_code,'')),'') is null then
    issues:=array_append(issues,'Full street address, city and ZIP'); end if;
 select * into u from public.property_units where property_id=p.id and is_primary order by created_at limit 1;
 if not found then issues:=array_append(issues,'Primary rentable unit');
 else
   if not u.is_active then issues:=array_append(issues,'Activate primary rentable unit'); end if;
   if coalesce(u.max_guests,0)<1 then issues:=array_append(issues,'Maximum guests'); end if;
   cancellation_text:=lower(trim(coalesce(u.cancellation_policy,'')));
   if cancellation_text='' or cancellation_text in ('flexible','moderate','firm','strict')
       or char_length(cancellation_text)<20 then
     issues:=array_append(issues,'Specific cancellation/refund terms (not just a policy label)'); end if;
   select * into rates from public.unit_rate_settings where unit_id=u.id;
   if coalesce(rates.weeknight_cents,0)<1 then issues:=array_append(issues,'Weeknight rate'); end if;
   select count(*) into photos from public.property_images where unit_id=u.id;
   if photos<1 then issues:=array_append(issues,'At least one property photo'); end if;
 end if;
 if p.source_onboarding_draft_id is not null then
   select * into linked_draft from public.host_onboarding_drafts where id=p.source_onboarding_draft_id;
   if not found then issues:=array_append(issues,'Host onboarding record is missing; contact operations'); end if;
   if found then
     if linked_draft.host_policy_accepted_at is null then
       issues:=array_append(issues,'Host must personally accept the Host Agreement');
     end if;
     if not coalesce(linked_draft.authority_confirmed,false) then
       issues:=array_append(issues,'Host must personally confirm authority to list the property');
     end if;
   end if;
 end if;
 if p.calendar_preference::text='UNSET' then
   issues:=array_append(issues,'Choose calendar preference: Find A Place only, iCal or PMS');
 elsif p.calendar_preference::text in ('ICAL','PMS') and u.id is not null then
   select exists(
     select 1 from public.calendar_connections c where c.unit_id=u.id
       and c.is_active and c.sync_status='HEALTHY' and c.last_success_at is not null
       and ((p.calendar_preference::text='ICAL' and c.connection_kind='ICAL')
         or (p.calendar_preference::text='PMS' and c.connection_kind in ('PMS_API','BROWSER_WORKER')))
   ) into healthy_calendar;
   if not healthy_calendar then
     issues:=array_append(issues, case when p.calendar_preference::text='ICAL'
       then 'Connect and successfully sync at least one iCal feed'
       else 'Connect and successfully sync the PMS / channel manager' end);
   end if;
 end if;
 if not coalesce(p.live_checkout_enabled,false) then
   issues:=array_append(issues,'Enable live checkout after verifying property setup');
 end if;
 if not public.property_live_payment_route_ready(p.id) then
   issues:=array_append(issues,'LIVE Stripe account must be ready for charges and payouts');
 end if;
 normalized_region:=public.normalize_supported_region_code(p.region_code);
 if normalized_region is null or normalized_region not in ('AR','MO','TX','TN') then
   issues:=array_append(issues,'State not cleared for Find A Place live publishing');
 elsif normalized_region='TN' then
   issues:=array_append(issues,'Tennessee live publishing is on hold for occupancy-tax readiness');
 elsif not public.region_state_tax_rules_ready(normalized_region) then
   issues:=array_append(issues,'Statewide lodging-tax rules not ready'); end if;
 if not public.property_tax_checkout_ready(p.id) then
   issues:=array_append(issues,'Host tax responsibility and local tax settings need certification');
 end if;
 return issues;
end; $$;
revoke all on function public.admin_property_publication_issues(uuid) from public,anon,authenticated;
grant execute on function public.admin_property_publication_issues(uuid) to authenticated,service_role;

-- Admin may complete factual listing fields, NOT host consent, Stripe credentials,
-- tax certification, or published property commercial snapshots.
create or replace function public.admin_save_listing_prep(
 target_property_id uuid, details jsonb, reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
 actor_id uuid := (select auth.uid());
 p public.properties%rowtype; u public.property_units%rowtype;
 before_property jsonb; before_unit jsonb;
 key text; pref text; numeric_value integer;
 allowed text[] := array['name','description','property_type','public_area',
   'street_address','city','region_code','postal_code','calendar_preference',
   'max_guests','cancellation_policy','weeknight_cents','weekend_cents'];
begin
 if actor_id is null or not public.admin_has_any_role(
   array['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[])
 then raise exception 'Operations admin role required'; end if;
 if length(trim(coalesce(reason,'')))<8 then raise exception 'Document why the admin is assisting the host'; end if;
 if jsonb_typeof(details) <> 'object' then raise exception 'Invalid property update payload'; end if;
 for key in select jsonb_object_keys(details) loop
    if key <> all(allowed) then raise exception 'Unsupported listing field: %',key; end if;
 end loop;
 select * into p from public.properties where id=target_property_id for update;
 if not found then raise exception 'Property not found'; end if;
 if p.status not in ('DRAFT','CHANGES_REQUESTED','REJECTED','PENDING_REVIEW','APPROVED','PAUSED') then
    raise exception 'Only unpublished listings can be edited with this completion tool'; end if;
 select * into u from public.property_units where property_id=p.id and is_primary order by created_at limit 1 for update;
 if not found then raise exception 'Primary rentable unit not found. Create the unit in the host property editor first.'; end if;
 before_property:=to_jsonb(p);before_unit:=to_jsonb(u);
 if details ? 'name' and length(trim(coalesce(details->>'name','')))<3 then raise exception 'Property name must have at least three characters'; end if;
 if details ? 'region_code' and trim(coalesce(details->>'region_code','')) !~* '^[a-z]{2}$' then raise exception 'State must be a two-letter code'; end if;
 if details ? 'calendar_preference' then
   pref:=upper(trim(coalesce(details->>'calendar_preference','')));
   if pref not in ('UNSET','NONE','ICAL','PMS') then raise exception 'Invalid calendar preference'; end if;
   -- A connected PMS cannot be silently replaced with manual availability
   -- just to make publication checks pass. Remove/inactivate the connection
   -- through the existing calendar workflow with explicit host approval first.
   if pref='NONE' and p.calendar_preference::text <> 'NONE' and exists (
     select 1 from public.calendar_connections c
     join public.property_units cu on cu.id=c.unit_id
     where cu.property_id=p.id and c.is_active
       and c.connection_kind in ('ICAL','PMS_API','BROWSER_WORKER')
   ) then
     raise exception 'An external calendar is still connected. Review and disconnect it with host approval before selecting manual-only availability';
   end if;
 end if;
 if details ? 'max_guests' then
   numeric_value:=(details->>'max_guests')::integer;
   if numeric_value<1 or numeric_value>100 then raise exception 'Maximum guests must be 1–100'; end if;
 end if;
 if details ? 'weeknight_cents' and ((details->>'weeknight_cents')::integer<1 or (details->>'weeknight_cents')::integer>10000000) then
    raise exception 'Weeknight price is out of range'; end if;
 if details ? 'weekend_cents' and ((details->>'weekend_cents')::integer<1 or (details->>'weekend_cents')::integer>10000000) then
    raise exception 'Weekend price is out of range'; end if;
 update public.properties target set
   name=case when details ? 'name' then left(trim(details->>'name'),160) else target.name end,
   description=case when details ? 'description' then left(trim(details->>'description'),10000) else target.description end,
   property_type=case when details ? 'property_type' then left(trim(details->>'property_type'),100) else target.property_type end,
   public_area=case when details ? 'public_area' then left(trim(details->>'public_area'),160) else target.public_area end,
   street_address=case when details ? 'street_address' then left(trim(details->>'street_address'),250) else target.street_address end,
   city=case when details ? 'city' then left(trim(details->>'city'),160) else target.city end,
   region_code=case when details ? 'region_code' then upper(trim(details->>'region_code')) else target.region_code end,
   postal_code=case when details ? 'postal_code' then left(trim(details->>'postal_code'),20) else target.postal_code end,
   calendar_preference=case when details ? 'calendar_preference' then (upper(trim(details->>'calendar_preference')))::public.calendar_source_preference else target.calendar_preference end,
   updated_at=now()
 where target.id=p.id;
 update public.property_units target set
   max_guests=case when details ? 'max_guests' then (details->>'max_guests')::integer else target.max_guests end,
   cancellation_policy=case when details ? 'cancellation_policy' then left(trim(details->>'cancellation_policy'),5000) else target.cancellation_policy end,
   updated_at=now()
 where target.id=u.id;
 if details ? 'weeknight_cents' or details ? 'weekend_cents' then
  insert into public.unit_rate_settings (unit_id,weeknight_cents,weekend_cents)
  values (u.id,
    case when details ? 'weeknight_cents' then (details->>'weeknight_cents')::integer else null end,
    case when details ? 'weekend_cents' then (details->>'weekend_cents')::integer else null end)
  on conflict(unit_id) do update set
    weeknight_cents=case when details ? 'weeknight_cents' then excluded.weeknight_cents else public.unit_rate_settings.weeknight_cents end,
    weekend_cents=case when details ? 'weekend_cents' then excluded.weekend_cents else public.unit_rate_settings.weekend_cents end,
    updated_at=now();
 end if;
 insert into public.audit_logs (actor_profile_id,action,entity_type,entity_id,reason,before_state,after_state,metadata)
 values (actor_id,'property.admin_setup_edit','property',p.id,
   left(coalesce(nullif(trim(reason),''),'Admin corrected host listing setup'),500),
   jsonb_build_object('property',before_property,'unit',before_unit),
   jsonb_build_object('property',(select to_jsonb(x) from public.properties x where x.id=p.id),
      'unit',(select to_jsonb(x) from public.property_units x where x.id=u.id)),
   jsonb_build_object('edited_fields',(select jsonb_agg(k) from jsonb_object_keys(details) k),'source','admin_publishing'));
end; $$;
revoke all on function public.admin_save_listing_prep(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_save_listing_prep(uuid,jsonb,text) to authenticated,service_role;

-- Approve and publish atomically; original publication procedure and DB
-- triggers still enforce payment, address, calendar, tax and state restrictions.
create or replace function public.admin_finish_and_publish_listing(
 target_property_id uuid, completion_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=(select auth.uid()); old_row public.properties%rowtype;
 issues text[]; note text; new_published timestamptz;
begin
 if actor_id is null or not public.admin_has_any_role(array['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[])
 then raise exception 'Operations admin role required'; end if;
 note:=left(coalesce(nullif(trim(completion_note),''),'Admin verified all listing requirements before publishing'),500);
 select * into old_row from public.properties where id=target_property_id for update;
 if not found then raise exception 'Property not found'; end if;
 if old_row.status='PUBLISHED' then raise exception 'Listing is already published'; end if;
 if old_row.status='ARCHIVED' then raise exception 'Archived listing cannot be published'; end if;
 issues:=public.admin_property_publication_issues(target_property_id);
 if cardinality(issues)>0 then raise exception 'Listing not ready: %',array_to_string(issues,'; '); end if;
 if old_row.status not in ('APPROVED','PAUSED') then
   update public.properties set status='APPROVED',reviewed_by=actor_id,reviewed_at=now(),
      approved_by=actor_id,approved_at=now(),review_note=note,updated_at=now()
     where id=target_property_id;
   insert into public.property_review_events (property_id,actor_profile_id,event_type,from_status,to_status,note)
   values (target_property_id,actor_id,'APPROVED',old_row.status,'APPROVED',note);
   insert into public.audit_logs (actor_profile_id,action,entity_type,entity_id,reason,metadata)
   values (actor_id,'property.admin_completed_approved','property',target_property_id,note,
    jsonb_build_object('original_status',old_row.status,'source','admin_publishing'));
 end if;
 perform 1 from public.admin_set_property_publication(target_property_id,true,note);
 select published_at into new_published from public.properties where id=target_property_id and status='PUBLISHED';
 if new_published is null then raise exception 'Publishing failed; property state was rolled back'; end if;
 return jsonb_build_object('property_id',target_property_id,'status','PUBLISHED','published_at',new_published);
end; $$;
revoke all on function public.admin_finish_and_publish_listing(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_finish_and_publish_listing(uuid,text) to authenticated,service_role;


