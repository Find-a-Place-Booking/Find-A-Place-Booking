-- Find A Place Booking
-- Milestone 9A follow-up: host promotion / discount codes.
--
-- Discounts remain owned by Find A Place pricing, not Stripe/Square. A future
-- reservation transaction will atomically consume redemption limits and
-- snapshot the applied promotion. This migration only establishes the durable
-- configuration + quote-resolution boundary.

begin;

create table public.promotion_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.property_units(id) on delete cascade,
  code text not null,
  label text not null,
  discount_type text not null check (discount_type in ('PERCENT','FIXED')),
  percent_bps integer,
  amount_cents integer,
  currency text not null default 'USD',
  eligible_check_in_start date,
  eligible_check_in_end date,
  minimum_nights integer check (minimum_nights is null or minimum_nights between 1 and 365),
  minimum_lodging_cents integer check (minimum_lodging_cents is null or minimum_lodging_cents >= 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(trim(code)) between 3 and 40),
  check (char_length(trim(label)) between 1 and 120),
  check (eligible_check_in_end is null or eligible_check_in_start is null or eligible_check_in_end >= eligible_check_in_start),
  check (max_redemptions is null or redemption_count <= max_redemptions),
  check (
    (discount_type = 'PERCENT' and percent_bps between 1 and 10000 and amount_cents is null)
    or
    (discount_type = 'FIXED' and amount_cents > 0 and percent_bps is null)
  )
);

create unique index promotion_codes_org_code_unique_idx
  on public.promotion_codes(organization_id, lower(code));
create index promotion_codes_unit_active_idx
  on public.promotion_codes(unit_id, is_active, created_at desc);
create index promotion_codes_org_active_idx
  on public.promotion_codes(organization_id, is_active, created_at desc);

create trigger promotion_codes_set_updated_at
before update on public.promotion_codes
for each row execute function public.set_updated_at();

alter table public.promotion_codes enable row level security;

create policy promotion_codes_select_member_or_admin on public.promotion_codes
for select to authenticated using (
  public.is_active_admin() or public.is_organization_member(organization_id)
);

-- Rebuild the host pricing bundle so promotion codes live beside the rest of
-- the unit's pricing configuration. Organization-wide codes (unit_id null)
-- apply to every property in that organization.
create or replace function public.host_pricing_bundle(target_unit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  target_organization_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not public.can_access_unit(target_unit_id) then raise exception 'Unit access required'; end if;

  select properties.organization_id
  into target_organization_id
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where units.id = target_unit_id;

  select jsonb_build_object(
    'base', coalesce((
      select jsonb_build_object(
        'currency', coalesce(rates.currency, 'USD'),
        'weeknight_cents', rates.weeknight_cents,
        'weekend_cents', rates.weekend_cents,
        'included_guests', rates.included_guests,
        'minimum_stay_nights', coalesce(units.minimum_stay_nights, 1)
      )
      from public.property_units units
      left join public.unit_rate_settings rates on rates.unit_id = units.id
      where units.id = target_unit_id
    ), jsonb_build_object('currency','USD','weeknight_cents',null,'weekend_cents',null,'included_guests',null,'minimum_stay_nights',1)),
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
    ), '[]'::jsonb),
    'promotion_codes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', promos.id,
        'unit_id', promos.unit_id,
        'code', promos.code,
        'label', promos.label,
        'scope', case when promos.unit_id is null then 'ORGANIZATION' else 'PROPERTY' end,
        'discount_type', promos.discount_type,
        'percent_bps', promos.percent_bps,
        'amount_cents', promos.amount_cents,
        'currency', promos.currency,
        'eligible_check_in_start', promos.eligible_check_in_start,
        'eligible_check_in_end', promos.eligible_check_in_end,
        'minimum_nights', promos.minimum_nights,
        'minimum_lodging_cents', promos.minimum_lodging_cents,
        'max_redemptions', promos.max_redemptions,
        'redemption_count', promos.redemption_count,
        'is_active', promos.is_active
      ) order by (promos.unit_id is null), promos.code)
      from public.promotion_codes promos
      where promos.organization_id = target_organization_id
        and (promos.unit_id is null or promos.unit_id = target_unit_id)
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- Milestone 9A now makes the Rates & fees workspace the single owner of
-- operational pricing and the default minimum-stay rule. This replaces the
-- Step 7 basic-pricing save so property identity edits cannot silently
-- overwrite newer pricing configured in another workspace/tab.
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
  minimum_stay_value integer := coalesce(public.safe_integer(pricing_data ->> 'minimumStay'), 1);
  before_state jsonb;
  after_state jsonb;
  max_guests_value integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_pricing(target_unit_id) then raise exception 'Pricing manager access required'; end if;
  if weeknight_value is null or weeknight_value < 1 then raise exception 'A base weeknight rate greater than zero is required'; end if;
  if weekend_value is not null and weekend_value < 1 then raise exception 'Weekend rate must be greater than zero'; end if;
  if included_value is not null and (included_value < 1 or included_value > 100) then raise exception 'Included guest count is invalid'; end if;
  if minimum_stay_value < 1 or minimum_stay_value > 365 then raise exception 'Default minimum stay must be between 1 and 365 nights'; end if;
  select units.max_guests into max_guests_value from public.property_units units where units.id=target_unit_id;
  if included_value is not null and max_guests_value is not null and included_value > max_guests_value then raise exception 'Included guest count cannot exceed maximum guests'; end if;

  before_state := public.host_pricing_bundle(target_unit_id);

  update public.property_units units
  set minimum_stay_nights = minimum_stay_value,
      updated_at = now()
  where units.id = target_unit_id;

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
  values (actor_id, 'pricing.base.updated', 'property_unit', target_unit_id, 'Host updated base rates, default minimum stay and fees.', before_state, after_state, jsonb_build_object('source','host_rates'));

  return after_state;
