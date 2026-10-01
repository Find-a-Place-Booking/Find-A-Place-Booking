-- Find A Place Booking - optional tax verification
-- Read-only checks after applying 20261001150000_optional_host_tax_checkout.sql

-- 1. Published listings no longer need certified tax setup to be "full live".
select
  units.slug,
  properties.status,
  public.property_tax_checkout_ready(properties.id) as tax_configured,
  public.property_live_payment_route_ready(properties.id) as payment_ready,
  public.property_full_live_checkout_ready(properties.id) as live_ready
from public.properties properties
join public.property_units units
  on units.property_id = properties.id
 and units.is_primary
where properties.status in ('PUBLISHED','PAUSED')
order by properties.status, units.slug;

-- 2. Listings restored specifically by this fix.
select
  entity_id as property_id,
  created_at,
  reason
from public.audit_logs
where action = 'property.publication.restored_after_optional_tax_fix'
order by created_at desc;

-- 3. Tax-specific auto-pause triggers should be gone.
select
  c.relname as table_name,
  t.tgname
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and t.tgname in (
    'property_tax_profiles_pause_unready_insert_delete',
    'property_tax_profiles_pause_unready_update'
  );

-- 4. Confirm current publication guard no longer contains tax gates.
select pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and p.proname='enforce_property_live_checkout_readiness'
order by p.oid desc
limit 1;
