-- Find A Place Booking: optional host-funded 25% introductory discount.
-- Existing reservations, Stripe pricing, calendar checks, and booking hold RPCs are unchanged.
-- Use the existing promotion_codes + promotion_reservations atomic usage limits.

alter table public.host_marketing_preferences
  add column if not exists intro_discount_enabled boolean not null default false,
  add column if not exists advertising_contact_email text;

create table if not exists public.host_marketing_ad_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_email text not null check (char_length(contact_email) between 3 and 254),
  notes text check (char_length(coalesce(notes, '')) <= 1000),
  status text not null default 'PENDING' check (status in ('PENDING','SENT','FAILED','CANCELLED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists host_marketing_ad_requests_pending_idx
 on public.host_marketing_ad_requests (status, created_at) where status in ('PENDING','FAILED');
alter table public.host_marketing_ad_requests enable row level security;
revoke all on public.host_marketing_ad_requests from public, anon, authenticated;
grant select, insert, update on public.host_marketing_ad_requests to service_role;

-- Only this private helper creates/updates system-managed intro codes.
create or replace function public.fap_sync_intro_promotions(target_organization_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  opted boolean := false;
  actor uuid;
  listing record;
  promo_row record;
  promo_code text;
  confirmed_count integer;
begin
  select intro_discount_enabled, updated_by into opted, actor
  from public.host_marketing_preferences where organization_id=target_organization_id;
  if actor is null then return; end if;
  for listing in
    select u.id as unit_id, p.id as property_id
    from public.property_units u join public.properties p on p.id=u.property_id
    where p.organization_id=target_organization_id
      and p.status <> 'ARCHIVED' and u.is_primary and u.is_active
  loop
    promo_code := 'FAP25-' || replace(listing.unit_id::text,'-','');
    select count(*)::integer into confirmed_count
    from public.reservations r where r.property_id=listing.property_id
      and r.status='CONFIRMED';
    select id, redemption_count, max_redemptions into promo_row
    from public.promotion_codes
    where organization_id=target_organization_id and upper(code)=promo_code
    for update;
    if promo_row.id is not null then
      -- Never reset redemption history when a host turns the offer off and on.
      update public.promotion_codes set
        is_active=(coalesce(opted,false) and confirmed_count<3
          and redemption_count<coalesce(max_redemptions,0)),
        updated_at=now()
      where id=promo_row.id;
    elsif coalesce(opted,false) and confirmed_count<3 then
      insert into public.promotion_codes (
        organization_id,unit_id,code,label,discount_type,percent_bps,amount_cents,
        currency,max_redemptions,is_active,created_by,allow_with_public_special
      ) values (
        target_organization_id,listing.unit_id,promo_code,
        'New host offer: 25% off first three stays', 'PERCENT',2500,null,
        'USD',3-confirmed_count,true,actor,false
      );
    end if;
  end loop;
end; $$;
revoke all on function public.fap_sync_intro_promotions(uuid) from public,anon,authenticated;
grant execute on function public.fap_sync_intro_promotions(uuid) to service_role;

-- New listing: host can opt in during onboarding before having a property.
create or replace function public.fap_intro_when_unit_created()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare org uuid;
begin
  select organization_id into org from public.properties where id=new.property_id;
  if org is not null and exists (
    select 1 from public.host_marketing_preferences
    where organization_id=org and intro_discount_enabled
  ) then
    perform public.fap_sync_intro_promotions(org);
  end if;
  return new;
end; $$;
revoke all on function public.fap_intro_when_unit_created() from public,anon,authenticated;
drop trigger if exists fap_intro_unit_created on public.property_units;
create trigger fap_intro_unit_created
  after insert or update of is_primary,is_active on public.property_units
  for each row execute function public.fap_intro_when_unit_created();

-- Host-owner-only write; existing marketing preferences stay compatible with Admin.
create or replace function public.fap_save_host_intro_preferences(
  target_organization_id uuid,
  opt_into_intro boolean,
  request_additional_advertising boolean,
  contact_email text,
  details text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor uuid := (select auth.uid());
  cleaned_email text := lower(trim(coalesce(contact_email,'')));
  cleaned_notes text := left(trim(coalesce(details,'')),1000);
  previous public.host_marketing_preferences%rowtype;
  request_id uuid;
begin
  if actor is null or not exists (
    select 1 from public.organization_members m
    where m.organization_id=target_organization_id and m.profile_id=actor
      and m.status='ACTIVE' and m.role='OWNER'
  ) then
    raise exception 'Only the host account owner can change marketing preferences';
  end if;
  if coalesce(request_additional_advertising,false) and (
    length(cleaned_email)>254 or cleaned_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then raise exception 'Enter a valid contact email for additional advertising'; end if;
  select * into previous from public.host_marketing_preferences
  where organization_id=target_organization_id for update;

  insert into public.host_marketing_preferences (
    organization_id,three_discounted_stays_interest,intro_discount_enabled,
    additional_social_advertising_interest,advertising_contact_email,
    request_notes,updated_by,updated_at
  ) values (
    target_organization_id,coalesce(opt_into_intro,false),coalesce(opt_into_intro,false),
    coalesce(request_additional_advertising,false),
    case when request_additional_advertising then cleaned_email else null end,
    cleaned_notes,actor,now()
  ) on conflict(organization_id) do update set
    three_discounted_stays_interest=excluded.three_discounted_stays_interest,
    intro_discount_enabled=excluded.intro_discount_enabled,
    additional_social_advertising_interest=excluded.additional_social_advertising_interest,
    advertising_contact_email=excluded.advertising_contact_email,
    request_notes=excluded.request_notes,
    updated_by=excluded.updated_by,
    updated_at=now();

  perform public.fap_sync_intro_promotions(target_organization_id);

  if coalesce(request_additional_advertising,false) then
    if not coalesce(previous.additional_social_advertising_interest,false)
       or coalesce(previous.advertising_contact_email,'')<>cleaned_email then
      insert into public.host_marketing_ad_requests(organization_id,contact_email,notes)
      values (target_organization_id,cleaned_email,cleaned_notes)
      returning id into request_id;
    else
      select id into request_id from public.host_marketing_ad_requests
      where organization_id=target_organization_id and contact_email=cleaned_email
        and status in ('PENDING','FAILED') order by created_at desc limit 1;
    end if;
  else
    update public.host_marketing_ad_requests set status='CANCELLED'
      where organization_id=target_organization_id and status in ('PENDING','FAILED');
  end if;

  insert into public.audit_logs (
    actor_profile_id,action,entity_type,entity_id,reason,metadata
  ) values (actor,'host.marketing.intro25_saved','organization',target_organization_id,
    'Host updated introductory offer and advertising preferences',
    jsonb_build_object('intro_enabled',coalesce(opt_into_intro,false),
      'advertising_requested',coalesce(request_additional_advertising,false)));

  return jsonb_build_object('ok',true,'email_request_id',request_id);
end; $$;
revoke all on function public.fap_save_host_intro_preferences(uuid,boolean,boolean,text,text)
 from public,anon,authenticated;
grant execute on function public.fap_save_host_intro_preferences(uuid,boolean,boolean,text,text)
 to authenticated,service_role;

create or replace function public.fap_host_intro_status(target_organization_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.organization_members m
    where m.profile_id=(select auth.uid()) and m.organization_id=target_organization_id
      and m.status='ACTIVE' and m.role='OWNER'
  ) then raise exception 'Host owner access required'; end if;
  select jsonb_build_object(
    'organization_id',o.id,'organization_name',o.name,
    'is_partner',(o.partner_status='VERIFIED' and o.commission_tier='PARTNER_5'),
    'commission_tier',o.commission_tier::text,
    'intro_enabled',coalesce(h.intro_discount_enabled,false),
    'advertising_requested',coalesce(h.additional_social_advertising_interest,false),
    'contact_email',coalesce(h.advertising_contact_email,''),
    'notes',coalesce(h.request_notes,''),
    'participating_properties',(
      select count(*) from public.promotion_codes pc
      join public.property_units u on u.id=pc.unit_id
      join public.properties p on p.id=u.property_id
      where p.organization_id=o.id and pc.code like 'FAP25-%' and pc.is_active
        and p.status='PUBLISHED'
    )
  ) into result from public.organizations o
    left join public.host_marketing_preferences h on h.organization_id=o.id
    where o.id=target_organization_id;
  return result;
end; $$;
revoke all on function public.fap_host_intro_status(uuid) from public,anon,authenticated;
grant execute on function public.fap_host_intro_status(uuid) to authenticated,service_role;

-- Published properties only: safe public promotion code lookup.
-- Reserved-but-unpaid holds count against the remaining 3 offers until expiry.
create or replace function public.fap_public_intro_offers(target_unit_id uuid default null)
returns table (property_id uuid,unit_id uuid,code text,remaining integer)
language sql security definer stable set search_path=public,pg_temp as $$
  select p.id, u.id, promo.code,
    (promo.max_redemptions - promo.redemption_count -
      (select count(*)::integer from public.promotion_reservations pr
       where pr.promotion_code_id=promo.id and pr.status='RESERVED'
         and pr.reserved_until>now()))::integer
  from public.properties p
  join public.property_units u on u.property_id=p.id and u.is_primary and u.is_active
  join public.promotion_codes promo on promo.unit_id=u.id
    and promo.organization_id=p.organization_id
    and promo.code=('FAP25-' || replace(u.id::text,'-',''))
  join public.host_marketing_preferences h on h.organization_id=p.organization_id
  where p.status='PUBLISHED' and h.intro_discount_enabled
    and promo.is_active and promo.archived_at is null
    and promo.discount_type='PERCENT' and promo.percent_bps=2500
    and promo.max_redemptions between 1 and 3
    and promo.redemption_count < promo.max_redemptions
    and (target_unit_id is null or u.id=target_unit_id)
    and (promo.max_redemptions - promo.redemption_count -
      (select count(*)::integer from public.promotion_reservations pr
       where pr.promotion_code_id=promo.id and pr.status='RESERVED'
         and pr.reserved_until>now())) > 0;
$$;
revoke all on function public.fap_public_intro_offers(uuid) from public,anon,authenticated;
grant execute on function public.fap_public_intro_offers(uuid) to anon,authenticated,service_role;
