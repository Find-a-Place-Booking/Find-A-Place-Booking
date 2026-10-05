-- Statewide tax defaults + host per-tax override.
-- This function has already been applied to production during the implementation session.
create or replace function public.calculate_reservation_checkout_tax(
  target_reservation_id uuid,
  expected_environment public.payment_environment
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  base_result jsonb;
  reservation_row public.reservations%rowtype;
  property_row public.properties%rowtype;
  profile_row public.property_tax_profiles%rowtype;
  profile_found boolean := false;
  host_configured boolean := false;
  state_rule record;
  host_override_rule record;
  custom_rule record;
  host_override_line_ids uuid[] := '{}'::uuid[];
  nights integer;
  lodging_cents bigint := 0;
  cleaning_cents bigint := 0;
  pet_cents bigint := 0;
  extra_guest_cents bigint := 0;
  accommodation_total_cents bigint := 0;
  taxable_base_cents bigint := 0;
  line_tax_cents bigint := 0;
  tax_total bigint := 0;
  tax_lines jsonb := '[]'::jsonb;
  custom_line_count integer := 0;
  automatic_rule_count integer := 0;
  host_state_override_count integer := 0;
  state_sales_rule_found boolean := false;
  collection_mode text;
  updated_snapshot jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  base_result := public.calculate_reservation_lodging_tax(
    target_reservation_id,
    expected_environment
  );

  select reservations.* into reservation_row
  from public.reservations reservations
  where reservations.id = target_reservation_id
  for update;
  if not found then raise exception 'Reservation not found'; end if;

  select properties.* into property_row
  from public.properties properties
  where properties.id = reservation_row.property_id;
  if not found then raise exception 'Reservation property not found'; end if;

  select profiles.* into profile_row
  from public.property_tax_profiles profiles
  where profiles.property_id = reservation_row.property_id;

  profile_found := found;
  host_configured := profile_found and (
    (coalesce(profile_row.host_responsibility_ack, false)
      and profile_row.host_certified_at is not null)
    or coalesce(profile_row.legacy_checkout_allowed, false)
  );

  collection_mode := case
    when host_configured then 'FAP_STATE_PLUS_HOST'
    else 'FAP_STATE_DEFAULTS'
  end;

  nights := reservation_row.check_out - reservation_row.check_in;
  lodging_cents := greatest(coalesce(
    (reservation_row.pricing_snapshot ->> 'lodging_subtotal_cents')::bigint, 0), 0);
  cleaning_cents := greatest(coalesce(
    (reservation_row.pricing_snapshot ->> 'cleaning_fee_cents')::bigint, 0), 0);
  pet_cents := greatest(coalesce(
    (reservation_row.pricing_snapshot ->> 'pet_fee_cents')::bigint, 0), 0);
  extra_guest_cents := greatest(coalesce(
    (reservation_row.pricing_snapshot ->> 'extra_guest_fee_cents')::bigint, 0), 0);
  accommodation_total_cents :=
    lodging_cents + cleaning_cents + pet_cents + extra_guest_cents;

  for state_rule in
    select
      rules.id as rule_id, rules.code as rule_code, rules.label,
      rules.rate_bps, rules.base_scope, rules.maximum_stay_nights,
      authorities.id as authority_id, authorities.code as authority_code,
      authorities.name as authority_name,
      authorities.remittance_agency,
      authorities.jurisdiction_type
    from public.tax_rules rules
    join public.tax_authorities authorities on authorities.id = rules.authority_id
    where rules.is_active
      and authorities.is_active
      and rules.automatic_region
      and not rules.assignment_required
      and authorities.jurisdiction_type in ('STATE_SALES', 'STATE_TOURISM')
      and upper(authorities.country_code) =
        upper(coalesce(property_row.country_code, 'US'))
      and upper(coalesce(authorities.region_code, '')) =
        upper(coalesce(property_row.region_code, ''))
      and reservation_row.check_in >= rules.effective_from
      and (rules.effective_to is null or reservation_row.check_in <= rules.effective_to)
      and (rules.maximum_stay_nights is null or nights <= rules.maximum_stay_nights)
    order by
      case authorities.jurisdiction_type
        when 'STATE_SALES' then 1
        when 'STATE_TOURISM' then 2
        else 9
      end,
      rules.effective_from desc,
      rules.created_at desc
  loop
    if state_rule.jurisdiction_type = 'STATE_SALES' then
      state_sales_rule_found := true;
    end if;

    host_override_rule := null;

    if host_configured then
      select
        lines.id as line_id, lines.category, lines.label, lines.rate_bps,
        lines.base_scope, lines.authority_name
      into host_override_rule
      from public.property_tax_lines lines
      where lines.property_id = reservation_row.property_id
        and lines.is_active
        and lines.rate_bps > 0
        and lines.rate_bps = state_rule.rate_bps
        and (
          upper(coalesce(lines.category, '')) = state_rule.jurisdiction_type
          or (
            state_rule.jurisdiction_type = 'STATE_SALES'
            and (
              lower(trim(lines.label)) = lower(trim(coalesce(property_row.region_code, '')))
              or lower(lines.label) like '%state%tax%'
              or lower(lines.label) like '%state%sales%'
              or position(lower(trim(lines.label)) in lower(state_rule.authority_name)) > 0
              or position(lower(trim(lines.label)) in lower(state_rule.label)) > 0
            )
          )
          or (
            state_rule.jurisdiction_type = 'STATE_TOURISM'
            and lower(lines.label) like '%tourism%'
            and lower(lines.label) not like '%city%'
            and lower(lines.label) not like '%county%'
            and lower(lines.label) not like '%local%'
          )
        )
      order by lines.sort_order, lines.created_at
      limit 1;
    end if;

    if host_override_rule.line_id is not null then
      taxable_base_cents := case host_override_rule.base_scope
        when 'LODGING_ONLY' then lodging_cents
        when 'PRE_TAX_TOTAL' then reservation_row.pre_tax_total_cents
        else accommodation_total_cents
      end;
      taxable_base_cents := greatest(coalesce(taxable_base_cents, 0), 0);
      line_tax_cents := greatest(round(
        taxable_base_cents::numeric * host_override_rule.rate_bps::numeric / 10000
      )::bigint, 0);
      tax_total := tax_total + line_tax_cents;
      host_state_override_count := host_state_override_count + 1;
      host_override_line_ids := array_append(
        host_override_line_ids, host_override_rule.line_id);

      tax_lines := tax_lines || jsonb_build_array(jsonb_build_object(
        'authority_id', state_rule.authority_id,
        'authority_code', state_rule.authority_code,
        'authority_name', coalesce(host_override_rule.authority_name, state_rule.authority_name),
        'remittance_agency', 'Host responsibility',
        'jurisdiction_type', state_rule.jurisdiction_type,
        'rule_id', state_rule.rule_id,
        'rule_code', state_rule.rule_code,
        'host_line_id', host_override_rule.line_id,
        'category', host_override_rule.category,
        'label', host_override_rule.label,
        'rate_bps', host_override_rule.rate_bps,
        'base_scope', host_override_rule.base_scope,
        'taxable_base_cents', taxable_base_cents,
        'tax_cents', line_tax_cents,
        'source', 'HOST_CERTIFIED_STATE_OVERRIDE'
      ));
    else
      taxable_base_cents := case state_rule.base_scope
        when 'LODGING_ONLY' then lodging_cents
        when 'PRE_TAX_TOTAL' then reservation_row.pre_tax_total_cents
        else accommodation_total_cents
      end;
      taxable_base_cents := greatest(coalesce(taxable_base_cents, 0), 0);
      line_tax_cents := greatest(round(
        taxable_base_cents::numeric * state_rule.rate_bps::numeric / 10000
      )::bigint, 0);
      tax_total := tax_total + line_tax_cents;
      automatic_rule_count := automatic_rule_count + 1;

      tax_lines := tax_lines || jsonb_build_array(jsonb_build_object(
        'authority_id', state_rule.authority_id,
        'authority_code', state_rule.authority_code,
        'authority_name', state_rule.authority_name,
        'remittance_agency', state_rule.remittance_agency,
        'jurisdiction_type', state_rule.jurisdiction_type,
        'rule_id', state_rule.rule_id,
        'rule_code', state_rule.rule_code,
        'label', state_rule.label,
        'rate_bps', state_rule.rate_bps,
        'base_scope', state_rule.base_scope,
        'taxable_base_cents', taxable_base_cents,
        'tax_cents', line_tax_cents,
        'source', 'PLATFORM_STATE_RULE'
      ));
    end if;
  end loop;

  if expected_environment = 'LIVE'::public.payment_environment
     and not state_sales_rule_found then
    raise exception 'No active statewide sales tax rule is configured for %',
      coalesce(property_row.region_code, 'this property');
  end if;

  if host_configured then
    for custom_rule in
      select
        lines.id as line_id, lines.category, lines.label, lines.rate_bps,
        lines.base_scope, lines.authority_name
      from public.property_tax_lines lines
      where lines.property_id = reservation_row.property_id
        and lines.is_active
        and lines.rate_bps > 0
        and not (lines.id = any(host_override_line_ids))
      order by lines.sort_order, lines.created_at
    loop
      taxable_base_cents := case custom_rule.base_scope
        when 'LODGING_ONLY' then lodging_cents
        when 'PRE_TAX_TOTAL' then reservation_row.pre_tax_total_cents
        else accommodation_total_cents
      end;
      taxable_base_cents := greatest(coalesce(taxable_base_cents, 0), 0);
      line_tax_cents := greatest(round(
        taxable_base_cents::numeric * custom_rule.rate_bps::numeric / 10000
      )::bigint, 0);
      tax_total := tax_total + line_tax_cents;
      custom_line_count := custom_line_count + 1;

      tax_lines := tax_lines || jsonb_build_array(jsonb_build_object(
        'authority_id', null,
        'authority_code', 'HOST_PROPERTY_TAX',
        'authority_name', coalesce(
          custom_rule.authority_name,
          case when profile_found then profile_row.locality_name else null end,
          'Host configured tax'
        ),
        'remittance_agency', 'Host responsibility',
        'rule_id', custom_rule.line_id,
        'rule_code', 'HOST_PROPERTY_TAX_LINE',
        'category', custom_rule.category,
        'label', custom_rule.label,
        'rate_bps', custom_rule.rate_bps,
        'base_scope', custom_rule.base_scope,
        'taxable_base_cents', taxable_base_cents,
        'tax_cents', line_tax_cents,
        'source', 'HOST_CERTIFIED'
      ));
    end loop;
  end if;

  updated_snapshot :=
    coalesce(reservation_row.tax_snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'calculation_engine', 'FAP_STATE_PLUS_HOST_TAX_V2',
      'collection_mode', collection_mode,
      'settlement', 'HOST_CONNECTED_ACCOUNT',
      'platform_tax_retained_cents', 0,
      'property', jsonb_build_object(
        'property_id', property_row.id,
        'street_address', property_row.street_address,
        'city', property_row.city,
        'region_code', property_row.region_code,
        'postal_code', property_row.postal_code,
        'country_code', property_row.country_code,
        'county_name', case when profile_found then profile_row.county_name else null end,
        'locality_name', case when profile_found then profile_row.locality_name else null end,
        'host_tax_configuration', host_configured,
        'host_certified_at', case when profile_found then profile_row.host_certified_at else null end,
        'configuration_source', case when profile_found then profile_row.configuration_source else null end
      ),
      'automatic_rule_count', automatic_rule_count,
      'host_state_override_count', host_state_override_count,
      'custom_line_count', custom_line_count,
      'rules', tax_lines,
      'tax_total_cents', tax_total,
      'responsibility', 'HOST'
    );

  update public.reservations reservations
  set
    tax_total_cents = tax_total,
    guest_total_cents = reservations.pre_tax_total_cents + tax_total,
    tax_status = 'CALCULATED',
    tax_snapshot = updated_snapshot,
    tax_provider = case
      when host_configured then 'FAP_STATE_PLUS_HOST_TAX'
      else 'FAP_STATE_DEFAULTS'
    end,
    platform_tax_retained_cents = 0,
    updated_at = now()
  where reservations.id = target_reservation_id
  returning * into reservation_row;

  insert into public.reservation_events (
    reservation_id,event_type,actor_profile_id,metadata
  ) values (
    target_reservation_id,
    'CHECKOUT_TAX_RECONCILED',
    null,
    jsonb_build_object(
      'calculation_engine', 'FAP_STATE_PLUS_HOST_TAX_V2',
      'automatic_rule_count', automatic_rule_count,
      'host_state_override_count', host_state_override_count,
      'custom_line_count', custom_line_count,
      'tax_total_cents', tax_total,
      'guest_total_cents', reservation_row.guest_total_cents,
      'tax_responsibility', 'HOST',
      'collection_mode', collection_mode,
      'payment_environment', expected_environment
    )
  );

  return jsonb_build_object(
    'calculation_id', reservation_row.tax_provider_calculation_id,
    'tax_status', reservation_row.tax_status,
    'tax_total_cents', tax_total,
    'guest_total_cents', reservation_row.guest_total_cents,
    'platform_tax_retained_cents', 0,
    'host_tax_cents', tax_total,
    'tax_settlement', 'HOST_CONNECTED_ACCOUNT',
    'tax_responsibility', 'HOST',
    'collection_mode', collection_mode,
    'tax_snapshot', reservation_row.tax_snapshot
  );
end;
$function$;

notify pgrst, 'reload schema';
