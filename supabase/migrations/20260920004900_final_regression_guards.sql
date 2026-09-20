-- Find A Place Booking
-- Final pre-live regression guards.
--
-- This migration deliberately does NOT rewrite Stripe charge creation,
-- destination-charge routing, commission math, tax math, processor recovery,
-- webhook payment confirmation, or payout amounts.
--
-- It closes two guest-input validation gaps and adds a schema marker used by
-- the operations health route.

begin;

-- ---------------------------------------------------------------------------
-- Make dependency/order mistakes fail loudly.
-- 047 persists exact transactional-email payloads for retry.
-- 048 adds selectable pet-fee calculation modes to the canonical quote path.
-- ---------------------------------------------------------------------------

do $verify_prior_hardening$
declare
  save_def text;
  quote_def text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_deliveries'
      and column_name = 'subject'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_deliveries'
      and column_name = 'text_body'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_deliveries'
      and column_name = 'html_body'
  ) then
    raise exception 'Migration 047 transactional email outbox must be applied before 049';
  end if;

  select pg_get_functiondef(
    'public.save_unit_base_pricing(uuid,jsonb)'::regprocedure
  ) into save_def;

  select pg_get_functiondef(
    'public.quote_unit_stay(uuid,date,date,integer,integer,uuid[],text)'::regprocedure
  ) into quote_def;

  if position('petCalculation' in save_def) = 0 then
    raise exception 'Migration 048 pet fee modes must be applied before 049';
  end if;

  if position('fee_row.amount_cents * pet_count * night_count' in quote_def) = 0 then
    raise exception 'Migration 048 pet fee quote logic is not active';
  end if;
end
$verify_prior_hardening$;

-- ---------------------------------------------------------------------------
-- Guest-selected booking options must match the published host configuration.
-- This is service-role-only and is called by the taxed guest-hold wrapper.
-- ---------------------------------------------------------------------------

create or replace function public.assert_guest_booking_options(
  target_unit_id uuid,
  requested_pet_count integer,
  requested_add_on_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pet_configuration jsonb;
  pet_policy_found boolean := false;
  max_pets_raw text;
  max_pets_value integer;
  requested_add_on_count integer := coalesce(cardinality(requested_add_on_ids), 0);
  valid_add_on_count integer := 0;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if requested_pet_count is null
     or requested_pet_count < 0
     or requested_pet_count > 100 then
    raise exception 'Pet count is invalid';
  end if;

  select policies.configuration
  into pet_configuration
  from public.unit_policies policies
  where policies.unit_id = target_unit_id
    and policies.policy_code = 'pets-allowed';

  pet_policy_found := found;

  if requested_pet_count > 0 then
    if not pet_policy_found then
      raise exception 'This stay does not allow pets';
    end if;

    max_pets_raw := nullif(trim(coalesce(pet_configuration ->> 'max_pets', '')), '');

    if max_pets_raw is not null then
      if max_pets_raw !~ '^[0-9]+$' then
        raise exception 'This stay''s pet policy needs host review before pet bookings can be accepted';
      end if;

      max_pets_value := max_pets_raw::integer;

      if max_pets_value < 1 or max_pets_value > 100 then
        raise exception 'This stay''s pet policy needs host review before pet bookings can be accepted';
      end if;

      if requested_pet_count > max_pets_value then
        raise exception 'Pet count exceeds this stay''s maximum of %', max_pets_value;
      end if;
    end if;
  end if;

  if requested_add_on_count > 50 then
    raise exception 'Too many optional add-ons were selected';
  end if;

  if requested_add_on_count > 0 then
    select count(*)::integer
    into valid_add_on_count
    from public.unit_add_ons addons
    where addons.unit_id = target_unit_id
      and addons.is_active
      and addons.guest_visible
      and addons.id = any(requested_add_on_ids);

    -- Also rejects duplicates/nulls instead of silently pricing a different set
    -- than the guest submitted.
    if valid_add_on_count <> requested_add_on_count then
      raise exception 'One or more selected add-ons are unavailable for this stay';
    end if;
  end if;
end;
$$;

revoke all on function public.assert_guest_booking_options(uuid,integer,uuid[])
from public, anon, authenticated;
grant execute on function public.assert_guest_booking_options(uuid,integer,uuid[])
to service_role;

-- Keep the canonical hold + tax flow intact. The only addition is a fail-closed
-- validation call before any reservation/hold rows are created.
create or replace function public.create_guest_taxed_reservation_hold(
  target_unit_id uuid,
  requested_check_in date,
  requested_check_out date,
  requested_guest_count integer,
  requested_pet_count integer default 0,
  requested_add_on_ids uuid[] default '{}'::uuid[],
  requested_promotion_code text default null,
  requested_guest_name text default null,
  requested_guest_email text default null,
  requested_guest_phone text default null,
  requested_payment_environment public.payment_environment default 'TEST'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hold_result jsonb;
  tax_result jsonb;
  combined_quote jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  perform public.assert_guest_booking_options(
    target_unit_id,
    requested_pet_count,
    coalesce(requested_add_on_ids, '{}'::uuid[])
  );

  hold_result := public.create_guest_reservation_hold(
    target_unit_id,
    requested_check_in,
    requested_check_out,
    requested_guest_count,
    requested_pet_count,
    requested_add_on_ids,
    requested_promotion_code,
    requested_guest_name,
    requested_guest_email,
    requested_guest_phone,
    requested_payment_environment
  );

  tax_result := public.calculate_reservation_lodging_tax(
    (hold_result ->> 'reservation_id')::uuid,
    requested_payment_environment
  );

  combined_quote := coalesce(hold_result -> 'quote', '{}'::jsonb) || jsonb_build_object(
    'taxes_calculated', true,
    'tax_total_cents', (tax_result ->> 'tax_total_cents')::bigint,
    'guest_total_cents', (tax_result ->> 'guest_total_cents')::bigint,
    'tax_lines', tax_result -> 'tax_snapshot' -> 'rules'
  );

  return hold_result || jsonb_build_object(
    'quote', combined_quote,
    'tax_status', tax_result ->> 'tax_status',
    'tax_total_cents', (tax_result ->> 'tax_total_cents')::bigint,
    'guest_total_cents', (tax_result ->> 'guest_total_cents')::bigint,
    'platform_tax_retained_cents', (tax_result ->> 'platform_tax_retained_cents')::bigint
  );
end;
$$;

revoke all on function public.create_guest_taxed_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment
) from public, anon, authenticated;
grant execute on function public.create_guest_taxed_reservation_hold(
  uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment
) to service_role;

create or replace function public.final_regression_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'final-regression-049-v1'::text;
$$;

revoke all on function public.final_regression_version() from public;
grant execute on function public.final_regression_version() to anon, authenticated;

comment on function public.assert_guest_booking_options(uuid,integer,uuid[]) is
  'Fail-closed guest option guard: enforces pet policy/max-pets and requires selected add-ons to belong to the unit, be active, and be guest-visible.';
comment on function public.final_regression_version() is
  'Schema marker for the final 2026-09-20 pre-live regression guard pass.';

notify pgrst, 'reload schema';

commit;
