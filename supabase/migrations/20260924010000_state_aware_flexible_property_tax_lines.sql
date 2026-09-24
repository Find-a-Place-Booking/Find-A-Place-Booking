-- Find A Place Booking
-- State-aware, host-certified, flexible property tax configuration.
--
-- Payment architecture remains unchanged:
-- guest payment is a Stripe Connect direct charge on the host account;
-- Find A Place receives only its application/commission fee;
-- platform_tax_retained_cents remains 0.
--
-- This migration only changes tax setup + tax calculation before payment.

begin;

alter table public.property_tax_profiles
  add column if not exists local_sales_rate_bps integer,
  add column if not exists local_lodging_rate_bps integer,
  add column if not exists local_lodging_label text,
  add column if not exists host_responsibility_ack boolean not null default false,
  add column if not exists host_certified_by uuid references public.profiles(id) on delete set null,
  add column if not exists host_certified_at timestamptz,
  add column if not exists certification_version text,
  add column if not exists configuration_source text,
  add column if not exists legacy_checkout_allowed boolean not null default false;

alter table public.property_tax_profiles
  drop constraint if exists property_tax_profiles_local_sales_rate_bps_check;
alter table public.property_tax_profiles
  add constraint property_tax_profiles_local_sales_rate_bps_check
    check (local_sales_rate_bps is null or local_sales_rate_bps between 0 and 10000);

alter table public.property_tax_profiles
  drop constraint if exists property_tax_profiles_local_lodging_rate_bps_check;
alter table public.property_tax_profiles
  add constraint property_tax_profiles_local_lodging_rate_bps_check
    check (local_lodging_rate_bps is null or local_lodging_rate_bps between 0 and 10000);

alter table public.property_tax_profiles
  drop constraint if exists property_tax_profiles_configuration_source_check;
alter table public.property_tax_profiles
  add constraint property_tax_profiles_configuration_source_check
    check (
      configuration_source is null
      or configuration_source in ('HOST','ADMIN_ASSISTED','LEGACY_ADMIN')
    );

update public.property_tax_profiles
set
  legacy_checkout_allowed = true,
  configuration_source = coalesce(configuration_source, 'LEGACY_ADMIN')
where verification_status = 'VERIFIED'
  and host_certified_at is null;

drop policy if exists property_tax_profiles_select_host
  on public.property_tax_profiles;
create policy property_tax_profiles_select_host
on public.property_tax_profiles
for select to authenticated
using (public.can_manage_property(property_id));

drop policy if exists tax_authorities_select_host
  on public.tax_authorities;
create policy tax_authorities_select_host
on public.tax_authorities
for select to authenticated
using (is_active = true);

drop policy if exists tax_rules_select_host
  on public.tax_rules;
create policy tax_rules_select_host
on public.tax_rules
for select to authenticated
using (is_active = true);

