-- Follow-up to 20261110050000_new_host_intro_25_three_stays.sql.
-- A property with three already CONFIRMED Find A Place reservations must not
-- advertise or auto-select the new-host 25% offer even if its promotional
-- redemption cap is not yet exhausted. No existing reservations are changed.
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
    and (select count(*) from public.reservations r
         where r.property_id=p.id and r.status='CONFIRMED') < 3
    and (target_unit_id is null or u.id=target_unit_id)
    and (promo.max_redemptions - promo.redemption_count -
      (select count(*)::integer from public.promotion_reservations pr
       where pr.promotion_code_id=promo.id and pr.status='RESERVED'
         and pr.reserved_until>now())) > 0;
$$;
revoke all on function public.fap_public_intro_offers(uuid) from public,anon,authenticated;
grant execute on function public.fap_public_intro_offers(uuid) to anon,authenticated,service_role;
