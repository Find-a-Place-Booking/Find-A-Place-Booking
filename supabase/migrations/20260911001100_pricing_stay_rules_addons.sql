-- Find A Place Booking
-- Milestone 9A: pricing, date rules, stay rules and optional add-ons.
--
-- This milestone deliberately separates pricing from availability. Calendar/PMS
-- integrations will decide whether a night is open; these records decide the
-- price and stay rules for that night. Payment processors will consume the
-- structured quote output later rather than owning platform pricing logic.

begin;

create type public.rate_rule_kind as enum ('SPECIAL', 'SEASONAL', 'CUSTOM');
create type public.add_on_calculation as enum ('FLAT_PER_STAY', 'PER_NIGHT', 'PER_PERSON', 'PER_PERSON_PER_NIGHT');

alter table public.unit_rate_settings
  add column included_guests integer check (included_guests is null or included_guests between 1 and 100);

create table public.unit_rate_rules (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.property_units(id) on delete cascade,
  label text not null,
  kind public.rate_rule_kind not null default 'CUSTOM',
  start_date date not null,
  end_date date not null,
  nightly_cents integer not null check (nightly_cents >= 0),
  weekend_cents integer check (weekend_cents is null or weekend_cents >= 0),
  priority integer not null default 100 check (priority between 0 and 1000),
  is_public_special boolean not null default false,
  special_badge text,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (char_length(trim(label)) between 1 and 120),
  check (special_badge is null or char_length(special_badge) <= 80)
);

create index unit_rate_rules_unit_dates_idx
  on public.unit_rate_rules(unit_id, start_date, end_date)
  where is_active;

create table public.unit_stay_rules (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.property_units(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  minimum_nights integer not null check (minimum_nights between 1 and 365),
  priority integer not null default 100 check (priority between 0 and 1000),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (char_length(trim(label)) between 1 and 120)
);

create index unit_stay_rules_unit_dates_idx
  on public.unit_stay_rules(unit_id, start_date, end_date)
  where is_active;

create table public.unit_add_ons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.property_units(id) on delete cascade,
  name text not null,
  description text,
  amount_cents integer not null check (amount_cents >= 0),
  calculation public.add_on_calculation not null default 'FLAT_PER_STAY',
  guest_visible boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  tax_category text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(name)) between 1 and 120),
  check (description is null or char_length(description) <= 1000),
  check (tax_category is null or char_length(tax_category) <= 120)
);

create index unit_add_ons_unit_idx
  on public.unit_add_ons(unit_id, is_active, sort_order, created_at);

create trigger unit_rate_rules_set_updated_at
before update on public.unit_rate_rules
for each row execute function public.set_updated_at();

create trigger unit_stay_rules_set_updated_at
before update on public.unit_stay_rules
for each row execute function public.set_updated_at();

create trigger unit_add_ons_set_updated_at
before update on public.unit_add_ons
for each row execute function public.set_updated_at();

alter table public.unit_rate_rules enable row level security;
alter table public.unit_stay_rules enable row level security;
alter table public.unit_add_ons enable row level security;

create policy unit_rate_rules_select_member_or_admin on public.unit_rate_rules
for select to authenticated using (public.can_access_unit(unit_id));

create policy unit_stay_rules_select_member_or_admin on public.unit_stay_rules
for select to authenticated using (public.can_access_unit(unit_id));

create policy unit_add_ons_select_member_or_admin on public.unit_add_ons
for select to authenticated using (public.can_access_unit(unit_id));

-- Writes stay behind audited RPCs. Pricing can be managed while a listing is
-- published; unlike identity/photos, operational pricing should not require a
-- new listing-review cycle. Archived properties remain frozen.
create or replace function public.can_manage_unit_pricing(target_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.property_units units
    join public.properties properties on properties.id = units.property_id
    where units.id = target_unit_id
      and properties.status <> 'ARCHIVED'
      and public.can_manage_property(properties.id)
  );
$$;