create table if not exists public.property_tax_lines (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  category text not null default 'OTHER'
    check (category in ('LOCAL_SALES','LOCAL_LODGING','OTHER')),
  label text not null,
  rate_bps integer not null check (rate_bps between 0 and 10000),
  base_scope text not null default 'ACCOMMODATION_TOTAL'
    check (base_scope in ('LODGING_ONLY','ACCOMMODATION_TOTAL','PRE_TAX_TOTAL')),
  authority_name text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_tax_lines_property_idx
  on public.property_tax_lines(property_id, is_active, sort_order);

drop trigger if exists property_tax_lines_set_updated_at
  on public.property_tax_lines;
create trigger property_tax_lines_set_updated_at
before update on public.property_tax_lines
for each row execute function public.set_updated_at();

alter table public.property_tax_lines enable row level security;

drop policy if exists property_tax_lines_select_host
  on public.property_tax_lines;
create policy property_tax_lines_select_host
on public.property_tax_lines
for select to authenticated
using (public.can_manage_property(property_id));

drop policy if exists property_tax_lines_select_admin
  on public.property_tax_lines;
create policy property_tax_lines_select_admin
on public.property_tax_lines
for select to authenticated
using (public.is_active_admin());

-- Migrate v1 host-entered rates.
insert into public.property_tax_lines (
  property_id,category,label,rate_bps,base_scope,
  authority_name,sort_order,created_by
)
select
  profiles.property_id,
  'LOCAL_SALES',
  'Local city / county sales tax',
  profiles.local_sales_rate_bps,
  'ACCOMMODATION_TOTAL',
  profiles.locality_name,
  10,
  profiles.host_certified_by
from public.property_tax_profiles profiles
where coalesce(profiles.local_sales_rate_bps, 0) > 0
  and not exists (
    select 1
    from public.property_tax_lines lines
    where lines.property_id = profiles.property_id
      and lines.category = 'LOCAL_SALES'
      and lines.rate_bps = profiles.local_sales_rate_bps
  );

insert into public.property_tax_lines (
  property_id,category,label,rate_bps,base_scope,
  authority_name,sort_order,created_by
)
select
  profiles.property_id,
  'LOCAL_LODGING',
  coalesce(
    nullif(trim(profiles.local_lodging_label), ''),
    'Local lodging / occupancy tax'
  ),
  profiles.local_lodging_rate_bps,
  'ACCOMMODATION_TOTAL',
  profiles.locality_name,
  20,
  profiles.host_certified_by
from public.property_tax_profiles profiles
where coalesce(profiles.local_lodging_rate_bps, 0) > 0
  and not exists (
    select 1
    from public.property_tax_lines lines
    where lines.property_id = profiles.property_id
      and lines.category = 'LOCAL_LODGING'
      and lines.rate_bps = profiles.local_lodging_rate_bps
  );

-- Migrate older explicit local assignments.
insert into public.property_tax_lines (
  property_id,category,label,rate_bps,base_scope,
  authority_name,sort_order,created_by
)
select
  assignments.property_id,
  case
    when authorities.jurisdiction_type = 'LOCAL_LODGING'
      then 'LOCAL_LODGING'
    when authorities.jurisdiction_type in (
      'CITY_SALES','COUNTY_SALES','STATE_SALES'
    )
      then 'LOCAL_SALES'
    else 'OTHER'
  end,
  rules.label,
  rules.rate_bps,
  rules.base_scope,
  authorities.name,
  100 + row_number() over (
    partition by assignments.property_id order by rules.label
  ),
  assignments.verified_by
from public.property_tax_rule_assignments assignments
join public.tax_rules rules
  on rules.id = assignments.tax_rule_id
join public.tax_authorities authorities
  on authorities.id = rules.authority_id
where rules.assignment_required
  and rules.is_active
  and not exists (
    select 1
    from public.property_tax_lines lines
    where lines.property_id = assignments.property_id
      and lines.label = rules.label
      and lines.rate_bps = rules.rate_bps
  );

create or replace function public.host_save_property_tax_configuration_v2(
  target_property_id uuid,
  county_name_value text,
  locality_name_value text,
  tax_lines_value jsonb,
  responsibility_ack_value boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  now_value timestamptz := now();
  line_value jsonb;
  line_label text;
  line_category text;
  line_base_scope text;
  line_authority_name text;
  line_rate_bps integer;
  line_sort integer := 0;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_property(target_property_id) then
    raise exception 'Property access denied';
  end if;

  if responsibility_ack_value is not true then
    raise exception 'Host tax responsibility acknowledgement is required';
  end if;

  tax_lines_value := coalesce(tax_lines_value, '[]'::jsonb);

  if jsonb_typeof(tax_lines_value) <> 'array' then
    raise exception 'Tax lines must be an array';
  end if;

  if jsonb_array_length(tax_lines_value) > 12 then
    raise exception 'A property can have at most 12 custom tax lines';
  end if;

  delete from public.property_tax_lines
  where property_id = target_property_id;

  for line_value in
    select value from jsonb_array_elements(tax_lines_value)
  loop
    line_label :=
      left(trim(coalesce(line_value ->> 'label', '')), 160);
    line_category :=
      upper(trim(coalesce(line_value ->> 'category', 'OTHER')));
    line_base_scope :=
      upper(trim(coalesce(
        line_value ->> 'base_scope',
        'ACCOMMODATION_TOTAL'
      )));
    line_authority_name :=
      nullif(
        left(trim(coalesce(line_value ->> 'authority_name', '')), 180),
        ''
      );
    line_rate_bps :=
      coalesce((line_value ->> 'rate_bps')::integer, 0);
    line_sort := line_sort + 10;

    if line_rate_bps = 0 and line_label = '' then
      continue;
    end if;

    if line_label = '' then
      raise exception 'Every tax line with a rate needs a label';
    end if;

    if line_rate_bps < 0 or line_rate_bps > 10000 then
      raise exception 'Tax line rate is invalid';
    end if;

    if line_category not in (
      'LOCAL_SALES','LOCAL_LODGING','OTHER'
    ) then
      raise exception 'Tax line category is invalid';
    end if;

    if line_base_scope not in (
      'LODGING_ONLY','ACCOMMODATION_TOTAL','PRE_TAX_TOTAL'
    ) then
      raise exception 'Tax line base is invalid';
    end if;

    if line_rate_bps > 0 then
      insert into public.property_tax_lines (
        property_id,category,label,rate_bps,base_scope,
        authority_name,sort_order,is_active,created_by
      ) values (
        target_property_id,line_category,line_label,line_rate_bps,
        line_base_scope,line_authority_name,line_sort,true,actor_id
      );
    end if;
  end loop;

  insert into public.property_tax_profiles (
    property_id,verification_status,county_name,locality_name,
    verification_notes,verified_by,verified_at,last_rate_review_at,
    host_responsibility_ack,host_certified_by,host_certified_at,
    certification_version,configuration_source,legacy_checkout_allowed,
    local_sales_rate_bps,local_lodging_rate_bps,local_lodging_label,
    updated_at
  ) values (
    target_property_id,'VERIFIED',
    nullif(trim(coalesce(county_name_value, '')), ''),
    nullif(trim(coalesce(locality_name_value, '')), ''),
    'Host supplied and certified flexible property tax configuration.',
    actor_id,now_value,now_value,true,actor_id,now_value,
    'HOST_TAX_RESPONSIBILITY_V2','HOST',false,
    null,null,null,now_value
  )
  on conflict (property_id) do update
    set verification_status = 'VERIFIED',
        county_name = excluded.county_name,
        locality_name = excluded.locality_name,
        verification_notes = excluded.verification_notes,
        verified_by = excluded.verified_by,
        verified_at = excluded.verified_at,
        last_rate_review_at = excluded.last_rate_review_at,
        host_responsibility_ack = true,
        host_certified_by = actor_id,
        host_certified_at = now_value,
        certification_version = 'HOST_TAX_RESPONSIBILITY_V2',
        configuration_source = 'HOST',
        legacy_checkout_allowed = false,
        local_sales_rate_bps = null,
        local_lodging_rate_bps = null,
        local_lodging_label = null,
        updated_at = now_value;

  delete from public.property_tax_rule_assignments
  where property_id = target_property_id;

  insert into public.audit_logs (
    actor_profile_id,action,entity_type,entity_id,reason,metadata
  ) values (
    actor_id,
    'tax.host_configuration_v2.certified',
    'property',
    target_property_id,
    'Host certified responsibility for flexible per-property tax lines.',
    jsonb_build_object(
      'county_name',
        nullif(trim(coalesce(county_name_value, '')), ''),
      'locality_name',
        nullif(trim(coalesce(locality_name_value, '')), ''),
      'line_count',
        jsonb_array_length(tax_lines_value),
      'certification_version',
        'HOST_TAX_RESPONSIBILITY_V2'
    )
  );
end;
$function$;

revoke all on function
  public.host_save_property_tax_configuration_v2(
    uuid,text,text,jsonb,boolean
  )
from public,anon;

grant execute on function
  public.host_save_property_tax_configuration_v2(
    uuid,text,text,jsonb,boolean
  )
to authenticated;

create or replace function public.service_save_property_tax_assistance_v2(
  target_property_id uuid,
  actor_profile_id uuid,
  county_name_value text,
  locality_name_value text,
  verification_notes_value text,
  tax_lines_value jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  now_value timestamptz := now();
  line_value jsonb;
  line_label text;
  line_category text;
  line_base_scope text;
  line_authority_name text;
  line_rate_bps integer;
  line_sort integer := 0;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if actor_profile_id is null then
    raise exception 'Admin actor is required';
  end if;

  if not exists (
    select 1 from public.properties
    where id = target_property_id
  ) then
    raise exception 'Property not found';
  end if;

  tax_lines_value := coalesce(tax_lines_value, '[]'::jsonb);

  if jsonb_typeof(tax_lines_value) <> 'array' then
    raise exception 'Tax lines must be an array';
  end if;

  if jsonb_array_length(tax_lines_value) > 12 then
    raise exception 'A property can have at most 12 custom tax lines';
  end if;

  delete from public.property_tax_lines
  where property_id = target_property_id;

  for line_value in
    select value from jsonb_array_elements(tax_lines_value)
  loop
    line_label :=
      left(trim(coalesce(line_value ->> 'label', '')), 160);
    line_category :=
      upper(trim(coalesce(line_value ->> 'category', 'OTHER')));
    line_base_scope :=
      upper(trim(coalesce(
        line_value ->> 'base_scope',
        'ACCOMMODATION_TOTAL'
      )));
    line_authority_name :=
      nullif(
        left(trim(coalesce(line_value ->> 'authority_name', '')), 180),
        ''
      );
    line_rate_bps :=
      coalesce((line_value ->> 'rate_bps')::integer, 0);
    line_sort := line_sort + 10;

    if line_rate_bps = 0 and line_label = '' then
      continue;
    end if;

    if line_label = '' then
      raise exception 'Every tax line with a rate needs a label';
    end if;

    if line_rate_bps < 0 or line_rate_bps > 10000 then
      raise exception 'Tax line rate is invalid';
    end if;

    if line_category not in (
      'LOCAL_SALES','LOCAL_LODGING','OTHER'
    ) then
      raise exception 'Tax line category is invalid';
    end if;

    if line_base_scope not in (
      'LODGING_ONLY','ACCOMMODATION_TOTAL','PRE_TAX_TOTAL'
    ) then
      raise exception 'Tax line base is invalid';
    end if;

    if line_rate_bps > 0 then
      insert into public.property_tax_lines (
        property_id,category,label,rate_bps,base_scope,
        authority_name,sort_order,is_active,created_by
      ) values (
        target_property_id,line_category,line_label,line_rate_bps,
        line_base_scope,line_authority_name,line_sort,true,actor_profile_id
      );
    end if;
  end loop;

  insert into public.property_tax_profiles (
    property_id,verification_status,county_name,locality_name,
    verification_notes,verified_by,verified_at,last_rate_review_at,
    host_responsibility_ack,host_certified_by,host_certified_at,
    certification_version,configuration_source,legacy_checkout_allowed,
    local_sales_rate_bps,local_lodging_rate_bps,local_lodging_label,
    updated_at
  ) values (
    target_property_id,'PENDING',
    nullif(trim(coalesce(county_name_value, '')), ''),
    nullif(trim(coalesce(locality_name_value, '')), ''),
    nullif(trim(coalesce(verification_notes_value, '')), ''),
    null,null,now_value,false,null,null,null,
    'ADMIN_ASSISTED',false,null,null,null,now_value
  )
  on conflict (property_id) do update
    set verification_status = 'PENDING',
        county_name = excluded.county_name,
        locality_name = excluded.locality_name,
        verification_notes = excluded.verification_notes,
        verified_by = null,
        verified_at = null,
        last_rate_review_at = now_value,
        host_responsibility_ack = false,
        host_certified_by = null,
        host_certified_at = null,
        certification_version = null,
        configuration_source = 'ADMIN_ASSISTED',
        legacy_checkout_allowed = false,
        local_sales_rate_bps = null,
        local_lodging_rate_bps = null,
        local_lodging_label = null,
        updated_at = now_value;

  delete from public.property_tax_rule_assignments
  where property_id = target_property_id;

  insert into public.audit_logs (
    actor_profile_id,action,entity_type,entity_id,reason,metadata
  ) values (
    actor_profile_id,
    'tax.admin_assistance_v2.saved',
    'property',
    target_property_id,
    'Admin assisted with flexible property tax lines; host certification is still required.',
    jsonb_build_object(
      'county_name',
        nullif(trim(coalesce(county_name_value, '')), ''),
      'locality_name',
        nullif(trim(coalesce(locality_name_value, '')), ''),
      'line_count',
        jsonb_array_length(tax_lines_value)
    )
  );
end;
$function$;

revoke all on function
  public.service_save_property_tax_assistance_v2(
    uuid,uuid,text,text,text,jsonb
  )
from public,anon,authenticated;

grant execute on function
  public.service_save_property_tax_assistance_v2(
    uuid,uuid,text,text,text,jsonb
  )
to service_role;

insert into public.tax_authorities (
  code,name,jurisdiction_type,country_code,region_code,
  locality_name,remittance_agency,source_url,is_active
) values
  (
    'MO_DOR_LODGING',
    'Missouri lodging sales tax',
    'STATE_SALES',
    'US','MO',null,
    'Missouri Department of Revenue',
    'https://dor.mo.gov/',
    true
  ),
  (
    'TX_COMPTROLLER_HOTEL',
    'Texas state hotel occupancy tax',
    'STATE_SALES',
    'US','TX',null,
    'Texas Comptroller of Public Accounts',
    'https://comptroller.texas.gov/taxes/hotel/',
    true
  ),
  (
    'TN_DOR_LODGING',
    'Tennessee short-term lodging sales tax',
    'STATE_SALES',
    'US','TN',null,
    'Tennessee Department of Revenue',
    'https://www.tn.gov/revenue/taxes/sales-and-use-tax.html',
    true
  )
on conflict (code) do update set
  name = excluded.name,
  jurisdiction_type = excluded.jurisdiction_type,
  country_code = excluded.country_code,
  region_code = excluded.region_code,
  locality_name = excluded.locality_name,
  remittance_agency = excluded.remittance_agency,
  source_url = excluded.source_url,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.tax_rules (
  authority_id,code,label,rate_bps,base_scope,automatic_region,
  assignment_required,maximum_stay_nights,effective_from,
  source_url,is_active
) values
  (
    (select id from public.tax_authorities
      where code = 'MO_DOR_LODGING'),
    'MO_LODGING_SALES_2026',
    'Missouri state lodging sales tax',
    400,
    'ACCOMMODATION_TOTAL',
    true,
    false,
    30,
    '2026-01-01',
    'https://dor.mo.gov/rulings/show/8194',
    true
  ),
  (
    (select id from public.tax_authorities
      where code = 'TX_COMPTROLLER_HOTEL'),
    'TX_STATE_HOTEL_2026',
    'Texas state hotel occupancy tax',
    600,
    'LODGING_ONLY',
    true,
    false,
    30,
    '2026-01-01',
    'https://comptroller.texas.gov/taxes/hotel/',
    true
  ),
  (
    (select id from public.tax_authorities
      where code = 'TN_DOR_LODGING'),
    'TN_STATE_SALES_2026',
    'Tennessee state sales tax',
    700,
    'PRE_TAX_TOTAL',
    true,
    false,
    89,
    '2026-01-01',
    'https://www.tn.gov/revenue/taxes/sales-and-use-tax.html',
    true
  )
on conflict (code) do update set
  authority_id = excluded.authority_id,
  label = excluded.label,
  rate_bps = excluded.rate_bps,
  base_scope = excluded.base_scope,
  automatic_region = excluded.automatic_region,
  assignment_required = excluded.assignment_required,
  maximum_stay_nights = excluded.maximum_stay_nights,
  effective_from = excluded.effective_from,
  source_url = excluded.source_url,
  is_active = excluded.is_active,
  updated_at = now();

create or replace function public.calculate_reservation_lodging_tax(
  target_reservation_id uuid,
  expected_environment public.payment_environment
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  reservation_row public.reservations%rowtype;
  property_row public.properties%rowtype;
  profile_row public.property_tax_profiles%rowtype;
  profile_found boolean := false;
  host_configured boolean := false;
  calculation_id uuid := gen_random_uuid();
  nights integer;
  lodging_cents bigint := 0;
  cleaning_cents bigint := 0;
  pet_cents bigint := 0;
  extra_guest_cents bigint := 0;
  addon_cents bigint := 0;
  accommodation_total_cents bigint := 0;
  taxable_base_cents bigint;
  line_tax_cents bigint;
  tax_total bigint := 0;
  tax_lines jsonb := '[]'::jsonb;
  rule_count integer := 0;
  automatic_rule_count integer := 0;
  custom_line_count integer := 0;
  rule_row record;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select reservations.* into reservation_row
  from public.reservations reservations
  where reservations.id = target_reservation_id
  for update;
  if not found then
    raise exception 'Reservation not found';
  end if;

  if reservation_row.payment_environment <> expected_environment then
    raise exception 'Reservation belongs to the wrong payment environment';
  end if;

  if reservation_row.status not in (
    'HOLD','PAYMENT_PENDING','PAYMENT_FAILED'
  ) then
    raise exception
      'Taxes cannot be recalculated after the reservation leaves checkout';
  end if;

  select properties.* into property_row
  from public.properties properties
  where properties.id = reservation_row.property_id;
  if not found then
    raise exception 'Reservation property not found';
  end if;

  select profiles.* into profile_row
  from public.property_tax_profiles profiles
  where profiles.property_id = reservation_row.property_id;
  profile_found := found;

  host_configured := profile_found and (
    (
      coalesce(profile_row.host_responsibility_ack, false)
      and profile_row.host_certified_at is not null
    )
    or coalesce(profile_row.legacy_checkout_allowed, false)
  );

  nights := reservation_row.check_out - reservation_row.check_in;

  if expected_environment = 'LIVE' then
    if nullif(trim(coalesce(property_row.street_address, '')), '') is null
       or nullif(trim(coalesce(property_row.city, '')), '') is null
       or nullif(trim(coalesce(property_row.region_code, '')), '') is null
       or nullif(trim(coalesce(property_row.postal_code, '')), '') is null
    then
      raise exception
        'Live checkout requires a complete property address for tax calculation';
    end if;

    if not host_configured then
      raise exception
        'Live checkout requires the host to complete and certify the property tax setup';
    end if;

    -- Preserve the existing production behavior until long-stay tax
    -- exemptions are modeled per state/locality.
    if nights >= 30 then
      raise exception
        'Live checkout for stays of 30 nights or more is blocked pending long-stay tax handling';
    end if;
  end if;

  lodging_cents :=
    greatest(
      coalesce(
        (reservation_row.pricing_snapshot
          ->> 'lodging_subtotal_cents')::bigint,
        0
      ),
      0
    );
  cleaning_cents :=
    greatest(
      coalesce(
        (reservation_row.pricing_snapshot
          ->> 'cleaning_fee_cents')::bigint,
        0
      ),
      0
    );
  pet_cents :=
    greatest(
      coalesce(
        (reservation_row.pricing_snapshot
          ->> 'pet_fee_cents')::bigint,
        0
      ),
      0
    );
  extra_guest_cents :=
    greatest(
      coalesce(
        (reservation_row.pricing_snapshot
          ->> 'extra_guest_fee_cents')::bigint,
        0
      ),
      0
    );
  addon_cents :=
    greatest(
      coalesce(
        (reservation_row.pricing_snapshot
          ->> 'add_on_subtotal_cents')::bigint,
        0
      ),
      0
    );

  accommodation_total_cents :=
    lodging_cents + cleaning_cents + pet_cents + extra_guest_cents;

  for rule_row in
    select
      rules.id as rule_id,
      rules.code as rule_code,
      rules.label,
      rules.rate_bps,
      rules.base_scope,
      authorities.id as authority_id,
      authorities.code as authority_code,
      authorities.name as authority_name,
      authorities.remittance_agency
    from public.tax_rules rules
    join public.tax_authorities authorities
      on authorities.id = rules.authority_id
    where rules.is_active
      and authorities.is_active
      and rules.automatic_region
      and not rules.assignment_required
      and upper(authorities.country_code) =
        upper(coalesce(property_row.country_code, 'US'))
      and (
        authorities.region_code is null
        or upper(authorities.region_code) =
          upper(coalesce(property_row.region_code, ''))
      )
      and reservation_row.check_in >= rules.effective_from
      and (
        rules.effective_to is null
        or reservation_row.check_in <= rules.effective_to
      )
      and (
        rules.maximum_stay_nights is null
        or nights <= rules.maximum_stay_nights
      )
    order by authorities.jurisdiction_type, rules.code
  loop
    taxable_base_cents :=
      case rule_row.base_scope
        when 'LODGING_ONLY'
          then lodging_cents
        when 'PRE_TAX_TOTAL'
          then reservation_row.pre_tax_total_cents
        else accommodation_total_cents
      end;

    taxable_base_cents :=
      greatest(coalesce(taxable_base_cents, 0), 0);
    line_tax_cents :=
      round(
        taxable_base_cents::numeric
        * rule_row.rate_bps::numeric
        / 10000
      )::bigint;

    tax_total := tax_total + greatest(line_tax_cents, 0);
    rule_count := rule_count + 1;
    automatic_rule_count := automatic_rule_count + 1;

    tax_lines :=
      tax_lines
      || jsonb_build_array(
        jsonb_build_object(
          'authority_id', rule_row.authority_id,
          'authority_code', rule_row.authority_code,
          'authority_name', rule_row.authority_name,
          'remittance_agency', rule_row.remittance_agency,
          'rule_id', rule_row.rule_id,
          'rule_code', rule_row.rule_code,
          'label', rule_row.label,
          'rate_bps', rule_row.rate_bps,
          'base_scope', rule_row.base_scope,
          'taxable_base_cents', taxable_base_cents,
          'tax_cents', greatest(line_tax_cents, 0),
          'source', 'PLATFORM_STATE_RULE'
        )
      );
  end loop;

  for rule_row in
    select
      lines.id as line_id,
      lines.category,
      lines.label,
      lines.rate_bps,
      lines.base_scope,
      lines.authority_name
    from public.property_tax_lines lines
    where lines.property_id = reservation_row.property_id
      and lines.is_active
      and lines.rate_bps > 0
    order by lines.sort_order, lines.created_at
  loop
    taxable_base_cents :=
      case rule_row.base_scope
        when 'LODGING_ONLY'
          then lodging_cents
        when 'PRE_TAX_TOTAL'
          then reservation_row.pre_tax_total_cents
        else accommodation_total_cents
      end;

    taxable_base_cents :=
      greatest(coalesce(taxable_base_cents, 0), 0);
    line_tax_cents :=
      round(
        taxable_base_cents::numeric
        * rule_row.rate_bps::numeric
        / 10000
      )::bigint;

    tax_total := tax_total + greatest(line_tax_cents, 0);
    rule_count := rule_count + 1;
    custom_line_count := custom_line_count + 1;

    tax_lines :=
      tax_lines
      || jsonb_build_array(
        jsonb_build_object(
          'authority_id', null,
          'authority_code', 'HOST_PROPERTY_TAX',
          'authority_name',
            coalesce(
              rule_row.authority_name,
              profile_row.locality_name,
              'Local jurisdiction'
            ),
          'remittance_agency', 'Host responsibility',
          'rule_id', rule_row.line_id,
          'rule_code', 'HOST_PROPERTY_TAX_LINE',
          'category', rule_row.category,
          'label', rule_row.label,
          'rate_bps', rule_row.rate_bps,
          'base_scope', rule_row.base_scope,
          'taxable_base_cents', taxable_base_cents,
          'tax_cents', greatest(line_tax_cents, 0),
          'source', 'HOST_CERTIFIED'
        )
      );
  end loop;

  -- Compatibility for any grandfathered property whose old assignments
  -- were not migrated to flexible tax lines.
  if custom_line_count = 0
     and profile_found
     and coalesce(profile_row.legacy_checkout_allowed, false)
  then
    for rule_row in
      select
        rules.id as rule_id,
        rules.code as rule_code,
        rules.label,
        rules.rate_bps,
        rules.base_scope,
        authorities.id as authority_id,
        authorities.code as authority_code,
        authorities.name as authority_name,
        authorities.remittance_agency
      from public.tax_rules rules
      join public.tax_authorities authorities
        on authorities.id = rules.authority_id
      join public.property_tax_rule_assignments assignments
        on assignments.tax_rule_id = rules.id
       and assignments.property_id = reservation_row.property_id
      where rules.is_active
        and authorities.is_active
      order by authorities.jurisdiction_type, rules.code
    loop
      taxable_base_cents :=
        case rule_row.base_scope
          when 'LODGING_ONLY'
            then lodging_cents
          when 'PRE_TAX_TOTAL'
            then reservation_row.pre_tax_total_cents
          else accommodation_total_cents
        end;

      taxable_base_cents :=
        greatest(coalesce(taxable_base_cents, 0), 0);
      line_tax_cents :=
        round(
          taxable_base_cents::numeric
          * rule_row.rate_bps::numeric
          / 10000
        )::bigint;

      tax_total := tax_total + greatest(line_tax_cents, 0);
      rule_count := rule_count + 1;

      tax_lines :=
        tax_lines
        || jsonb_build_array(
          jsonb_build_object(
            'authority_id', rule_row.authority_id,
            'authority_code', rule_row.authority_code,
            'authority_name', rule_row.authority_name,
            'remittance_agency', rule_row.remittance_agency,
            'rule_id', rule_row.rule_id,
            'rule_code', rule_row.rule_code,
            'label', rule_row.label,
            'rate_bps', rule_row.rate_bps,
            'base_scope', rule_row.base_scope,
            'taxable_base_cents', taxable_base_cents,
            'tax_cents', greatest(line_tax_cents, 0),
            'source', 'LEGACY_ADMIN_RULE'
          )
        );
    end loop;
  end if;

  if expected_environment = 'LIVE'
     and upper(coalesce(property_row.region_code, '')) = 'AR'
     and automatic_rule_count < 2
  then
    raise exception
      'Arkansas live checkout requires current state sales and tourism tax rules';
  end if;

  if expected_environment = 'LIVE'
     and upper(coalesce(property_row.region_code, '')) in ('MO','TX','TN')
     and automatic_rule_count < 1
  then
    raise exception
      'No current statewide lodging-tax rule is configured for this property state';
  end if;

  update public.reservations reservations
  set
    tax_total_cents = tax_total,
    guest_total_cents =
      reservations.pre_tax_total_cents + tax_total,
    tax_status = 'CALCULATED',
    tax_snapshot = jsonb_build_object(
      'calculation_id', calculation_id,
      'calculated_at', now(),
      'calculation_engine', 'FAP_STATE_AWARE_HOST_TAX_V3',
      'payment_environment', expected_environment,
      'settlement', 'HOST_CONNECTED_ACCOUNT',
      'platform_tax_retained_cents', 0,
      'property', jsonb_build_object(
        'property_id', property_row.id,
        'street_address', property_row.street_address,
        'city', property_row.city,
        'region_code', property_row.region_code,
        'postal_code', property_row.postal_code,
        'country_code', property_row.country_code,
        'county_name',
          case when profile_found then profile_row.county_name else null end,
        'locality_name',
          case when profile_found then profile_row.locality_name else null end,
        'host_tax_configuration', host_configured,
        'host_certified_at',
          case when profile_found
            then profile_row.host_certified_at
            else null
          end,
        'configuration_source',
          case when profile_found
            then profile_row.configuration_source
            else null
          end
      ),
      'components', jsonb_build_object(
        'lodging_cents', lodging_cents,
        'cleaning_cents', cleaning_cents,
        'pet_cents', pet_cents,
        'extra_guest_cents', extra_guest_cents,
        'add_on_cents', addon_cents,
        'pre_tax_total_cents',
          reservations.pre_tax_total_cents
      ),
      'automatic_rule_count', automatic_rule_count,
      'custom_line_count', custom_line_count,
      'rules', tax_lines,
      'tax_total_cents', tax_total,
      'responsibility', 'HOST'
    ),
    tax_provider = 'FAP_STATE_AWARE_HOST_RULES',
    tax_provider_calculation_id = calculation_id::text,
    platform_tax_retained_cents = 0,
    updated_at = now()
  where reservations.id = target_reservation_id
  returning * into reservation_row;

  insert into public.reservation_events (
    reservation_id,event_type,actor_profile_id,metadata
  ) values (
    target_reservation_id,
    'TAX_CALCULATED',
    null,
    jsonb_build_object(
      'calculation_id', calculation_id,
      'tax_total_cents', tax_total,
      'guest_total_cents', reservation_row.guest_total_cents,
      'platform_tax_retained_cents', 0,
      'tax_settlement', 'HOST_CONNECTED_ACCOUNT',
      'tax_responsibility', 'HOST',
      'automatic_rule_count', automatic_rule_count,
      'custom_line_count', custom_line_count,
      'payment_environment', expected_environment
    )
  );

  return jsonb_build_object(
    'calculation_id', calculation_id,
    'tax_status', 'CALCULATED',
    'tax_total_cents', tax_total,
    'guest_total_cents', reservation_row.guest_total_cents,
    'platform_tax_retained_cents', 0,
    'host_tax_cents', tax_total,
    'tax_settlement', 'HOST_CONNECTED_ACCOUNT',
    'tax_responsibility', 'HOST',
    'tax_snapshot', reservation_row.tax_snapshot
  );
end;
$function$;

revoke all on function public.calculate_reservation_lodging_tax(
  uuid,public.payment_environment
) from public,anon,authenticated;
grant execute on function public.calculate_reservation_lodging_tax(
  uuid,public.payment_environment
) to service_role;


-- Recover local rules from the latest historical tax snapshot when the first
-- host-responsibility UI accidentally saved 0% local fields over an older
-- verified configuration.
insert into public.property_tax_lines (
  property_id,category,label,rate_bps,base_scope,
  authority_name,sort_order,created_by
)
select
  profiles.property_id,
  case
    when authorities.jurisdiction_type = 'LOCAL_LODGING'
      then 'LOCAL_LODGING'
    when authorities.jurisdiction_type in (
      'CITY_SALES','COUNTY_SALES','STATE_SALES'
    )
      then 'LOCAL_SALES'
    else 'OTHER'
  end,
  rules.label,
  rules.rate_bps,
  rules.base_scope,
  authorities.name,
  100 + row_number() over (
    partition by profiles.property_id order by rules.label
  ),
  profiles.host_certified_by
from public.property_tax_profiles profiles
join lateral (
  select reservations.tax_snapshot
  from public.reservations reservations
  where reservations.property_id = profiles.property_id
    and jsonb_typeof(reservations.tax_snapshot -> 'rules') = 'array'
    and jsonb_array_length(reservations.tax_snapshot -> 'rules') > 0
  order by reservations.created_at desc
  limit 1
) latest on true
join lateral
  jsonb_array_elements(latest.tax_snapshot -> 'rules') snapshot_rule
  on true
join public.tax_rules rules
  on rules.id = nullif(snapshot_rule ->> 'rule_id', '')::uuid
join public.tax_authorities authorities
  on authorities.id = rules.authority_id
where profiles.certification_version = 'HOST_TAX_RESPONSIBILITY_V1'
  and rules.assignment_required
  and not exists (
    select 1
    from public.property_tax_lines existing
    where existing.property_id = profiles.property_id
      and existing.label = rules.label
      and existing.rate_bps = rules.rate_bps
  );

-- The previous production model explicitly required two Hot Springs local
-- rules. If none can be recovered, force host review rather than silently
-- running live checkout with only the statewide taxes.
update public.property_tax_profiles profiles
set
  host_responsibility_ack = false,
  host_certified_by = null,
  host_certified_at = null,
  certification_version = null,
  configuration_source = 'ADMIN_ASSISTED',
  verification_status = 'PENDING',
  verified_by = null,
  verified_at = null,
  updated_at = now()
from public.properties properties
where properties.id = profiles.property_id
  and profiles.certification_version = 'HOST_TAX_RESPONSIBILITY_V1'
  and upper(trim(coalesce(properties.city, ''))) = 'HOT SPRINGS'
  and not exists (
    select 1
    from public.property_tax_lines lines
    where lines.property_id = profiles.property_id
      and lines.is_active
      and lines.rate_bps > 0
  );

notify pgrst, 'reload schema';

commit;
