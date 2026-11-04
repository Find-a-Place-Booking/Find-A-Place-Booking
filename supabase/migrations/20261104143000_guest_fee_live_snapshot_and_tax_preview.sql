-- Find A Place Booking: correct guest-paid platform fee snapshots and tax previews.
-- This is a source-control copy of fixes ALREADY applied to production Supabase on Nov 4, 2026.
-- This migration is idempotent and does not activate the LIVE fee switch on a new environment.
-- To enable a new environment, use the rollout setting after verification.

create or replace function public.fap_insert_guest_fee_snapshot()
returns trigger language plpgsql set search_path = '' as $$
declare service_fee bigint; current_quote jsonb;
begin
  if coalesce(current_setting('fap.guest_paid_hold_v2', true), '') <> 'on' then return new; end if;
  if new.status <> 'HOLD' or new.payment_status <> 'NOT_STARTED'
     or new.payment_account_id is null or new.payment_provider <> 'STRIPE' then
    raise exception 'Guest platform-fee insertion requires a new unpaid Stripe checkout hold';
  end if;
  if not coalesce(public.fap_guest_fee_enabled(new.payment_environment), false) then return new; end if;
  if coalesce(new.pricing_snapshot, '{}'::jsonb) ? 'guest_service_fee_cents' then
    raise exception 'Guest service fee is already snapshotted';
  end if;
  service_fee := greatest(coalesce(new.platform_commission_cents, 0), 0);
  if service_fee = 0 then return new; end if;
  current_quote := coalesce(new.pricing_snapshot, '{}'::jsonb);
  new.pre_tax_total_cents := new.pre_tax_total_cents + service_fee;
  new.guest_total_cents := new.guest_total_cents + service_fee;
  new.pricing_snapshot := current_quote || jsonb_build_object(
    'guest_service_fee_cents', service_fee,
    'fee_payer', 'GUEST',
    'guest_service_fee_rate_bps', new.commission_rate_bps,
    'pre_tax_total_cents', new.pre_tax_total_cents,
    'guest_total_cents', new.guest_total_cents,
    'fee_lines', coalesce(current_quote -> 'fee_lines', '[]'::jsonb)
       || jsonb_build_array(jsonb_build_object(
            'id','find-a-place-service-fee', 'type','SERVICE_FEE',
            'label','Find A Place service fee', 'amount_cents',service_fee))
  );
  return new;
end;$$;

drop trigger if exists reservations_ab_guest_service_fee_snapshot on public.reservations;
create trigger reservations_ab_guest_service_fee_snapshot
  before insert on public.reservations for each row
  execute function public.fap_insert_guest_fee_snapshot();

