-- Find A Place Booking
-- Production error hardening V2 FINAL
--
-- Audited against the current production schema before packaging.
--
-- Fixes / guards:
--   1) Fix PostgreSQL 42702 "column reference slug is ambiguous".
--   2) Normalize supported state names/codes (ARKANSAS -> AR, etc.) at the
--      database boundary so automatic state tax rules cannot silently miss.
--   3) Require a genuinely routable LIVE Stripe account, tax certification,
--      supported-state tax rules, full tax address, and live-checkout gate
--      before a listing may enter PUBLISHED.
--   4) Automatically pause a published listing if tax certification, Stripe
--      routing, or the live-checkout gate later becomes invalid.
--   5) Persist the accepted host-onboarding tax setup into the real property
--      tax tables once onboarding is READY_FOR_PROPERTY.
--   6) Pause existing published listings that cannot pass LIVE checkout now.
--   7) Reload PostgREST schema cache.
--
-- This migration does NOT alter:
--   * Stripe direct-charge / application-fee math
--   * commission rates
--   * reservation/payment/refund amounts
--   * existing reservations
--   * calendar availability
--   * payout timing
--   * configured tax rates
--
-- Existing reservations remain untouched when a listing is paused.

begin;


-- ===========================================================================
-- 1. Canonical supported-state normalization.
-- ===========================================================================