end;
$$;

-- Property details no longer mutate rate tables. Keeping one geometry/ownership
-- boundary here prevents an old/stale property editor from overwriting live
-- pricing after a host has changed rates in the dedicated workspace.
create or replace function public.save_property_listing(
  target_property_id uuid,
  listing_data jsonb,
  selected_amenities text[] default '{}'::text[],
  selected_policies text[] default '{}'::text[]
)
returns table (property_id uuid, slug text, status public.property_status, saved_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_property public.properties%rowtype;
  after_property public.properties%rowtype;
  unit_row public.property_units%rowtype;
  property_name text;
  requested_slug text;
  normalized_slug text;
  calendar_value public.calendar_source_preference;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(listing_data) <> 'object' then raise exception 'Invalid property payload'; end if;
  if octet_length(listing_data::text) > 70000 then raise exception 'Property payload is too large'; end if;
  if not public.can_manage_property(target_property_id) then raise exception 'Property owner or manager access required'; end if;

  select properties.* into before_property
  from public.properties properties
  where properties.id = target_property_id
  for update;
  if not found then raise exception 'Property not found'; end if;

  if before_property.status not in ('DRAFT', 'CHANGES_REQUESTED', 'REJECTED') then
    raise exception 'This listing is locked while under review, approved or published';
  end if;

  select units.* into unit_row
  from public.property_units units
  where units.property_id = target_property_id and units.is_primary
  for update;

  if unit_row.id is null then raise exception 'Primary rentable unit not found'; end if;

  property_name := nullif(trim(coalesce(listing_data ->> 'name', '')), '');
  if property_name is null then raise exception 'Property name is required'; end if;

  requested_slug := coalesce(nullif(trim(listing_data ->> 'slug'), ''), property_name);
  normalized_slug := left(public.normalize_listing_slug(requested_slug), 96);
  if normalized_slug = '' then raise exception 'Listing URL is invalid'; end if;
  if normalized_slug in ('admin','api','auth','checkout','host','hosts','stays','trip','booking','support','settings') then
    raise exception 'That listing URL is reserved';
  end if;

  if lower(normalized_slug) <> lower(unit_row.slug) then
    if exists (select 1 from public.property_units units where lower(units.slug) = lower(normalized_slug) and units.id <> unit_row.id)
      or exists (select 1 from public.listing_slug_history history where lower(history.slug) = lower(normalized_slug)) then
      raise exception 'That listing URL is already in use';
    end if;

    insert into public.listing_slug_history (slug, unit_id)
    values (unit_row.slug, unit_row.id)
    on conflict (slug) do nothing;

    update public.property_units units
    set slug = left(normalized_slug, 96)
    where units.id = unit_row.id;
  end if;

  calendar_value := case upper(trim(coalesce(listing_data ->> 'calendarPreference', 'UNSET')))
    when 'ICAL' then 'ICAL'::public.calendar_source_preference
    when 'PMS' then 'PMS'::public.calendar_source_preference
    when 'NONE' then 'NONE'::public.calendar_source_preference
    else 'UNSET'::public.calendar_source_preference
  end;

  update public.properties properties
  set name = left(property_name, 180),
      description = left(nullif(trim(coalesce(listing_data ->> 'description', '')), ''), 10000),
      property_type = left(nullif(trim(coalesce(listing_data ->> 'propertyType', '')), ''), 80),
      public_area = left(nullif(trim(coalesce(listing_data ->> 'publicArea', '')), ''), 180),
      street_address = left(nullif(trim(coalesce(listing_data ->> 'street', '')), ''), 240),
      city = left(nullif(trim(coalesce(listing_data ->> 'city', '')), ''), 120),
      region_code = upper(left(nullif(trim(coalesce(listing_data ->> 'state', '')), ''), 40)),
      postal_code = left(nullif(trim(coalesce(listing_data ->> 'postal', '')), ''), 24),
      exact_address_public = coalesce((listing_data ->> 'exactAddressPublic')::boolean, false),
      notification_email = left(nullif(lower(trim(coalesce(listing_data ->> 'notificationEmail', ''))), ''), 320),
      operations_email = left(nullif(lower(trim(coalesce(listing_data ->> 'operationsEmail', ''))), ''), 320),
      calendar_preference = calendar_value,
      custom_amenities = left(nullif(trim(coalesce(listing_data ->> 'customAmenities', '')), ''), 5000),
      custom_policies = left(nullif(trim(coalesce(listing_data ->> 'customPolicies', '')), ''), 5000)
  where properties.id = target_property_id;

  update public.property_units units
  set name = left(property_name, 180),
      max_guests = public.safe_integer(listing_data ->> 'maxGuests'),
      bedrooms = public.safe_integer(listing_data ->> 'bedrooms'),
      beds = public.safe_integer(listing_data ->> 'beds'),
      bathrooms = public.safe_numeric(listing_data ->> 'bathrooms'),
      check_in = nullif(trim(coalesce(listing_data ->> 'checkIn', '')), '')::time,
      checkout = nullif(trim(coalesce(listing_data ->> 'checkout', '')), '')::time,
      cancellation_policy = left(nullif(trim(coalesce(listing_data ->> 'cancellation', '')), ''), 5000)
  where units.id = unit_row.id;

  delete from public.unit_amenities amenities where amenities.unit_id = unit_row.id;
  insert into public.unit_amenities (unit_id, amenity_code)
  select unit_row.id, catalog.code
  from public.amenity_catalog catalog
  where catalog.label = any(coalesce(selected_amenities, '{}'::text[]));

  delete from public.unit_policies policies where policies.unit_id = unit_row.id;
  insert into public.unit_policies (unit_id, policy_code, configuration)
  select
    unit_row.id,
    catalog.code,
    case catalog.code
      when 'quiet-hours' then jsonb_build_object('start', listing_data ->> 'quietStart', 'end', listing_data ->> 'quietEnd')
      when 'pets-allowed' then jsonb_build_object('max_pets', listing_data ->> 'maxPets')
      when 'minimum-booking-age' then jsonb_build_object('minimum_age', listing_data ->> 'minimumAge')
      else '{}'::jsonb
    end
  from public.policy_catalog catalog
  where catalog.label = any(coalesce(selected_policies, '{}'::text[]));

  select properties.* into after_property
  from public.properties properties
  where properties.id = target_property_id;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, before_state, after_state, metadata
  ) values (
    actor_id,
    'property.updated',
    'property',
    target_property_id,
    'Host saved property/listing details.',
    to_jsonb(before_property),
    to_jsonb(after_property),
    jsonb_build_object('unit_id', unit_row.id, 'slug', normalized_slug, 'pricing_owned_by', 'host_rates_workspace')
  );

  return query select after_property.id, normalized_slug, after_property.status, now();