create or replace function public.fap_create_guest_taxed_reservation_hold_v2(
  target_unit_id uuid, requested_check_in date, requested_check_out date,
  requested_guest_count integer, requested_pet_count integer default 0,
  requested_add_on_ids uuid[] default '{}'::uuid[],
  requested_promotion_code text default null,
  requested_guest_name text default null,
  requested_guest_email text default null,
  requested_guest_phone text default null,
  requested_payment_environment public.payment_environment default 'TEST'::public.payment_environment
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; stored public.reservations%rowtype;
  calculated_quote jsonb; fee_cents bigint := 0;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then raise exception 'Service role required'; end if;
  perform set_config('fap.guest_paid_hold_v2', 'on', true);
  begin
    result := public.create_guest_taxed_reservation_hold(
      target_unit_id, requested_check_in, requested_check_out,
      requested_guest_count, requested_pet_count,
      coalesce(requested_add_on_ids, '{}'::uuid[]),
      requested_promotion_code, requested_guest_name, requested_guest_email,
      requested_guest_phone, requested_payment_environment
    );
  exception when others then
    perform set_config('fap.guest_paid_hold_v2', 'off', true); raise;
  end;
  perform set_config('fap.guest_paid_hold_v2', 'off', true);
  select r.* into stored from public.reservations r
    where r.id = (result->>'reservation_id')::uuid;
  if not found then raise exception 'Created reservation not found'; end if;
  if stored.tax_status <> 'CALCULATED' then
    raise exception 'Guest reservation tax calculation did not complete'; end if;
  if stored.guest_total_cents <> stored.pre_tax_total_cents + stored.tax_total_cents then
    raise exception 'Guest reservation amount does not match subtotal plus taxes'; end if;
  fee_cents := greatest(coalesce((stored.pricing_snapshot->>'guest_service_fee_cents')::bigint,0),0);
  if public.fap_guest_fee_enabled(requested_payment_environment)
      and stored.platform_commission_cents > 0
      and fee_cents <> stored.platform_commission_cents then
    raise exception 'Guest platform service fee differs from Stripe application fee'; end if;
  calculated_quote := coalesce(stored.pricing_snapshot,'{}'::jsonb)
    || jsonb_build_object('taxes_calculated',true,
      'tax_total_cents',stored.tax_total_cents,
      'guest_total_cents',stored.guest_total_cents,
      'tax_lines',coalesce(result->'quote'->'tax_lines','[]'::jsonb));
  return result || jsonb_build_object(
    'quote',calculated_quote,'tax_status',stored.tax_status,
    'tax_total_cents',stored.tax_total_cents,
    'guest_total_cents',stored.guest_total_cents,
    'platform_tax_retained_cents',stored.platform_tax_retained_cents,
    'platform_commission_cents',stored.platform_commission_cents,
    'guest_service_fee_cents',fee_cents,
    'fee_payer',case when fee_cents > 0 then 'GUEST' else 'HOST' end);
end;$$;
revoke all on function public.fap_create_guest_taxed_reservation_hold_v2(uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment)
from public,anon,authenticated;
grant execute on function public.fap_create_guest_taxed_reservation_hold_v2(uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment) to service_role;

-- Keep original v2 estimate calculation behind a new internal name.
do $$begin
  if to_regprocedure('public.fap_quote_guest_checkout_estimate_base_v2(uuid,date,date,integer,integer,uuid[],text,public.payment_environment)') is null then
    alter function public.fap_quote_guest_checkout_estimate_v2(uuid,date,date,integer,integer,uuid[],text,public.payment_environment)
      rename to fap_quote_guest_checkout_estimate_base_v2;
  end if;
end$$;

create or replace function public.fap_quote_guest_checkout_estimate_v2(
  target_unit_id uuid, check_in_date date, check_out_date date, guest_count integer,
  pet_count integer default 0, selected_add_on_ids uuid[] default '{}'::uuid[],
  promotion_code text default null,
  requested_payment_environment public.payment_environment default 'TEST'::public.payment_environment
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; snapshot jsonb; property_row public.properties%rowtype;
  profile public.property_tax_profiles%rowtype; host_configured boolean := false;
  tax_rule record; nights integer; lodging bigint; accommodation bigint;
  subtotal bigint; taxable_base bigint; tax_added bigint := 0;
  total_tax bigint; guest_total bigint; tax_value bigint; lines jsonb;
begin
  if coalesce((select auth.role()),'') <> 'service_role' then raise exception 'Service role required'; end if;
  result := public.fap_quote_guest_checkout_estimate_base_v2(
    target_unit_id,check_in_date,check_out_date,guest_count,
    pet_count,coalesce(selected_add_on_ids,'{}'::uuid[]),
    promotion_code,requested_payment_environment);
  select p.* into property_row from public.property_units u
    join public.properties p on p.id=u.property_id where u.id=target_unit_id;
  if not found then return result; end if;
  select pr.* into profile from public.property_tax_profiles pr
    where pr.property_id=property_row.id;
  host_configured := found and (
    (coalesce(profile.host_responsibility_ack,false)
      and profile.host_certified_at is not null)
    or coalesce(profile.legacy_checkout_allowed,false));
  if host_configured then return result; end if;
  snapshot := coalesce(result->'quote','{}'::jsonb);
  lodging := greatest(coalesce((snapshot->>'lodging_subtotal_cents')::bigint,0),0);
  accommodation := lodging
    + greatest(coalesce((snapshot->>'cleaning_fee_cents')::bigint,0),0)
    + greatest(coalesce((snapshot->>'pet_fee_cents')::bigint,0),0)
    + greatest(coalesce((snapshot->>'extra_guest_fee_cents')::bigint,0),0);
  subtotal := greatest(coalesce((snapshot->>'pre_tax_total_cents')::bigint,0),0);
  nights := check_out_date - check_in_date;
  lines := coalesce(result->'tax_lines','[]'::jsonb);
  total_tax := greatest(coalesce((result->>'tax_total_cents')::bigint,0),0);
  for tax_rule in select r.id as rule_id, r.code, r.label, r.rate_bps,
      r.base_scope, r.maximum_stay_nights, a.id as authority_id,
      a.name as authority_name, a.jurisdiction_type
    from public.tax_rules r join public.tax_authorities a on a.id=r.authority_id
    where r.is_active and a.is_active and r.automatic_region and not r.assignment_required
      and a.jurisdiction_type in ('STATE_SALES','STATE_TOURISM')
      and upper(a.country_code)=upper(coalesce(property_row.country_code,'US'))
      and upper(coalesce(a.region_code,''))=upper(coalesce(property_row.region_code,''))
      and check_in_date>=r.effective_from
      and (r.effective_to is null or check_in_date<=r.effective_to)
      and (r.maximum_stay_nights is null or nights<=r.maximum_stay_nights)
    order by case a.jurisdiction_type when 'STATE_SALES' then 1
        when 'STATE_TOURISM' then 2 else 9 end, r.effective_from desc,r.created_at desc
  loop
    if exists(select 1 from jsonb_array_elements(lines) item
        where item->>'rule_id'=tax_rule.rule_id::text) then continue; end if;
    taxable_base := case tax_rule.base_scope
      when 'LODGING_ONLY' then lodging
      when 'PRE_TAX_TOTAL' then subtotal
      else accommodation end;
    tax_value := greatest(round(greatest(taxable_base,0)::numeric
      * tax_rule.rate_bps::numeric/10000)::bigint,0);
    tax_added := tax_added + tax_value;
    lines := lines || jsonb_build_array(jsonb_build_object(
      'rule_id',tax_rule.rule_id,'rule_code',tax_rule.code,
      'authority_id',tax_rule.authority_id,'authority_name',tax_rule.authority_name,
      'jurisdiction_type',tax_rule.jurisdiction_type,
      'label',tax_rule.label,'rate_bps',tax_rule.rate_bps,
      'base_scope',tax_rule.base_scope,'taxable_base_cents',taxable_base,
      'tax_cents',tax_value,'source','PLATFORM_STATE_RULE'));
  end loop;
  total_tax := total_tax + tax_added;
  guest_total := greatest(coalesce((result->>'guest_total_cents')::bigint,0),0)+tax_added;
  snapshot := snapshot || jsonb_build_object('taxes_calculated',true,
    'tax_total_cents',total_tax,'guest_total_cents',guest_total,'tax_lines',lines);
  return result || jsonb_build_object('quote',snapshot,'tax_total_cents',total_tax,
    'guest_total_cents',guest_total,'tax_lines',lines,
    'collection_mode','FAP_STATE_DEFAULTS');
end;$$;
revoke all on function public.fap_quote_guest_checkout_estimate_v2(uuid,date,date,integer,integer,uuid[],text,public.payment_environment)
from public,anon,authenticated;
grant execute on function public.fap_quote_guest_checkout_estimate_v2(uuid,date,date,integer,integer,uuid[],text,public.payment_environment) to service_role;