create or replace function public.normalize_supported_region_code(
  input_value text
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case upper(trim(coalesce(input_value, '')))
    when '' then null
    when 'AR' then 'AR'
    when 'ARKANSAS' then 'AR'
    when 'MO' then 'MO'
    when 'MISSOURI' then 'MO'
    when 'TX' then 'TX'
    when 'TEXAS' then 'TX'
    when 'TN' then 'TN'
    when 'TENNESSEE' then 'TN'
    else upper(trim(input_value))
  end;
$function$;

revoke all on function public.normalize_supported_region_code(text)
from public, anon;

-- Repair historical full-state-name rows before installing the publication
-- readiness trigger, because some of those rows still need tax certification.
update public.properties properties
set region_code = public.normalize_supported_region_code(properties.region_code)
where properties.region_code is distinct from
  public.normalize_supported_region_code(properties.region_code);

create or replace function public.normalize_property_region_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.region_code :=
    public.normalize_supported_region_code(new.region_code);
  return new;
end;
$function$;

revoke all on function public.normalize_property_region_code()
from public, anon, authenticated;

drop trigger if exists properties_aa_normalize_region_code
on public.properties;

-- PostgreSQL fires same-event triggers alphabetically. "aa" intentionally
-- runs before the live-readiness guard below.
create trigger properties_aa_normalize_region_code
before insert or update of region_code
on public.properties
for each row
execute function public.normalize_property_region_code();


-- ===========================================================================
-- 2. Fix save_property_listing() slug-history ambiguity.
-- ===========================================================================

do $patch_save_property_listing$
declare
  function_def text;
  patched_def text;
begin
  select pg_get_functiondef(p.oid)
  into function_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'save_property_listing'
  order by p.oid
  limit 1;

  if function_def is null then
    raise exception
      'Expected public.save_property_listing() was not found; migration stopped safely.';
  end if;

  if position(
    'on conflict on constraint listing_slug_history_pkey'
    in lower(function_def)
  ) > 0 then
    null;
  else
    patched_def := regexp_replace(
      function_def,
      'on[[:space:]]+conflict[[:space:]]*\(slug\)[[:space:]]+do[[:space:]]+nothing;',
      'on conflict on constraint listing_slug_history_pkey do nothing;',
      'i'
    );

    if patched_def = function_def then
      raise exception
        'Could not locate the expected ON CONFLICT (slug) clause in save_property_listing(); migration stopped safely.';
    end if;

    execute patched_def;
  end if;
end;
$patch_save_property_listing$;


-- ===========================================================================
-- 3. Reusable LIVE-checkout readiness checks.
-- ===========================================================================

create or replace function public.property_tax_checkout_ready(
  target_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.property_tax_profiles profiles
    where profiles.property_id = target_property_id
      and (
        (
          coalesce(profiles.host_responsibility_ack, false)
          and profiles.host_certified_at is not null
        )
        or coalesce(profiles.legacy_checkout_allowed, false)
      )
  );
$function$;

revoke all on function public.property_tax_checkout_ready(uuid)
from public, anon, authenticated;


create or replace function public.region_state_tax_rules_ready(
  region_code_value text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  normalized_region text :=
    public.normalize_supported_region_code(region_code_value);
  automatic_rule_count integer := 0;
begin
  if normalized_region not in ('AR','MO','TX','TN') then
    return false;
  end if;

  select count(*)
  into automatic_rule_count
  from public.tax_rules rules
  join public.tax_authorities authorities
    on authorities.id = rules.authority_id
  where rules.is_active
    and authorities.is_active
    and rules.automatic_region
    and not rules.assignment_required
    and upper(coalesce(authorities.country_code, 'US')) = 'US'
    and upper(coalesce(authorities.region_code, '')) = normalized_region
    and current_date >= rules.effective_from
    and (
      rules.effective_to is null
      or current_date <= rules.effective_to
    );

  if normalized_region = 'AR' then
    return automatic_rule_count >= 2;
  end if;

  return automatic_rule_count >= 1;
end;
$function$;

revoke all on function public.region_state_tax_rules_ready(text)
from public, anon, authenticated;


create or replace function public.property_live_payment_route_ready(
  target_property_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  target_organization_id uuid;
  target_unit_id uuid;
begin
  select properties.organization_id, units.id
  into target_organization_id, target_unit_id
  from public.properties properties
  join public.property_units units
    on units.property_id = properties.id
   and units.is_primary
   and units.is_active
  where properties.id = target_property_id
  limit 1;

  if target_organization_id is null or target_unit_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.payment_account_assignments assignments
    join public.payment_accounts accounts
      on accounts.id = assignments.payment_account_id
    where assignments.unit_id = target_unit_id
      and assignments.environment = 'LIVE'
      and accounts.organization_id = target_organization_id
      and accounts.provider = 'STRIPE'
      and accounts.environment = 'LIVE'
      and accounts.status = 'READY'
      and accounts.charges_enabled
      and accounts.payouts_enabled
      and accounts.provider_account_id is not null
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.payment_account_assignments assignments
    join public.payment_accounts accounts
      on accounts.id = assignments.payment_account_id
    where assignments.property_id = target_property_id
      and assignments.environment = 'LIVE'
      and accounts.organization_id = target_organization_id
      and accounts.provider = 'STRIPE'
      and accounts.environment = 'LIVE'
      and accounts.status = 'READY'
      and accounts.charges_enabled
      and accounts.payouts_enabled
      and accounts.provider_account_id is not null
  ) then
    return true;
  end if;

  return exists (
    select 1
    from public.payment_accounts accounts
    where accounts.organization_id = target_organization_id
      and accounts.provider = 'STRIPE'
      and accounts.environment = 'LIVE'
      and accounts.is_default
      and accounts.status = 'READY'
      and accounts.charges_enabled
      and accounts.payouts_enabled
      and accounts.provider_account_id is not null
  );
end;
$function$;

revoke all on function public.property_live_payment_route_ready(uuid)
from public, anon, authenticated;


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
    and public.region_state_tax_rules_ready(property_row.region_code)
    and public.property_tax_checkout_ready(target_property_id)
    and public.property_live_payment_route_ready(target_property_id);
end;
$function$;

revoke all on function public.property_full_live_checkout_ready(uuid)
from public, anon, authenticated;


-- ===========================================================================
-- 4. Prevent future publication of a listing that LIVE checkout will reject.
-- ===========================================================================

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

  if not public.region_state_tax_rules_ready(new.region_code) then
    raise exception
      'Live checkout tax rules are not configured for this property state';
  end if;

  if not public.property_tax_checkout_ready(new.id) then
    raise exception
      'Complete and certify the property tax setup before publishing';
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

drop trigger if exists properties_enforce_live_checkout_readiness
on public.properties;

create trigger properties_enforce_live_checkout_readiness
before insert or update of
  status,
  street_address,
  city,
  region_code,
  postal_code,
  organization_id
on public.properties
for each row
execute function public.enforce_property_live_checkout_readiness();


-- ===========================================================================
-- 5. Fail closed when a dependency becomes invalid after publication.
-- ===========================================================================

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
  tax_ready boolean;
  payment_ready boolean;
  state_rules_ready boolean;
  address_ready boolean;
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

  tax_ready :=
    public.property_tax_checkout_ready(before_row.id);
  payment_ready :=
    public.property_live_payment_route_ready(before_row.id);
  state_rules_ready :=
    public.region_state_tax_rules_ready(before_row.region_code);

  if coalesce(before_row.live_checkout_enabled, false)
     and address_ready
     and tax_ready
     and payment_ready
     and state_rules_ready
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
      'state_tax_rules_ready', state_rules_ready,
      'tax_ready', tax_ready,
      'payment_route_ready', payment_ready,
      'existing_reservations_preserved', true
    )
  );

  return true;