end;
$$;

create or replace function public.upsert_promotion_code(target_unit_id uuid, target_promotion_id uuid, promotion_data jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result_id uuid;
  target_organization_id uuid;
  scope_value text := upper(trim(coalesce(promotion_data ->> 'scope','PROPERTY')));
  scoped_unit_id uuid;
  code_value text := upper(regexp_replace(trim(coalesce(promotion_data ->> 'code','')), '[^A-Za-z0-9_-]+', '', 'g'));
  label_value text := left(nullif(trim(coalesce(promotion_data ->> 'label','')), ''), 120);
  type_value text := upper(trim(coalesce(promotion_data ->> 'discountType','PERCENT')));
  percent_numeric numeric;
  percent_value integer;
  amount_value integer;
  start_value date;
  end_value date;
  minimum_nights_value integer := public.safe_integer(promotion_data ->> 'minimumNights');
  minimum_lodging_value integer := public.money_text_to_cents(promotion_data ->> 'minimumLodging');
  max_redemptions_value integer := public.safe_integer(promotion_data ->> 'maxRedemptions');
  active_value boolean := coalesce((promotion_data ->> 'isActive')::boolean, true);
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_pricing(target_unit_id) then raise exception 'Pricing manager access required'; end if;

  select properties.organization_id
  into target_organization_id
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where units.id = target_unit_id;
  if target_organization_id is null then raise exception 'Property organization not found'; end if;

  if scope_value not in ('PROPERTY','ORGANIZATION') then raise exception 'Promotion scope is invalid'; end if;
  scoped_unit_id := case when scope_value = 'ORGANIZATION' then null else target_unit_id end;

  if char_length(code_value) < 3 or char_length(code_value) > 40 then raise exception 'Promo code must be 3 to 40 letters, numbers, dashes or underscores'; end if;
  if label_value is null then raise exception 'Promotion label is required'; end if;
  if type_value not in ('PERCENT','FIXED') then raise exception 'Promotion type is invalid'; end if;

  if nullif(trim(coalesce(promotion_data ->> 'eligibleStart','')), '') is not null then
    begin start_value := (promotion_data ->> 'eligibleStart')::date;
    exception when others then raise exception 'Eligible start date is invalid'; end;
  end if;
  if nullif(trim(coalesce(promotion_data ->> 'eligibleEnd','')), '') is not null then
    begin end_value := (promotion_data ->> 'eligibleEnd')::date;
    exception when others then raise exception 'Eligible end date is invalid'; end;
  end if;
  if start_value is not null and end_value is not null and end_value < start_value then raise exception 'Eligible end date must be on or after start date'; end if;
  if minimum_nights_value is not null and (minimum_nights_value < 1 or minimum_nights_value > 365) then raise exception 'Minimum nights must be between 1 and 365'; end if;
  if minimum_lodging_value is not null and minimum_lodging_value < 0 then raise exception 'Minimum lodging amount is invalid'; end if;
  if max_redemptions_value is not null and max_redemptions_value < 1 then raise exception 'Maximum uses must be at least one'; end if;

  if type_value = 'PERCENT' then
    begin percent_numeric := (promotion_data ->> 'discountValue')::numeric;
    exception when others then raise exception 'Percentage discount is invalid'; end;
    if percent_numeric <= 0 or percent_numeric > 100 then raise exception 'Percentage discount must be greater than 0 and no more than 100'; end if;
    percent_value := round(percent_numeric * 100)::integer;
    amount_value := null;
  else
    amount_value := public.money_text_to_cents(promotion_data ->> 'discountValue');
    if amount_value is null or amount_value <= 0 then raise exception 'Fixed discount must be greater than zero'; end if;
    percent_value := null;
  end if;

  if target_promotion_id is null then
    insert into public.promotion_codes (
      organization_id, unit_id, code, label, discount_type, percent_bps, amount_cents,
      eligible_check_in_start, eligible_check_in_end, minimum_nights, minimum_lodging_cents,
      max_redemptions, is_active, created_by
    ) values (
      target_organization_id, scoped_unit_id, code_value, label_value, type_value, percent_value, amount_value,
      start_value, end_value, minimum_nights_value, minimum_lodging_value, max_redemptions_value, active_value, actor_id
    ) returning id into result_id;
  else
    update public.promotion_codes promos
    set unit_id = scoped_unit_id,
        code = code_value,
        label = label_value,
        discount_type = type_value,
        percent_bps = percent_value,
        amount_cents = amount_value,
        eligible_check_in_start = start_value,
        eligible_check_in_end = end_value,
        minimum_nights = minimum_nights_value,
        minimum_lodging_cents = minimum_lodging_value,
        max_redemptions = max_redemptions_value,
        is_active = active_value
    where promos.id = target_promotion_id
      and promos.organization_id = target_organization_id
      and (promos.unit_id is null or promos.unit_id = target_unit_id)
    returning id into result_id;
    if result_id is null then raise exception 'Promotion code not found'; end if;
  end if;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, reason, metadata)
  values (
    actor_id,
    case when target_promotion_id is null then 'pricing.promotion.created' else 'pricing.promotion.updated' end,
    'promotion_code', result_id, 'Host changed a promotion code.',
    jsonb_build_object('unit_id',target_unit_id,'scope',scope_value,'code',code_value)
  );

  return result_id;
