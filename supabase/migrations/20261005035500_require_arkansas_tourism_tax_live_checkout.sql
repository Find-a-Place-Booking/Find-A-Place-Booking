create or replace function public.validate_live_required_tax_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  property_region text;
  rules_json jsonb;
  collection_mode text;
begin
  if new.payment_environment <> 'LIVE'::public.payment_environment
     or new.tax_status::text <> 'CALCULATED' then
    return new;
  end if;

  collection_mode := upper(
    coalesce(new.tax_snapshot ->> 'collection_mode', '')
  );

  -- The base calculator can emit an intermediate HOST_SELF_REMIT snapshot
  -- before calculate_reservation_checkout_tax() writes the final checkout
  -- snapshot. Final live validation happens on the reconciled snapshot.
  if collection_mode = 'HOST_SELF_REMIT'
     or upper(coalesce(new.tax_provider, '')) = 'HOST_SELF_REMIT' then
    return new;
  end if;

  select upper(coalesce(properties.region_code, ''))
  into property_region
  from public.properties properties
  where properties.id = new.property_id;

  rules_json := coalesce(new.tax_snapshot -> 'rules', '[]'::jsonb);

  if property_region = 'AR' then
    if not exists (
      select 1
      from jsonb_array_elements(rules_json) rule
      where rule ->> 'rule_code' = 'AR_STATE_SALES_2026'
    ) then
      raise exception
        'Arkansas LIVE checkout requires AR_STATE_SALES_2026 in the tax snapshot';
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(rules_json) rule
      where rule ->> 'rule_code' = 'AR_TOURISM_LODGING_2026'
    ) then
      raise exception
        'Arkansas LIVE checkout requires AR_TOURISM_LODGING_2026 in the tax snapshot';
    end if;
  end if;

  if property_region = 'MO' and not exists (
    select 1
    from jsonb_array_elements(rules_json) rule
    where rule ->> 'rule_code' = 'MO_LODGING_SALES_2026'
  ) then
    raise exception
      'Missouri LIVE checkout requires MO_LODGING_SALES_2026 in the tax snapshot';
  end if;

  if property_region = 'TN' and not exists (
    select 1
    from jsonb_array_elements(rules_json) rule
    where rule ->> 'rule_code' = 'TN_STATE_SALES_2026'
  ) then
    raise exception
      'Tennessee LIVE checkout requires TN_STATE_SALES_2026 in the tax snapshot';
  end if;

  if property_region = 'TX' and not exists (
    select 1
    from jsonb_array_elements(rules_json) rule
    where rule ->> 'rule_code' = 'TX_STATE_HOTEL_2026'
  ) then
    raise exception
      'Texas LIVE checkout requires TX_STATE_HOTEL_2026 in the tax snapshot';
  end if;

  return new;
end;
$function$;