end;
$function$;

revoke all on function
  public.pause_property_if_live_readiness_lost(uuid,text)
from public, anon, authenticated;


create or replace function public.pause_property_on_live_gate_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.live_checkout_enabled
     and not new.live_checkout_enabled
  then
    perform public.pause_property_if_live_readiness_lost(
      new.id,
      'Listing automatically paused because LIVE checkout was disabled.'
    );
  end if;

  return new;
end;
$function$;

drop trigger if exists properties_pause_when_live_gate_disabled
on public.properties;

create trigger properties_pause_when_live_gate_disabled
after update of live_checkout_enabled
on public.properties
for each row
execute function public.pause_property_on_live_gate_change();


create or replace function public.pause_property_on_tax_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_id uuid;
begin
  target_id :=
    case
      when tg_op = 'DELETE' then old.property_id
      else new.property_id
    end;

  perform public.pause_property_if_live_readiness_lost(
    target_id,
    'Listing automatically paused because its property tax certification is no longer LIVE-checkout ready.'
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists property_tax_profiles_pause_unready_insert_delete
on public.property_tax_profiles;

create trigger property_tax_profiles_pause_unready_insert_delete
after insert or delete
on public.property_tax_profiles
for each row
execute function public.pause_property_on_tax_profile_change();

drop trigger if exists property_tax_profiles_pause_unready_update
on public.property_tax_profiles;

create trigger property_tax_profiles_pause_unready_update
after update of
  host_responsibility_ack,
  host_certified_at,
  legacy_checkout_allowed
on public.property_tax_profiles
for each row
execute function public.pause_property_on_tax_profile_change();


create or replace function public.pause_properties_on_payment_account_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_organization_id uuid;
  property_row record;
begin
  target_organization_id :=
    case
      when tg_op = 'DELETE' then old.organization_id
      else new.organization_id
    end;

  if target_organization_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  for property_row in
    select properties.id
    from public.properties properties
    where properties.organization_id = target_organization_id
      and properties.status = 'PUBLISHED'
  loop
    perform public.pause_property_if_live_readiness_lost(
      property_row.id,
      'Listing automatically paused because its LIVE Stripe payment route is no longer ready.'
    );
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists payment_accounts_pause_unready_insert_delete
on public.payment_accounts;

create trigger payment_accounts_pause_unready_insert_delete
after insert or delete
on public.payment_accounts
for each row
execute function public.pause_properties_on_payment_account_change();

drop trigger if exists payment_accounts_pause_unready_update
on public.payment_accounts;

create trigger payment_accounts_pause_unready_update
after update of
  status,
  charges_enabled,
  payouts_enabled,
  provider_account_id,
  is_default
on public.payment_accounts
for each row
execute function public.pause_properties_on_payment_account_change();


create or replace function public.pause_property_on_payment_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  old_property_id uuid;
  new_property_id uuid;
begin
  if tg_op <> 'INSERT' then
    old_property_id := old.property_id;

    if old_property_id is null and old.unit_id is not null then
      select units.property_id
      into old_property_id
      from public.property_units units
      where units.id = old.unit_id;
    end if;

    if old_property_id is not null then
      perform public.pause_property_if_live_readiness_lost(
        old_property_id,
        'Listing automatically paused because its LIVE payment-account assignment no longer resolves to a ready Stripe account.'
      );
    end if;
  end if;

  if tg_op <> 'DELETE' then
    new_property_id := new.property_id;

    if new_property_id is null and new.unit_id is not null then
      select units.property_id
      into new_property_id
      from public.property_units units
      where units.id = new.unit_id;
    end if;

    if new_property_id is not null
       and (
         tg_op = 'INSERT'
         or new_property_id is distinct from old_property_id
       )
    then
      perform public.pause_property_if_live_readiness_lost(
        new_property_id,
        'Listing automatically paused because its LIVE payment-account assignment does not resolve to a ready Stripe account.'
      );
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

drop trigger if exists payment_account_assignments_pause_unready
on public.payment_account_assignments;

create trigger payment_account_assignments_pause_unready
after insert or update or delete
on public.payment_account_assignments
for each row
execute function public.pause_property_on_payment_assignment_change();


-- ===========================================================================
-- 6. Close the host-onboarding -> real-property tax persistence gap.
-- ===========================================================================

create or replace function public.sync_ready_onboarding_tax_configuration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor_id uuid := (select auth.uid());
  tax_lines_text text;
  tax_lines_json jsonb := '[]'::jsonb;
  tax_fields_changed boolean := true;
begin
  if actor_id is null then
    return new;
  end if;

  if new.created_property_id is null
     or new.status <> 'READY_FOR_PROPERTY'
     or not new.authority_confirmed
     or lower(
       trim(
         coalesce(
           new.form_data ->> 'taxResponsibilityAccepted',
           'false'
         )
       )
     ) <> 'true'
  then
    return new;
  end if;

  tax_fields_changed :=
    old.created_property_id is distinct from new.created_property_id
    or old.status is distinct from new.status
    or old.authority_confirmed is distinct from new.authority_confirmed
    or (old.form_data ->> 'taxResponsibilityAccepted')
         is distinct from
       (new.form_data ->> 'taxResponsibilityAccepted')
    or (old.form_data ->> 'taxCounty')
         is distinct from
       (new.form_data ->> 'taxCounty')
    or (old.form_data ->> 'taxLocality')
         is distinct from
       (new.form_data ->> 'taxLocality')
    or (old.form_data ->> 'taxLinesJson')
         is distinct from
       (new.form_data ->> 'taxLinesJson');

  if not tax_fields_changed then
    return new;
  end if;

  if not public.can_manage_property(new.created_property_id) then
    raise exception
      'The onboarding property tax setup could not verify property access';
  end if;

  tax_lines_text :=
    nullif(trim(coalesce(new.form_data ->> 'taxLinesJson', '')), '');

  if tax_lines_text is not null then
    begin
      tax_lines_json := tax_lines_text::jsonb;
    exception
      when others then
        raise exception
          'Saved onboarding tax lines are invalid. Return to the Taxes step and save them again.';
    end;
  end if;

  if jsonb_typeof(tax_lines_json) <> 'array' then
    raise exception
      'Saved onboarding tax lines are invalid. Return to the Taxes step and save them again.';
  end if;

  perform public.host_save_property_tax_configuration_v2(
    new.created_property_id,
    nullif(trim(coalesce(new.form_data ->> 'taxCounty', '')), ''),
    nullif(trim(coalesce(new.form_data ->> 'taxLocality', '')), ''),
    tax_lines_json,
    true
  );

  return new;
end;
$function$;

revoke all on function public.sync_ready_onboarding_tax_configuration()
from public, anon, authenticated;

drop trigger if exists host_onboarding_drafts_sync_ready_tax
on public.host_onboarding_drafts;

create trigger host_onboarding_drafts_sync_ready_tax
after update of
  status,
  authority_confirmed,
  created_property_id,
  form_data
on public.host_onboarding_drafts
for each row
execute function public.sync_ready_onboarding_tax_configuration();


-- ===========================================================================
-- 7. Repair current public inventory.
-- ===========================================================================

do $pause_current_unready_inventory$
declare
  property_row record;
begin
  for property_row in
    select properties.id
    from public.properties properties
    where properties.status = 'PUBLISHED'
  loop
    perform public.pause_property_if_live_readiness_lost(
      property_row.id,
      'Production hardening paused this listing because one or more LIVE checkout prerequisites were incomplete.'
    );
  end loop;
end;
$pause_current_unready_inventory$;


-- ===========================================================================
-- 8. Refresh PostgREST schema cache.
-- ===========================================================================

notify pgrst, 'reload schema';

commit;