exception
  when unique_violation then
    raise exception 'That promo code already exists for this host organization';
end;
$$;

create or replace function public.delete_promotion_code(target_unit_id uuid, target_promotion_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  deleted_count integer;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_pricing(target_unit_id) then raise exception 'Pricing manager access required'; end if;

  select properties.organization_id
  into target_organization_id
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where units.id = target_unit_id;

  delete from public.promotion_codes promos
  where promos.id = target_promotion_id
    and promos.organization_id = target_organization_id
    and (promos.unit_id is null or promos.unit_id = target_unit_id);
  get diagnostics deleted_count = row_count;
  if deleted_count = 0 then raise exception 'Promotion code not found'; end if;

  insert into public.audit_logs (actor_profile_id,action,entity_type,entity_id,reason,metadata)
  values (actor_id,'pricing.promotion.deleted','promotion_code',target_promotion_id,'Host removed a promotion code.',jsonb_build_object('unit_id',target_unit_id));
end;
$$;

-- Replace the pre-tax quote with a promotion-aware version. The promotion is
-- applied only to lodging, so platform commission follows the discounted
-- lodging subtotal and never includes fees/add-ons.
drop function public.quote_unit_stay(uuid,date,date,integer,integer,uuid[]);

create function public.quote_unit_stay(
  target_unit_id uuid,
  check_in_date date,
  check_out_date date,
  guest_count integer,
  pet_count integer default 0,
  selected_add_on_ids uuid[] default '{}'::uuid[],
  promotion_code text default null
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
  lodging_before_discount bigint := 0;
  discount_total bigint := 0;
  lodging_total bigint := 0;
  cleaning_total bigint := 0;
  pet_total bigint := 0;
  extra_guest_total bigint := 0;
  add_on_total bigint := 0;
  included_count integer;
  currency_value text := 'USD';
  target_organization_id uuid;
  clean_promotion_code text := nullif(upper(trim(coalesce(promotion_code,''))), '');
  promotion_row record;
  promotion_json jsonb := null;
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

  select coalesce(rates.included_guests, units.max_guests), coalesce(rates.currency,'USD'), properties.organization_id
  into included_count, currency_value, target_organization_id
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  left join public.unit_rate_settings rates on rates.unit_id=units.id
  where units.id=target_unit_id;

  for day_row in
    select * from public.resolve_unit_pricing_days(target_unit_id, check_in_date, check_out_date - 1)
    order by stay_date
  loop
    if day_row.nightly_cents is null then raise exception 'Pricing is incomplete for %', day_row.stay_date; end if;
    lodging_before_discount := lodging_before_discount + day_row.nightly_cents;
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

  lodging_total := lodging_before_discount;

  if clean_promotion_code is not null then
    select promos.*
    into promotion_row
    from public.promotion_codes promos
    where promos.organization_id = target_organization_id
      and (promos.unit_id is null or promos.unit_id = target_unit_id)
      and upper(promos.code) = clean_promotion_code
      and promos.is_active
      and (promos.eligible_check_in_start is null or check_in_date >= promos.eligible_check_in_start)
      and (promos.eligible_check_in_end is null or check_in_date <= promos.eligible_check_in_end)
      and (promos.minimum_nights is null or night_count >= promos.minimum_nights)
      and (promos.minimum_lodging_cents is null or lodging_before_discount >= promos.minimum_lodging_cents)
      and (promos.max_redemptions is null or promos.redemption_count < promos.max_redemptions)
    order by (promos.unit_id is not null) desc, promos.created_at desc
    limit 1;

    if promotion_row.id is null then
      raise exception 'Promo code is invalid or not eligible for this stay';
    end if;

    if promotion_row.discount_type = 'PERCENT' then
      discount_total := round((lodging_before_discount::numeric * promotion_row.percent_bps::numeric) / 10000)::bigint;
    else
      discount_total := promotion_row.amount_cents;
    end if;
    discount_total := least(discount_total, lodging_before_discount);
    lodging_total := lodging_before_discount - discount_total;
    promotion_json := jsonb_build_object(
      'id', promotion_row.id,
      'code', promotion_row.code,
      'label', promotion_row.label,
      'discount_type', promotion_row.discount_type,
      'percent_bps', promotion_row.percent_bps,
      'amount_cents', promotion_row.amount_cents,
      'discount_cents', discount_total,
      'scope', case when promotion_row.unit_id is null then 'ORGANIZATION' else 'PROPERTY' end,
      'max_redemptions', promotion_row.max_redemptions,
      'redemption_count', promotion_row.redemption_count
    );
  end if;

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
    'lodging_subtotal_before_discount_cents',lodging_before_discount,
    'promotion',promotion_json,
    'discount_cents',discount_total,
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
    'promotion_redemption_reserved',false,
    'quote_is_bookable',false
  );
end;
$$;

revoke all on table public.promotion_codes from anon;
revoke all on function public.host_pricing_bundle(uuid) from public;
revoke all on function public.upsert_promotion_code(uuid,uuid,jsonb) from public;
revoke all on function public.delete_promotion_code(uuid,uuid) from public;
revoke all on function public.quote_unit_stay(uuid,date,date,integer,integer,uuid[],text) from public;

grant execute on function public.save_unit_base_pricing(uuid,jsonb) to authenticated;
grant execute on function public.save_property_listing(uuid,jsonb,text[],text[]) to authenticated;
grant execute on function public.host_pricing_bundle(uuid) to authenticated;
grant execute on function public.upsert_promotion_code(uuid,uuid,jsonb) to authenticated;
grant execute on function public.delete_promotion_code(uuid,uuid) to authenticated;
grant execute on function public.quote_unit_stay(uuid,date,date,integer,integer,uuid[],text) to authenticated;

comment on table public.promotion_codes is
  'Host-owned lodging promotion codes. Property-scoped or organization-wide. Reservation-time redemption enforcement/snapshots are added with booking infrastructure.';
comment on function public.quote_unit_stay(uuid,date,date,integer,integer,uuid[],text) is
  'Pre-tax promotion-aware pricing quote only. Does not check availability, consume a promo redemption, create a hold/reservation, calculate taxes or contact a payment processor.';

commit;
