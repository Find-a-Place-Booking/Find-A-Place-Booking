-- Find A Place Booking
-- Optional host tax collection / self-remit mode
--
-- Goal:
--   * Tax setup is optional.
--   * Missing tax setup does NOT block publication.
--   * Missing tax setup does NOT block guest checkout.
--   * If a host has certified tax setup, Find A Place adds those configured
--     taxes to checkout and the tax funds remain in the host Stripe charge.
--   * If a host has NOT certified tax setup, checkout adds $0 tax and the host
--     handles any applicable tax obligations separately.
--   * Stripe/payment readiness, complete property address, and the live
--     checkout gate remain required.
--
-- This migration also restores listings that were automatically paused by the
-- Sep 30 hardening migration solely because tax setup was not certified.
-- It deliberately does NOT restore manually paused listings.

begin;

-- ---------------------------------------------------------------------------
-- 1. Tax calculation becomes opt-in instead of a checkout gate.
-- ---------------------------------------------------------------------------

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
  collection_mode text;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select reservations.*
  into reservation_row
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
    'HOLD',
    'PAYMENT_PENDING',
    'PAYMENT_FAILED'
  ) then
    raise exception
      'Taxes cannot be recalculated after the reservation leaves checkout';
  end if;

  select properties.*
  into property_row
  from public.properties properties
  where properties.id = reservation_row.property_id;

  if not found then
    raise exception 'Reservation property not found';
  end if;

  select profiles.*
  into profile_row
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

  collection_mode :=
    case
      when host_configured then 'FAP_CHECKOUT'
      else 'HOST_SELF_REMIT'
    end;

  nights := reservation_row.check_out - reservation_row.check_in;

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

  -- Only add guest taxes when the host explicitly configured/certified them.
  if host_configured then

    -- Active automatic statewide rules.
    for rule_row in
      select
        rules.id as rule_id,
        rules.code as rule_code,
        rules.label,
        rules.rate_bps,
        rules.base_scope,
        rules.maximum_stay_nights,
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

    -- Host-configured local/custom rules.
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
                case
                  when profile_found then profile_row.locality_name
                  else null
                end,
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

    -- Compatibility for grandfathered tax setups.
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
  end if;

  -- Missing host tax setup and missing state tax rules are intentionally NOT
  -- errors. In self-remit mode, tax_total stays 0 and checkout continues.
  update public.reservations reservations
  set
    tax_total_cents = tax_total,
    guest_total_cents =
      reservations.pre_tax_total_cents + tax_total,
    tax_status = 'CALCULATED',
    tax_snapshot = jsonb_build_object(
      'calculation_id', calculation_id,
      'calculated_at', now(),
      'calculation_engine', 'FAP_OPTIONAL_HOST_TAX_V1',
      'payment_environment', expected_environment,
      'collection_mode', collection_mode,
      'settlement',
        case
          when host_configured then 'HOST_CONNECTED_ACCOUNT'
          else 'HOST_SELF_REMIT'
        end,
      'platform_tax_retained_cents', 0,
      'property', jsonb_build_object(
        'property_id', property_row.id,
        'street_address', property_row.street_address,
        'city', property_row.city,
        'region_code', property_row.region_code,
        'postal_code', property_row.postal_code,
        'country_code', property_row.country_code,
        'county_name',
          case
            when profile_found then profile_row.county_name
            else null
          end,
        'locality_name',
          case
            when profile_found then profile_row.locality_name
            else null
          end,
        'host_tax_configuration', host_configured,
        'host_certified_at',
          case
            when profile_found then profile_row.host_certified_at
            else null
          end,
        'configuration_source',
          case
            when profile_found then profile_row.configuration_source
            else null
          end
      ),
      'components', jsonb_build_object(
        'lodging_cents', lodging_cents,
        'cleaning_cents', cleaning_cents,
        'pet_cents', pet_cents,
        'extra_guest_cents', extra_guest_cents,
        'add_on_cents', addon_cents,
        'pre_tax_total_cents', reservations.pre_tax_total_cents
      ),
      'automatic_rule_count', automatic_rule_count,
      'custom_line_count', custom_line_count,
      'rules', tax_lines,
      'tax_total_cents', tax_total,
      'responsibility', 'HOST'
    ),
    tax_provider =
      case
        when host_configured then 'FAP_OPTIONAL_HOST_TAX'
        else 'HOST_SELF_REMIT'
      end,
    tax_provider_calculation_id = calculation_id::text,
    platform_tax_retained_cents = 0,
    updated_at = now()
  where reservations.id = target_reservation_id
  returning * into reservation_row;

  insert into public.reservation_events (
    reservation_id,
    event_type,
    actor_profile_id,
    metadata
  ) values (
    target_reservation_id,
    'TAX_CALCULATED',
    null,
    jsonb_build_object(
      'calculation_id', calculation_id,
      'tax_total_cents', tax_total,
      'guest_total_cents', reservation_row.guest_total_cents,
      'platform_tax_retained_cents', 0,
      'tax_settlement',
        case
          when host_configured then 'HOST_CONNECTED_ACCOUNT'
          else 'HOST_SELF_REMIT'
        end,
      'tax_responsibility', 'HOST',
      'collection_mode', collection_mode,
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
    'tax_settlement',
      case
        when host_configured then 'HOST_CONNECTED_ACCOUNT'
        else 'HOST_SELF_REMIT'
      end,
    'tax_responsibility', 'HOST',
    'collection_mode', collection_mode,
    'tax_snapshot', reservation_row.tax_snapshot
  );
end;
$function$;

revoke all on function public.calculate_reservation_lodging_tax(
  uuid,
  public.payment_environment
) from public, anon, authenticated;

grant execute on function public.calculate_reservation_lodging_tax(
  uuid,
  public.payment_environment
) to service_role;


-- ---------------------------------------------------------------------------
-- 2. Tax is no longer part of publish/live-checkout readiness.
-- ---------------------------------------------------------------------------

create or replace function public.property_full_live_checkout_ready(
  target_property_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  property_row public.properties%rowtype;
begin
  select properties.*
  into property_row
  from public.properties properties
  where properties.id = target_property_id;

  if not found then
    return false;
  end if;

  return
    coalesce(property_row.live_checkout_enabled, false)
    and nullif(trim(coalesce(property_row.street_address, '')), '') is not null
    and nullif(trim(coalesce(property_row.city, '')), '') is not null
    and nullif(trim(coalesce(property_row.region_code, '')), '') is not null
    and nullif(trim(coalesce(property_row.postal_code, '')), '') is not null
    and public.property_live_payment_route_ready(target_property_id);
end;
$function$;

revoke all on function public.property_full_live_checkout_ready(uuid)
from public, anon, authenticated;


create or replace function public.enforce_property_live_checkout_readiness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id
       and (
         old.status = 'PUBLISHED'
         or new.status = 'PUBLISHED'
       )
    then
      raise exception
        'Pause the listing before moving it to a different host organization';
    end if;
  end if;

  if new.status <> 'PUBLISHED' then
    return new;
  end if;

  if coalesce(new.live_checkout_enabled, false) is not true then
    raise exception
      'Live checkout must be enabled before publishing this listing';
  end if;

  if nullif(trim(coalesce(new.street_address, '')), '') is null
     or nullif(trim(coalesce(new.city, '')), '') is null
     or nullif(trim(coalesce(new.region_code, '')), '') is null
     or nullif(trim(coalesce(new.postal_code, '')), '') is null
  then
    raise exception
      'Complete the property street address, city, state and ZIP before publishing';
  end if;

  if not public.property_live_payment_route_ready(new.id) then
    raise exception
      'Connect a LIVE Stripe account that can accept charges and payouts before publishing';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_property_live_checkout_readiness()
from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 3. Tax changes can no longer auto-pause a public listing.
-- ---------------------------------------------------------------------------

drop trigger if exists property_tax_profiles_pause_unready_insert_delete
on public.property_tax_profiles;

drop trigger if exists property_tax_profiles_pause_unready_update
on public.property_tax_profiles;


create or replace function public.pause_property_if_live_readiness_lost(
  target_property_id uuid,
  pause_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  before_row public.properties%rowtype;
  after_row public.properties%rowtype;
  payment_ready boolean;
  address_ready boolean;
  tax_configured boolean;
begin
  select properties.*
  into before_row
  from public.properties properties
  where properties.id = target_property_id
  for update;

  if not found or before_row.status <> 'PUBLISHED' then
    return false;
  end if;

  address_ready :=
    nullif(trim(coalesce(before_row.street_address, '')), '') is not null
    and nullif(trim(coalesce(before_row.city, '')), '') is not null
    and nullif(trim(coalesce(before_row.region_code, '')), '') is not null
    and nullif(trim(coalesce(before_row.postal_code, '')), '') is not null;

  payment_ready :=
    public.property_live_payment_route_ready(before_row.id);

  -- Informational only. Tax configuration does not gate the listing.
  tax_configured :=
    public.property_tax_checkout_ready(before_row.id);

  if coalesce(before_row.live_checkout_enabled, false)
     and address_ready
     and payment_ready
  then
    return false;
  end if;

  update public.properties properties
  set
    status = 'PAUSED',
    updated_at = now()
  where properties.id = before_row.id
  returning properties.* into after_row;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    before_state,
    after_state,
    metadata
  ) values (
    (select auth.uid()),
    'property.publication.auto_paused_checkout_not_ready',
    'property',
    before_row.id,
    left(
      coalesce(
        nullif(trim(pause_reason), ''),
        'Listing automatically paused because LIVE checkout readiness was lost.'
      ),
      500
    ),
    to_jsonb(before_row),
    to_jsonb(after_row),
    jsonb_build_object(
      'live_checkout_enabled',
        coalesce(before_row.live_checkout_enabled, false),
      'address_ready', address_ready,
      'tax_configured_optional', tax_configured,
      'payment_route_ready', payment_ready,
      'existing_reservations_preserved', true
    )
  );

  return true;
end;
$function$;

revoke all on function public.pause_property_if_live_readiness_lost(
  uuid,
  text
) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- 4. Restore ONLY listings auto-paused by the Sep 30 tax requirement.
--
-- Safety:
--   * latest matching auto-pause must say tax_ready=false
--   * address/payment/live/state-rule checks must all have been true
--   * property must still be PAUSED
--   * property updated_at must still equal that auto-pause timestamp,
--     proving no later manual host/admin change happened
-- ---------------------------------------------------------------------------

with latest_tax_pause as (
  select distinct on (logs.entity_id)
    logs.entity_id,
    logs.created_at,
    logs.metadata
  from public.audit_logs logs
  where logs.action =
    'property.publication.auto_paused_checkout_not_ready'
  order by logs.entity_id, logs.created_at desc
),
candidates as (
  select
    properties.id,
    to_jsonb(properties) as before_state
  from public.properties properties
  join latest_tax_pause pause
    on pause.entity_id = properties.id
  where properties.status = 'PAUSED'
    and properties.updated_at = pause.created_at
    and coalesce(
      (pause.metadata ->> 'live_checkout_enabled')::boolean,
      false
    ) = true
    and coalesce(
      (pause.metadata ->> 'address_ready')::boolean,
      false
    ) = true
    and coalesce(
      (pause.metadata ->> 'payment_route_ready')::boolean,
      false
    ) = true
    and coalesce(
      (pause.metadata ->> 'state_tax_rules_ready')::boolean,
      false
    ) = true
    and coalesce(
      (pause.metadata ->> 'tax_ready')::boolean,
      true
    ) = false
),
restored as (
  update public.properties properties
  set
    status = 'PUBLISHED',
    updated_at = now()
  from candidates candidate
  where properties.id = candidate.id
  returning
    properties.id,
    candidate.before_state,
    to_jsonb(properties) as after_state
)
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
  null,
  'property.publication.restored_after_optional_tax_fix',
  'property',
  restored.id,
  'Restored automatically because tax configuration is optional and the listing had been auto-paused solely for missing tax certification.',
  restored.before_state,
  restored.after_state,
  jsonb_build_object(
    'tax_setup_optional', true,
    'restored_automatically', true
  )
from restored;


notify pgrst, 'reload schema';

commit;