create or replace function public.host_pricing_bundle(target_unit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.can_access_unit(target_unit_id) then raise exception 'Unit access required'; end if;

  select jsonb_build_object(
    'base', coalesce((
      select jsonb_build_object(
        'currency', rates.currency,
        'weeknight_cents', rates.weeknight_cents,
        'weekend_cents', rates.weekend_cents,
        'included_guests', rates.included_guests
      )
      from public.unit_rate_settings rates
      where rates.unit_id = target_unit_id
    ), jsonb_build_object('currency','USD','weeknight_cents',null,'weekend_cents',null,'included_guests',null)),
    'fees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fees.id,
        'fee_type', fees.fee_type,
        'label', fees.label,
        'amount_cents', fees.amount_cents,
        'calculation', fees.calculation
      ) order by fees.fee_type::text)
      from public.unit_fees fees
      where fees.unit_id = target_unit_id
    ), '[]'::jsonb),
    'rate_rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rules.id,
        'label', rules.label,
        'kind', rules.kind,
        'start_date', rules.start_date,
        'end_date', rules.end_date,
        'nightly_cents', rules.nightly_cents,
        'weekend_cents', rules.weekend_cents,
        'priority', rules.priority,
        'is_public_special', rules.is_public_special,
        'special_badge', rules.special_badge,
        'is_active', rules.is_active
      ) order by rules.start_date, rules.priority desc, rules.created_at)
      from public.unit_rate_rules rules
      where rules.unit_id = target_unit_id
    ), '[]'::jsonb),
    'stay_rules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rules.id,
        'label', rules.label,
        'start_date', rules.start_date,
        'end_date', rules.end_date,
        'minimum_nights', rules.minimum_nights,
        'priority', rules.priority,
        'is_active', rules.is_active
      ) order by rules.start_date, rules.priority desc, rules.created_at)
      from public.unit_stay_rules rules
      where rules.unit_id = target_unit_id
    ), '[]'::jsonb),
    'add_ons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', addons.id,
        'name', addons.name,
        'description', addons.description,
        'amount_cents', addons.amount_cents,
        'calculation', addons.calculation,
        'guest_visible', addons.guest_visible,
        'is_active', addons.is_active,
        'sort_order', addons.sort_order,
        'tax_category', addons.tax_category
      ) order by addons.sort_order, addons.created_at)
      from public.unit_add_ons addons
      where addons.unit_id = target_unit_id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.save_unit_base_pricing(target_unit_id uuid, pricing_data jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  weeknight_value integer := public.money_text_to_cents(pricing_data ->> 'weeknight');
  weekend_value integer := public.money_text_to_cents(pricing_data ->> 'weekend');
  cleaning_value integer := public.money_text_to_cents(pricing_data ->> 'cleaning');
  pet_value integer := public.money_text_to_cents(pricing_data ->> 'pet');
  extra_value integer := public.money_text_to_cents(pricing_data ->> 'extraGuest');
  included_value integer := public.safe_integer(pricing_data ->> 'includedGuests');
  before_state jsonb;
  after_state jsonb;
  max_guests_value integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_pricing(target_unit_id) then raise exception 'Pricing manager access required'; end if;
  if weeknight_value is null or weeknight_value < 1 then raise exception 'A base weeknight rate greater than zero is required'; end if;
  if weekend_value is not null and weekend_value < 1 then raise exception 'Weekend rate must be greater than zero'; end if;
  if included_value is not null and (included_value < 1 or included_value > 100) then raise exception 'Included guest count is invalid'; end if;
  select units.max_guests into max_guests_value from public.property_units units where units.id=target_unit_id;
  if included_value is not null and max_guests_value is not null and included_value > max_guests_value then raise exception 'Included guest count cannot exceed maximum guests'; end if;

  before_state := public.host_pricing_bundle(target_unit_id);

  insert into public.unit_rate_settings (unit_id, weeknight_cents, weekend_cents, included_guests)
  values (target_unit_id, weeknight_value, weekend_value, included_value)
  on conflict (unit_id) do update
    set weeknight_cents = excluded.weeknight_cents,
        weekend_cents = excluded.weekend_cents,
        included_guests = excluded.included_guests,
        updated_at = now();

  delete from public.unit_fees fees
  where fees.unit_id = target_unit_id and fees.fee_type in ('CLEANING','PET','EXTRA_GUEST');

  if cleaning_value is not null and cleaning_value > 0 then
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (target_unit_id, 'CLEANING', 'Cleaning fee', cleaning_value, 'FLAT_PER_STAY');
  end if;
  if pet_value is not null and pet_value > 0 then
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (target_unit_id, 'PET', 'Pet fee', pet_value, 'PER_PET_PER_STAY');
  end if;
  if extra_value is not null and extra_value > 0 then
    if included_value is null then raise exception 'Set how many guests are included before charging an extra guest fee'; end if;
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (target_unit_id, 'EXTRA_GUEST', 'Extra guest fee', extra_value, 'PER_GUEST_PER_NIGHT');
  end if;

  after_state := public.host_pricing_bundle(target_unit_id);

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, reason, before_state, after_state, metadata)
  values (actor_id, 'pricing.base.updated', 'property_unit', target_unit_id, 'Host updated base rates and fees.', before_state, after_state, jsonb_build_object('source','host_rates'));

  return after_state;
