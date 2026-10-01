-- Find A Place Booking
-- Read-only guest checkout estimate.
--
-- This adds a quote-only helper used by the checkout UI BEFORE personal
-- information is submitted. It does not create a reservation, payment,
-- availability block, promotion reservation, or Stripe object.
--
-- The real booking path remains:
--   create_guest_taxed_reservation_hold -> payment-intent -> Stripe webhook.
--
-- The estimate uses the same rate/fee source and mirrors the active optional
-- host-tax calculation so the guest can see a useful total before creating
-- the hold.

begin;

create or replace function public.quote_guest_checkout_estimate(
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
as $function$
declare
  quote jsonb;
  property_row public.properties%rowtype;
  profile_row public.property_tax_profiles%rowtype;
  profile_found boolean := false;
  host_configured boolean := false;
  nights integer;
  lodging_cents bigint := 0;
  cleaning_cents bigint := 0;
  pet_cents bigint := 0;
  extra_guest_cents bigint := 0;
  addon_cents bigint := 0;
  accommodation_total_cents bigint := 0;
  pre_tax_total_cents bigint := 0;
  taxable_base_cents bigint := 0;
  line_tax_cents bigint := 0;
  tax_total bigint := 0;
  tax_lines jsonb := '[]'::jsonb;
  automatic_rule_count integer := 0;
  custom_line_count integer := 0;
  rule_row record;
  collection_mode text := 'HOST_SELF_REMIT';
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  quote := public.quote_unit_stay(
    target_unit_id,
    check_in_date,
    check_out_date,
    guest_count,
    pet_count,
    coalesce(selected_add_on_ids, '{}'::uuid[]),
    promotion_code
  );

  select properties.*
  into property_row
  from public.property_units units
  join public.properties properties
    on properties.id = units.property_id
  where units.id = target_unit_id
    and units.is_active
    and properties.status = 'PUBLISHED';

  if not found then
    raise exception 'Published rentable unit not found';
  end if;

  select profiles.*
  into profile_row
  from public.property_tax_profiles profiles
  where profiles.property_id = property_row.id;

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

  nights := check_out_date - check_in_date;

  lodging_cents :=
    greatest(coalesce((quote ->> 'lodging_subtotal_cents')::bigint, 0), 0);
  cleaning_cents :=
    greatest(coalesce((quote ->> 'cleaning_fee_cents')::bigint, 0), 0);
  pet_cents :=
    greatest(coalesce((quote ->> 'pet_fee_cents')::bigint, 0), 0);
  extra_guest_cents :=
    greatest(coalesce((quote ->> 'extra_guest_fee_cents')::bigint, 0), 0);
  addon_cents :=
    greatest(coalesce((quote ->> 'add_on_subtotal_cents')::bigint, 0), 0);
  pre_tax_total_cents :=
    greatest(coalesce((quote ->> 'pre_tax_total_cents')::bigint, 0), 0);

  accommodation_total_cents :=
    lodging_cents + cleaning_cents + pet_cents + extra_guest_cents;

  if host_configured then
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
        and check_in_date >= rules.effective_from
        and (
          rules.effective_to is null
          or check_in_date <= rules.effective_to
        )
        and (
          rules.maximum_stay_nights is null
          or nights <= rules.maximum_stay_nights
        )
      order by authorities.jurisdiction_type, rules.code
    loop
      taxable_base_cents :=
        case rule_row.base_scope
          when 'LODGING_ONLY' then lodging_cents
          when 'PRE_TAX_TOTAL' then pre_tax_total_cents
          else accommodation_total_cents
        end;

      line_tax_cents :=
        round(
          greatest(coalesce(taxable_base_cents, 0), 0)::numeric
          * rule_row.rate_bps::numeric
          / 10000
        )::bigint;

      tax_total := tax_total + greatest(line_tax_cents, 0);
      automatic_rule_count := automatic_rule_count + 1;

      tax_lines :=
        tax_lines || jsonb_build_array(
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
            'taxable_base_cents',
              greatest(coalesce(taxable_base_cents, 0), 0),
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
      where lines.property_id = property_row.id
        and lines.is_active
        and lines.rate_bps > 0
      order by lines.sort_order, lines.created_at
    loop
      taxable_base_cents :=
        case rule_row.base_scope
          when 'LODGING_ONLY' then lodging_cents
          when 'PRE_TAX_TOTAL' then pre_tax_total_cents
          else accommodation_total_cents
        end;

      line_tax_cents :=
        round(
          greatest(coalesce(taxable_base_cents, 0), 0)::numeric
          * rule_row.rate_bps::numeric
          / 10000
        )::bigint;

      tax_total := tax_total + greatest(line_tax_cents, 0);
      custom_line_count := custom_line_count + 1;

      tax_lines :=
        tax_lines || jsonb_build_array(
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
            'taxable_base_cents',
              greatest(coalesce(taxable_base_cents, 0), 0),
            'tax_cents', greatest(line_tax_cents, 0),
            'source', 'HOST_CERTIFIED'
          )
        );
    end loop;

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
         and assignments.property_id = property_row.id
        where rules.is_active
          and authorities.is_active
        order by authorities.jurisdiction_type, rules.code
      loop
        taxable_base_cents :=
          case rule_row.base_scope
            when 'LODGING_ONLY' then lodging_cents
            when 'PRE_TAX_TOTAL' then pre_tax_total_cents
            else accommodation_total_cents
          end;

        line_tax_cents :=
          round(
            greatest(coalesce(taxable_base_cents, 0), 0)::numeric
            * rule_row.rate_bps::numeric
            / 10000
          )::bigint;

        tax_total := tax_total + greatest(line_tax_cents, 0);

        tax_lines :=
          tax_lines || jsonb_build_array(
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
              'taxable_base_cents',
                greatest(coalesce(taxable_base_cents, 0), 0),
              'tax_cents', greatest(line_tax_cents, 0),
              'source', 'LEGACY_ADMIN_RULE'
            )
          );
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'quote', quote,
    'tax_total_cents', tax_total,
    'guest_total_cents', pre_tax_total_cents + tax_total,
    'tax_lines', tax_lines,
    'collection_mode', collection_mode,
    'automatic_rule_count', automatic_rule_count,
    'custom_line_count', custom_line_count,
    'estimate_only', true
  );
end;
$function$;

revoke all on function public.quote_guest_checkout_estimate(
  uuid,
  date,
  date,
  integer,
  integer,
  uuid[],
  text
) from public, anon, authenticated;

grant execute on function public.quote_guest_checkout_estimate(
  uuid,
  date,
  date,
  integer,
  integer,
  uuid[],
  text
) to service_role;

notify pgrst, 'reload schema';

commit;
