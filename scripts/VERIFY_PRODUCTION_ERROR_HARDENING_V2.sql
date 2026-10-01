-- Find A Place Booking
-- Read-only verification for:
-- 20260930230000_production_error_hardening_v2.sql

-- 1. Slug conflict patch must be present.
with f as (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'save_property_listing'
  order by p.oid
  limit 1
)
select
  position(
    'on conflict on constraint listing_slug_history_pkey'
    in lower(def)
  ) > 0 as slug_conflict_fix_installed
from f;

-- 2. Historical supported full-state names should be gone.
select region_code, count(*) as properties
from public.properties
where upper(trim(coalesce(region_code, ''))) in (
  'ARKANSAS','MISSOURI','TEXAS','TENNESSEE'
)
group by region_code;

-- 3. Every PUBLISHED property must pass the exact readiness helper.
select
  units.slug,
  properties.region_code,
  properties.live_checkout_enabled
from public.properties properties
join public.property_units units
  on units.property_id = properties.id
 and units.is_primary
where properties.status = 'PUBLISHED'
  and not public.property_full_live_checkout_ready(properties.id)
order by units.slug;

-- 4. Remaining PUBLISHED inventory with readiness components.
select
  units.slug,
  properties.status,
  properties.region_code,
  public.property_tax_checkout_ready(properties.id) as tax_ready,
  public.region_state_tax_rules_ready(properties.region_code) as state_rules_ready,
  public.property_live_payment_route_ready(properties.id) as payment_ready
from public.properties properties
join public.property_units units
  on units.property_id = properties.id
 and units.is_primary
where properties.status = 'PUBLISHED'
order by units.slug;

-- 5. Listings automatically paused by readiness hardening.
select
  logs.entity_id as property_id,
  logs.metadata ->> 'tax_ready' as tax_ready,
  logs.metadata ->> 'state_tax_rules_ready' as state_tax_rules_ready,
  logs.metadata ->> 'payment_route_ready' as payment_route_ready,
  logs.metadata ->> 'address_ready' as address_ready,
  logs.metadata ->> 'live_checkout_enabled' as live_checkout_enabled,
  logs.created_at
from public.audit_logs logs
where logs.action =
  'property.publication.auto_paused_checkout_not_ready'
order by logs.created_at desc;

-- 6. Verify hardening triggers exist.
select
  c.relname as table_name,
  t.tgname,
  t.tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and t.tgname in (
    'properties_aa_normalize_region_code',
    'properties_enforce_live_checkout_readiness',
    'properties_pause_when_live_gate_disabled',
    'property_tax_profiles_pause_unready_insert_delete',
    'property_tax_profiles_pause_unready_update',
    'payment_accounts_pause_unready_insert_delete',
    'payment_accounts_pause_unready_update',
    'payment_account_assignments_pause_unready',
    'host_onboarding_drafts_sync_ready_tax'
  )
order by c.relname, t.tgname;

-- 7. Automation tables should exist.
select
  to_regclass('public.host_guest_email_rules')
    as host_guest_email_rules,
  to_regclass('public.reservation_guest_instructions')
    as reservation_guest_instructions;

-- 8. Current supported statewide rule counts.
select
  authorities.region_code,
  count(*) as automatic_active_rules
from public.tax_rules rules
join public.tax_authorities authorities
  on authorities.id = rules.authority_id
where rules.is_active
  and authorities.is_active
  and rules.automatic_region
  and not rules.assignment_required
  and authorities.region_code in ('AR','MO','TX','TN')
  and current_date >= rules.effective_from
  and (
    rules.effective_to is null
    or current_date <= rules.effective_to
  )
group by authorities.region_code
order by authorities.region_code;

-- 9. Manual review helper: host-certified custom tax lines.
select
  p.name,
  u.slug,
  p.city,
  p.region_code,
  tp.county_name,
  tp.locality_name,
  l.label,
  l.rate_bps
from public.properties p
join public.property_units u
  on u.property_id = p.id
 and u.is_primary
join public.property_tax_profiles tp
  on tp.property_id = p.id
join public.property_tax_lines l
  on l.property_id = p.id
 and l.is_active
where tp.host_responsibility_ack
  and tp.host_certified_at is not null
order by u.slug, l.sort_order;