end;
$$;

create or replace function public.upsert_unit_rate_rule(target_unit_id uuid, target_rule_id uuid, rule_data jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result_id uuid;
  clean_label text := left(nullif(trim(coalesce(rule_data ->> 'label','')), ''), 120);
  start_value date;
  end_value date;
  nightly_value integer := public.money_text_to_cents(rule_data ->> 'nightly');
  weekend_value integer := public.money_text_to_cents(rule_data ->> 'weekend');
  priority_value integer := coalesce(public.safe_integer(rule_data ->> 'priority'), 100);
  kind_value public.rate_rule_kind;
  public_value boolean := coalesce((rule_data ->> 'isPublicSpecial')::boolean, false);
  active_value boolean := coalesce((rule_data ->> 'isActive')::boolean, true);
  badge_value text := left(nullif(trim(coalesce(rule_data ->> 'specialBadge','')), ''), 80);
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_pricing(target_unit_id) then raise exception 'Pricing manager access required'; end if;
  if clean_label is null then raise exception 'Rate rule label is required'; end if;
  begin
    start_value := (rule_data ->> 'startDate')::date;
    end_value := (rule_data ->> 'endDate')::date;
  exception when others then
    raise exception 'Valid start and end dates are required';
  end;
  if end_value < start_value then raise exception 'End date must be on or after start date'; end if;
  if nightly_value is null or nightly_value < 1 then raise exception 'Nightly override must be greater than zero'; end if;
  if weekend_value is not null and weekend_value < 1 then raise exception 'Weekend override must be greater than zero'; end if;
  if priority_value < 0 or priority_value > 1000 then raise exception 'Priority must be between 0 and 1000'; end if;

  kind_value := case upper(trim(coalesce(rule_data ->> 'kind','CUSTOM')))
    when 'SPECIAL' then 'SPECIAL'::public.rate_rule_kind
    when 'SEASONAL' then 'SEASONAL'::public.rate_rule_kind
    else 'CUSTOM'::public.rate_rule_kind
  end;

  if target_rule_id is null then
    insert into public.unit_rate_rules (unit_id,label,kind,start_date,end_date,nightly_cents,weekend_cents,priority,is_public_special,special_badge,is_active,created_by)
    values (target_unit_id,clean_label,kind_value,start_value,end_value,nightly_value,weekend_value,priority_value,public_value,badge_value,active_value,actor_id)
    returning id into result_id;
  else
    update public.unit_rate_rules rules
    set label=clean_label, kind=kind_value, start_date=start_value, end_date=end_value,
        nightly_cents=nightly_value, weekend_cents=weekend_value, priority=priority_value,
        is_public_special=public_value, special_badge=badge_value, is_active=active_value
    where rules.id=target_rule_id and rules.unit_id=target_unit_id
    returning id into result_id;
    if result_id is null then raise exception 'Rate rule not found'; end if;
  end if;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, reason, metadata)
  values (actor_id, case when target_rule_id is null then 'pricing.rate_rule.created' else 'pricing.rate_rule.updated' end,
          'rate_rule', result_id, 'Host changed a date-based rate rule.', jsonb_build_object('unit_id',target_unit_id));
  return result_id;
end;
$$;

create or replace function public.delete_unit_rate_rule(target_unit_id uuid, target_rule_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid()); deleted_count integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_pricing(target_unit_id) then raise exception 'Pricing manager access required'; end if;
  delete from public.unit_rate_rules rules where rules.id=target_rule_id and rules.unit_id=target_unit_id;
  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then raise exception 'Rate rule not found'; end if;
  insert into public.audit_logs (actor_profile_id,action,entity_type,entity_id,reason,metadata)
  values (actor_id,'pricing.rate_rule.deleted','rate_rule',target_rule_id,'Host removed a date-based rate rule.',jsonb_build_object('unit_id',target_unit_id));
