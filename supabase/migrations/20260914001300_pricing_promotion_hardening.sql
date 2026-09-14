-- Find A Place Booking
-- Milestone 9A.1: pricing/promotion hardening before calendar + payment integration.
--
-- This migration does not contact a payment processor and does not consume
-- promotion redemptions. It closes configuration/history gaps now so the later
-- reservation transaction can safely own atomic promo redemption.

begin;

alter table public.promotion_codes
  add column if not exists allow_with_public_special boolean not null default false,
  add column if not exists archived_at timestamptz;

comment on column public.promotion_codes.allow_with_public_special is
  'Explicit host opt-in for combining this code with a guest-facing advertised special/date rate. Defaults false to avoid accidental double-discounting.';
comment on column public.promotion_codes.archived_at is
  'Soft-removal timestamp used once a promotion has redemption history. Archived codes remain durable for financial/reservation audit history.';

create or replace function public.create_property_from_onboarding(target_organization_id uuid)
returns table (property_id uuid, unit_id uuid, slug text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  draft_row public.host_onboarding_drafts%rowtype;
  form jsonb;
  new_property_id uuid;
  new_unit_id uuid;
  new_slug text;
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
  if not public.can_manage_organization(target_organization_id) then raise exception 'Organization owner or manager access required'; end if;

  select drafts.* into draft_row
  from public.host_onboarding_drafts drafts
  where drafts.organization_id = target_organization_id
  for update;

  if not found then raise exception 'Host onboarding draft not found'; end if;
  if draft_row.status <> 'READY_FOR_PROPERTY' or not draft_row.authority_confirmed then
    raise exception 'Finish host setup before creating the property';
  end if;

  if draft_row.created_property_id is not null then
    select properties.id, units.id, units.slug
    into new_property_id, new_unit_id, new_slug
    from public.properties properties
    join public.property_units units on units.property_id = properties.id and units.is_primary
    where properties.id = draft_row.created_property_id;

    return query select new_property_id, new_unit_id, new_slug;
    return;
  end if;

  form := coalesce(draft_row.form_data, '{}'::jsonb);
  property_name := nullif(trim(coalesce(form ->> 'propertyName', '')), '');
  if property_name is null then raise exception 'Property name is required'; end if;

  calendar_value := case lower(trim(coalesce(form ->> 'calendarPreference', '')))
    when 'ical' then 'ICAL'::public.calendar_source_preference
    when 'pms' then 'PMS'::public.calendar_source_preference
    when 'none' then 'NONE'::public.calendar_source_preference
    else 'UNSET'::public.calendar_source_preference
  end;

  insert into public.properties (
    organization_id, name, description, property_type, status, public_area,
    street_address, city, region_code, postal_code, country_code,
    notification_email, operations_email, calendar_preference,
    custom_amenities, custom_policies, source_onboarding_draft_id, created_by
  ) values (
    target_organization_id,
    left(property_name, 180),
    left(nullif(trim(coalesce(form ->> 'description', '')), ''), 10000),
    left(nullif(trim(coalesce(form ->> 'propertyType', '')), ''), 80),
    'DRAFT',
    left(nullif(trim(coalesce(form ->> 'publicArea', '')), ''), 180),
    left(nullif(trim(coalesce(form ->> 'street', '')), ''), 240),
    left(nullif(trim(coalesce(form ->> 'city', '')), ''), 120),
    upper(left(nullif(trim(coalesce(form ->> 'state', '')), ''), 40)),
    left(nullif(trim(coalesce(form ->> 'postal', '')), ''), 24),
    'US',
    left(nullif(lower(trim(coalesce(form ->> 'email', ''))), ''), 320),
    left(nullif(lower(trim(coalesce(form ->> 'email', ''))), ''), 320),
    calendar_value,
    left(nullif(trim(coalesce(form ->> 'customAmenities', '')), ''), 5000),
    left(nullif(trim(coalesce(form ->> 'customPolicies', '')), ''), 5000),
    draft_row.id,
    actor_id
  ) returning id into new_property_id;

  new_slug := public.unique_listing_slug(property_name, null);

  insert into public.property_units (
    property_id, name, slug, is_primary, max_guests, bedrooms, beds, bathrooms,
    minimum_stay_nights, check_in, checkout, cancellation_policy
  ) values (
    new_property_id,
    left(property_name, 180),
    new_slug,
    true,
    public.safe_integer(form ->> 'maxGuests'),
    public.safe_integer(form ->> 'bedrooms'),
    public.safe_integer(form ->> 'beds'),
    public.safe_numeric(form ->> 'bathrooms'),
    greatest(coalesce(public.safe_integer(form ->> 'minStay'), 1), 1),
    nullif(trim(coalesce(form ->> 'checkIn', '')), '')::time,
    nullif(trim(coalesce(form ->> 'checkout', '')), '')::time,
    left(nullif(trim(coalesce(form ->> 'cancellation', '')), ''), 5000)
  ) returning id into new_unit_id;

  insert into public.unit_amenities (unit_id, amenity_code)
  select new_unit_id, catalog.code
  from public.amenity_catalog catalog
  where catalog.label = any(coalesce(draft_row.amenities, '{}'::text[]));

  insert into public.unit_policies (unit_id, policy_code, configuration)
  select
    new_unit_id,
    catalog.code,
    case catalog.code
      when 'quiet-hours' then jsonb_build_object('start', form ->> 'quietStart', 'end', form ->> 'quietEnd')
      when 'pets-allowed' then jsonb_build_object('max_pets', form ->> 'maxPets')
      when 'minimum-booking-age' then jsonb_build_object('minimum_age', form ->> 'minimumAge')
      else '{}'::jsonb
    end
  from public.policy_catalog catalog
  where catalog.label = any(coalesce(draft_row.policies, '{}'::text[]));

  rate_weeknight := public.money_text_to_cents(form ->> 'weeknight');
  rate_weekend := public.money_text_to_cents(form ->> 'weekend');
  fee_cleaning := public.money_text_to_cents(form ->> 'cleaning');
  fee_pet := public.money_text_to_cents(form ->> 'pet');
  fee_extra := public.money_text_to_cents(form ->> 'extraGuest');
  included_guests_value := public.safe_integer(form ->> 'includedGuests');
  max_guests_value := public.safe_integer(form ->> 'maxGuests');

  if included_guests_value is not null and (included_guests_value < 1 or included_guests_value > 100) then
    raise exception 'Included guest count must be between 1 and 100';
  end if;
  if included_guests_value is not null and max_guests_value is not null and included_guests_value > max_guests_value then
    raise exception 'Included guest count cannot exceed maximum guests';
  end if;
  if fee_extra is not null and fee_extra > 0 and included_guests_value is null then
    raise exception 'Set how many guests are included before charging an extra guest fee';
  end if;

  insert into public.unit_rate_settings (unit_id, weeknight_cents, weekend_cents, included_guests)
  values (new_unit_id, rate_weeknight, rate_weekend, included_guests_value);

  if fee_cleaning is not null and fee_cleaning > 0 then
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (new_unit_id, 'CLEANING', 'Cleaning fee', fee_cleaning, 'FLAT_PER_STAY');
  end if;
  if fee_pet is not null and fee_pet > 0 then
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (new_unit_id, 'PET', 'Pet fee', fee_pet, 'PER_PET_PER_STAY');
  end if;
  if fee_extra is not null and fee_extra > 0 then
    insert into public.unit_fees (unit_id, fee_type, label, amount_cents, calculation)
    values (new_unit_id, 'EXTRA_GUEST', 'Extra guest fee', fee_extra, 'PER_GUEST_PER_NIGHT');
  end if;

  update public.host_onboarding_drafts drafts
  set created_property_id = new_property_id,
      updated_at = now()
  where drafts.id = draft_row.id;

  update public.organizations organizations
  set status = case when organizations.status = 'ARCHIVED' then organizations.status else 'ACTIVE'::public.organization_status end,
      updated_at = now()
  where organizations.id = target_organization_id;

  insert into public.audit_logs (
    actor_profile_id, action, entity_type, entity_id, reason, metadata
  ) values (
    actor_id,
    'property.created_from_onboarding',
    'property',
    new_property_id,
    'Created first real property/listing from the saved host onboarding draft.',
    jsonb_build_object('organization_id', target_organization_id, 'unit_id', new_unit_id, 'slug', new_slug)
  );

  return query select new_property_id, new_unit_id, new_slug;
end;
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
        'allow_with_public_special', promos.allow_with_public_special,
        'is_active', promos.is_active
      ) order by (promos.unit_id is null), promos.code)
      from public.promotion_codes promos
      where promos.organization_id = target_organization_id
        and promos.archived_at is null
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
  allow_special_value boolean := coalesce((promotion_data ->> 'allowWithPublicSpecial')::boolean, false);
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
      max_redemptions, allow_with_public_special, is_active, created_by
    ) values (
      target_organization_id, scoped_unit_id, code_value, label_value, type_value, percent_value, amount_value,
      start_value, end_value, minimum_nights_value, minimum_lodging_value, max_redemptions_value, allow_special_value, active_value, actor_id
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
        allow_with_public_special = allow_special_value,
        is_active = active_value
    where promos.id = target_promotion_id
      and promos.organization_id = target_organization_id
      and promos.archived_at is null
      and (promos.unit_id is null or promos.unit_id = target_unit_id)
    returning id into result_id;
    if result_id is null then raise exception 'Promotion code not found'; end if;
  end if;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, reason, metadata)
  values (
    actor_id,
    case when target_promotion_id is null then 'pricing.promotion.created' else 'pricing.promotion.updated' end,
    'promotion_code', result_id, 'Host changed a promotion code.',
    jsonb_build_object('unit_id',target_unit_id,'scope',scope_value,'code',code_value,'allow_with_public_special',allow_special_value)
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
  promo_row public.promotion_codes%rowtype;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_unit_pricing(target_unit_id) then raise exception 'Pricing manager access required'; end if;

  select properties.organization_id
  into target_organization_id
  from public.property_units units
  join public.properties properties on properties.id = units.property_id
  where units.id = target_unit_id;

  select promos.*
  into promo_row
  from public.promotion_codes promos
  where promos.id = target_promotion_id
    and promos.organization_id = target_organization_id
    and promos.archived_at is null
    and (promos.unit_id is null or promos.unit_id = target_unit_id)
  for update;

  if not found then raise exception 'Promotion code not found'; end if;

  if promo_row.redemption_count > 0 then
    update public.promotion_codes promos
    set is_active = false,
        archived_at = now(),
        updated_at = now()
    where promos.id = promo_row.id;

    insert into public.audit_logs (actor_profile_id,action,entity_type,entity_id,reason,before_state,after_state,metadata)
    values (
      actor_id,
      'pricing.promotion.archived',
      'promotion_code',
      promo_row.id,
      'Host removed a promotion code that already had redemption history; the record was archived instead of deleted.',
      to_jsonb(promo_row),
      (select to_jsonb(updated) from public.promotion_codes updated where updated.id = promo_row.id),
      jsonb_build_object('unit_id',target_unit_id,'redemption_count',promo_row.redemption_count)
    );
  else
    delete from public.promotion_codes promos where promos.id = promo_row.id;

    insert into public.audit_logs (actor_profile_id,action,entity_type,entity_id,reason,before_state,metadata)
    values (
      actor_id,
      'pricing.promotion.deleted',
      'promotion_code',
      promo_row.id,
      'Host removed an unused promotion code.',
      to_jsonb(promo_row),
      jsonb_build_object('unit_id',target_unit_id)
    );
  end if;
end;
$$;

create or replace function public.quote_unit_stay(
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
  has_public_special boolean := false;
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
    if day_row.special_label is not null then has_public_special := true; end if;
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
      and promos.archived_at is null
      and promos.currency = currency_value
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
    if has_public_special and not promotion_row.allow_with_public_special then
      raise exception 'This promo code cannot be combined with an advertised special rate';
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
      'redemption_count', promotion_row.redemption_count,
      'allow_with_public_special', promotion_row.allow_with_public_special
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


revoke all on function public.create_property_from_onboarding(uuid) from public;
revoke all on function public.host_pricing_bundle(uuid) from public;
revoke all on function public.upsert_promotion_code(uuid,uuid,jsonb) from public;
revoke all on function public.delete_promotion_code(uuid,uuid) from public;
revoke all on function public.quote_unit_stay(uuid,date,date,integer,integer,uuid[],text) from public;

grant execute on function public.create_property_from_onboarding(uuid) to authenticated;
grant execute on function public.host_pricing_bundle(uuid) to authenticated;
grant execute on function public.upsert_promotion_code(uuid,uuid,jsonb) to authenticated;
grant execute on function public.delete_promotion_code(uuid,uuid) to authenticated;
grant execute on function public.quote_unit_stay(uuid,date,date,integer,integer,uuid[],text) to authenticated;

comment on function public.create_property_from_onboarding(uuid) is
  'Creates the first real property + primary rentable unit exactly once from onboarding, including the 9A included-guest threshold needed for extra-guest fees.';
comment on function public.delete_promotion_code(uuid,uuid) is
  'Removes unused promotions; promotions with redemption history are archived/inactivated so later reservation and ledger history never loses its source record.';
comment on function public.quote_unit_stay(uuid,date,date,integer,integer,uuid[],text) is
  'Pre-tax promotion-aware pricing quote only. Enforces promo currency and advertised-special stacking policy, but does not check availability, consume redemption, create a hold/reservation, calculate tax or contact a processor.';

commit;