end;
$$;

create or replace function public.upsert_unit_stay_rule(target_unit_id uuid, target_rule_id uuid, rule_data jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid()); result_id uuid;
  clean_label text := left(nullif(trim(coalesce(rule_data ->> 'label','')), ''),120);
  start_value date; end_value date;
  minimum_value integer := public.safe_integer(rule_data ->> 'minimumNights');
  priority_value integer := coalesce(public.safe_integer(rule_data ->> 'priority'),100);
  active_value boolean := coalesce((rule_data ->> 'isActive')::boolean,true);
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_pricing(target_unit_id) then raise exception 'Pricing manager access required'; end if;
  if clean_label is null then raise exception 'Stay rule label is required'; end if;
  begin start_value := (rule_data ->> 'startDate')::date; end_value := (rule_data ->> 'endDate')::date;
  exception when others then raise exception 'Valid start and end dates are required'; end;
  if end_value < start_value then raise exception 'End date must be on or after start date'; end if;
  if minimum_value is null or minimum_value < 1 or minimum_value > 365 then raise exception 'Minimum nights must be between 1 and 365'; end if;
  if priority_value < 0 or priority_value > 1000 then raise exception 'Priority must be between 0 and 1000'; end if;

  if target_rule_id is null then
    insert into public.unit_stay_rules (unit_id,label,start_date,end_date,minimum_nights,priority,is_active,created_by)
    values (target_unit_id,clean_label,start_value,end_value,minimum_value,priority_value,active_value,actor_id)
    returning id into result_id;
  else
    update public.unit_stay_rules rules
    set label=clean_label,start_date=start_value,end_date=end_value,minimum_nights=minimum_value,priority=priority_value,is_active=active_value
    where rules.id=target_rule_id and rules.unit_id=target_unit_id returning id into result_id;
    if result_id is null then raise exception 'Stay rule not found'; end if;
  end if;

  insert into public.audit_logs (actor_profile_id,action,entity_type,entity_id,reason,metadata)
  values (actor_id,case when target_rule_id is null then 'pricing.stay_rule.created' else 'pricing.stay_rule.updated' end,
          'stay_rule',result_id,'Host changed a date-based minimum-stay rule.',jsonb_build_object('unit_id',target_unit_id));
  return result_id;
end;
$$;

create or replace function public.delete_unit_stay_rule(target_unit_id uuid, target_rule_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid()); deleted_count integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_pricing(target_unit_id) then raise exception 'Pricing manager access required'; end if;
  delete from public.unit_stay_rules rules where rules.id=target_rule_id and rules.unit_id=target_unit_id;
  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then raise exception 'Stay rule not found'; end if;
  insert into public.audit_logs (actor_profile_id,action,entity_type,entity_id,reason,metadata)
  values (actor_id,'pricing.stay_rule.deleted','stay_rule',target_rule_id,'Host removed a date-based minimum-stay rule.',jsonb_build_object('unit_id',target_unit_id));
end;
$$;

create or replace function public.upsert_unit_add_on(target_unit_id uuid, target_add_on_id uuid, add_on_data jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid()); result_id uuid;
  clean_name text := left(nullif(trim(coalesce(add_on_data ->> 'name','')), ''),120);
  description_value text := left(nullif(trim(coalesce(add_on_data ->> 'description','')), ''),1000);
  amount_value integer := public.money_text_to_cents(add_on_data ->> 'amount');
  calc_value public.add_on_calculation;
  visible_value boolean := coalesce((add_on_data ->> 'guestVisible')::boolean,true);
  active_value boolean := coalesce((add_on_data ->> 'isActive')::boolean,true);
  sort_value integer := coalesce(public.safe_integer(add_on_data ->> 'sortOrder'),0);
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_pricing(target_unit_id) then raise exception 'Pricing manager access required'; end if;
  if clean_name is null then raise exception 'Add-on name is required'; end if;
  if amount_value is null or amount_value < 0 then raise exception 'Add-on amount is invalid'; end if;
  calc_value := case upper(trim(coalesce(add_on_data ->> 'calculation','FLAT_PER_STAY')))
    when 'PER_NIGHT' then 'PER_NIGHT'::public.add_on_calculation
    when 'PER_PERSON' then 'PER_PERSON'::public.add_on_calculation
    when 'PER_PERSON_PER_NIGHT' then 'PER_PERSON_PER_NIGHT'::public.add_on_calculation
    else 'FLAT_PER_STAY'::public.add_on_calculation
  end;

  if target_add_on_id is null then
    insert into public.unit_add_ons (unit_id,name,description,amount_cents,calculation,guest_visible,is_active,sort_order,created_by)
    values (target_unit_id,clean_name,description_value,amount_value,calc_value,visible_value,active_value,sort_value,actor_id)
    returning id into result_id;
  else
    update public.unit_add_ons addons
    set name=clean_name,description=description_value,amount_cents=amount_value,calculation=calc_value,
        guest_visible=visible_value,is_active=active_value,sort_order=sort_value
    where addons.id=target_add_on_id and addons.unit_id=target_unit_id returning id into result_id;
    if result_id is null then raise exception 'Add-on not found'; end if;
  end if;

  insert into public.audit_logs (actor_profile_id,action,entity_type,entity_id,reason,metadata)
  values (actor_id,case when target_add_on_id is null then 'pricing.add_on.created' else 'pricing.add_on.updated' end,
          'add_on',result_id,'Host changed an optional guest add-on.',jsonb_build_object('unit_id',target_unit_id));
  return result_id;
end;
$$;

create or replace function public.delete_unit_add_on(target_unit_id uuid, target_add_on_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid()); deleted_count integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_pricing(target_unit_id) then raise exception 'Pricing manager access required'; end if;
  delete from public.unit_add_ons addons where addons.id=target_add_on_id and addons.unit_id=target_unit_id;
  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then raise exception 'Add-on not found'; end if;
  insert into public.audit_logs (actor_profile_id,action,entity_type,entity_id,reason,metadata)
  values (actor_id,'pricing.add_on.deleted','add_on',target_add_on_id,'Host removed an optional guest add-on.',jsonb_build_object('unit_id',target_unit_id));
end;
$$;

-- Deterministic pricing-day resolver used by the host UI now and by the future
-- availability/calendar layer. Higher priority wins; ties prefer the narrower
-- date range, then the newest rule. Friday/Saturday use weekend pricing.
create or replace function public.resolve_unit_pricing_days(target_unit_id uuid, range_start date, range_end date)
returns table (
  stay_date date,
  nightly_cents integer,
  currency text,
  rate_source text,
  rate_rule_id uuid,
  special_label text,
  minimum_stay_nights integer,
  stay_rule_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.can_access_unit(target_unit_id) then raise exception 'Unit access required'; end if;
  if range_start is null or range_end is null or range_end < range_start then raise exception 'Invalid pricing date range'; end if;
  if range_end - range_start > 400 then raise exception 'Pricing date range is too large'; end if;

  return query
  with base as (
    select rates.currency, rates.weeknight_cents, rates.weekend_cents
    from public.unit_rate_settings rates where rates.unit_id=target_unit_id
  ), days as (
    select day::date as stay_date from generate_series(range_start::timestamp, range_end::timestamp, interval '1 day') day
  )
  select
    days.stay_date,
    coalesce(
      case when extract(isodow from days.stay_date) in (5,6) then coalesce(rate_pick.weekend_cents, rate_pick.nightly_cents) else rate_pick.nightly_cents end,
      case when extract(isodow from days.stay_date) in (5,6) then coalesce(base.weekend_cents, base.weeknight_cents) else base.weeknight_cents end
    )::integer as nightly_cents,
    coalesce(base.currency,'USD')::text as currency,
    case when rate_pick.id is null then case when extract(isodow from days.stay_date) in (5,6) and base.weekend_cents is not null then 'BASE_WEEKEND' else 'BASE_WEEKDAY' end else 'RATE_RULE' end::text as rate_source,
    rate_pick.id as rate_rule_id,
    case when rate_pick.is_public_special then coalesce(rate_pick.special_badge,rate_pick.label) else null end::text as special_label,
    coalesce(stay_pick.minimum_nights, units.minimum_stay_nights, 1)::integer as minimum_stay_nights,
    stay_pick.id as stay_rule_id
  from days
  cross join public.property_units units
  left join base on true
  left join lateral (
    select rules.* from public.unit_rate_rules rules
    where rules.unit_id=target_unit_id and rules.is_active and days.stay_date between rules.start_date and rules.end_date
    order by rules.priority desc, (rules.end_date-rules.start_date) asc, rules.created_at desc
    limit 1
  ) rate_pick on true
  left join lateral (
    select rules.* from public.unit_stay_rules rules
    where rules.unit_id=target_unit_id and rules.is_active and days.stay_date between rules.start_date and rules.end_date
    order by rules.priority desc, (rules.end_date-rules.start_date) asc, rules.created_at desc
    limit 1
  ) stay_pick on true
  where units.id=target_unit_id;
end;
$$;

-- Structured pre-tax quote. It intentionally does NOT check availability,
-- calculate taxes, charge a payment processor, create a hold or create a
-- reservation. Those flags stay false until later verified integrations.
create or replace function public.quote_unit_stay(
  target_unit_id uuid,
  check_in_date date,
  check_out_date date,
  guest_count integer,
  pet_count integer default 0,
  selected_add_on_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  night_count integer;
  minimum_required integer;
  lodging_total bigint := 0;
  cleaning_total bigint := 0;
  pet_total bigint := 0;
  extra_guest_total bigint := 0;
  add_on_total bigint := 0;
  included_count integer;
  currency_value text := 'USD';
  lodging_lines jsonb := '[]'::jsonb;
  fee_lines jsonb := '[]'::jsonb;
  addon_lines jsonb := '[]'::jsonb;
  fee_row record;
  addon_row record;
  day_row record;
  amount_value bigint;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.can_access_unit(target_unit_id) then raise exception 'Unit access required'; end if;
  if check_in_date is null or check_out_date is null or check_out_date <= check_in_date then raise exception 'Checkout must be after check-in'; end if;
  night_count := check_out_date - check_in_date;
  if night_count > 365 then raise exception 'Stay is too long'; end if;
  if guest_count is null or guest_count < 1 then raise exception 'Guest count must be at least one'; end if;
  if exists (select 1 from public.property_units units where units.id=target_unit_id and units.max_guests is not null and guest_count > units.max_guests) then raise exception 'Guest count exceeds property capacity'; end if;
  if pet_count is null or pet_count < 0 then raise exception 'Pet count is invalid'; end if;

  select coalesce(rates.included_guests, units.max_guests), coalesce(rates.currency,'USD')
  into included_count, currency_value
  from public.property_units units
  left join public.unit_rate_settings rates on rates.unit_id=units.id
  where units.id=target_unit_id;

  for day_row in
    select * from public.resolve_unit_pricing_days(target_unit_id, check_in_date, check_out_date - 1)
    order by stay_date
  loop
    if day_row.nightly_cents is null then raise exception 'Pricing is incomplete for %', day_row.stay_date; end if;
    lodging_total := lodging_total + day_row.nightly_cents;
    lodging_lines := lodging_lines || jsonb_build_array(jsonb_build_object(
      'date',day_row.stay_date,'amount_cents',day_row.nightly_cents,'source',day_row.rate_source,
      'rate_rule_id',day_row.rate_rule_id,'special_label',day_row.special_label
    ));
  end loop;

  select resolved.minimum_stay_nights into minimum_required
  from public.resolve_unit_pricing_days(target_unit_id, check_in_date, check_in_date) resolved
  limit 1;
  minimum_required := coalesce(minimum_required,1);
  if night_count < minimum_required then raise exception 'This arrival date requires a minimum stay of % nights', minimum_required; end if;

  for fee_row in select * from public.unit_fees fees where fees.unit_id=target_unit_id loop
    amount_value := 0;
    if fee_row.fee_type='CLEANING' then
      amount_value := fee_row.amount_cents;
      cleaning_total := amount_value;
    elsif fee_row.fee_type='PET' and pet_count > 0 then
      amount_value := case fee_row.calculation when 'PER_PET_PER_STAY' then fee_row.amount_cents * pet_count else fee_row.amount_cents end;
      pet_total := amount_value;
    elsif fee_row.fee_type='EXTRA_GUEST' and included_count is not null and guest_count > included_count then
      amount_value := fee_row.amount_cents * (guest_count-included_count) * night_count;
      extra_guest_total := amount_value;
    end if;
    if amount_value > 0 then
      fee_lines := fee_lines || jsonb_build_array(jsonb_build_object('id',fee_row.id,'type',fee_row.fee_type,'label',fee_row.label,'amount_cents',amount_value));
    end if;
  end loop;

  for addon_row in
    select addons.* from public.unit_add_ons addons
    where addons.unit_id=target_unit_id and addons.is_active and addons.id=any(coalesce(selected_add_on_ids,'{}'::uuid[]))
    order by addons.sort_order, addons.created_at
  loop
    amount_value := case addon_row.calculation
      when 'PER_NIGHT' then addon_row.amount_cents * night_count
      when 'PER_PERSON' then addon_row.amount_cents * guest_count
      when 'PER_PERSON_PER_NIGHT' then addon_row.amount_cents * guest_count * night_count
      else addon_row.amount_cents
    end;
    add_on_total := add_on_total + amount_value;
    addon_lines := addon_lines || jsonb_build_array(jsonb_build_object(
      'id',addon_row.id,'name',addon_row.name,'calculation',addon_row.calculation,'amount_cents',amount_value,'tax_category',addon_row.tax_category
    ));
  end loop;

  return jsonb_build_object(
    'unit_id',target_unit_id,
    'currency',currency_value,
    'check_in',check_in_date,
    'check_out',check_out_date,
    'nights',night_count,
    'guest_count',guest_count,
    'pet_count',pet_count,
    'minimum_stay_nights',minimum_required,
    'lodging_lines',lodging_lines,
    'lodging_subtotal_cents',lodging_total,
    'fee_lines',fee_lines,
    'cleaning_fee_cents',cleaning_total,
    'pet_fee_cents',pet_total,
    'extra_guest_fee_cents',extra_guest_total,
    'add_on_lines',addon_lines,
    'add_on_subtotal_cents',add_on_total,
    'pre_tax_total_cents',lodging_total+cleaning_total+pet_total+extra_guest_total+add_on_total,
    'commission_base_cents',lodging_total,
    'availability_checked',false,
    'taxes_calculated',false,
    'payment_processor_quoted',false,
    'quote_is_bookable',false
  );
end;
$$;

revoke all on function public.can_manage_unit_pricing(uuid) from public;
revoke all on function public.host_pricing_bundle(uuid) from public;
revoke all on function public.save_unit_base_pricing(uuid,jsonb) from public;
revoke all on function public.upsert_unit_rate_rule(uuid,uuid,jsonb) from public;
revoke all on function public.delete_unit_rate_rule(uuid,uuid) from public;
revoke all on function public.upsert_unit_stay_rule(uuid,uuid,jsonb) from public;
revoke all on function public.delete_unit_stay_rule(uuid,uuid) from public;
revoke all on function public.upsert_unit_add_on(uuid,uuid,jsonb) from public;
revoke all on function public.delete_unit_add_on(uuid,uuid) from public;
revoke all on function public.resolve_unit_pricing_days(uuid,date,date) from public;
revoke all on function public.quote_unit_stay(uuid,date,date,integer,integer,uuid[]) from public;

grant execute on function public.can_manage_unit_pricing(uuid) to authenticated;
grant execute on function public.host_pricing_bundle(uuid) to authenticated;
grant execute on function public.save_unit_base_pricing(uuid,jsonb) to authenticated;
grant execute on function public.upsert_unit_rate_rule(uuid,uuid,jsonb) to authenticated;
grant execute on function public.delete_unit_rate_rule(uuid,uuid) to authenticated;
grant execute on function public.upsert_unit_stay_rule(uuid,uuid,jsonb) to authenticated;
grant execute on function public.delete_unit_stay_rule(uuid,uuid) to authenticated;
grant execute on function public.upsert_unit_add_on(uuid,uuid,jsonb) to authenticated;
grant execute on function public.delete_unit_add_on(uuid,uuid) to authenticated;
grant execute on function public.resolve_unit_pricing_days(uuid,date,date) to authenticated;
grant execute on function public.quote_unit_stay(uuid,date,date,integer,integer,uuid[]) to authenticated;

comment on table public.unit_rate_rules is
  'Date-bound nightly price overrides. Independent from availability/calendar source so PMS/iCal blocks do not silently own platform pricing.';
comment on table public.unit_stay_rules is
  'Date-bound minimum-stay overrides resolved on arrival date. Higher priority rules win deterministically.';
comment on table public.unit_add_ons is
  'Optional property/unit add-ons represented as structured line items for future checkout, tax and payment-provider adapters.';
comment on function public.quote_unit_stay(uuid,date,date,integer,integer,uuid[]) is
  'Pre-tax pricing quote only. Does not check availability, create a hold/reservation, calculate taxes or contact a payment processor.';

commit;
