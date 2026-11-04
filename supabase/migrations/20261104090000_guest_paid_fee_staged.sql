-- Find A Place Booking: staged guest-paid platform service fee.
-- LIVE remains OFF by default. TEST only is enabled, for Stripe TEST checkout validation.
-- This migration does not modify existing bookings, payments, taxes or commission rates.

create table if not exists public.fap_guest_fee_rollout (
  id boolean primary key default true check (id),
  test_enabled boolean not null default true,
  live_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.fap_guest_fee_rollout (id, test_enabled, live_enabled)
values (true, true, false)
on conflict (id) do nothing;

alter table public.fap_guest_fee_rollout enable row level security;
revoke all on public.fap_guest_fee_rollout from anon, authenticated;
-- Only the trusted service role can access and modify rollout settings.
grant select, insert, update on public.fap_guest_fee_rollout to service_role;

create or replace function public.fap_guest_fee_enabled(expected_environment public.payment_environment)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select case
    when expected_environment = 'TEST'::public.payment_environment then coalesce(test_enabled, false)
    when expected_environment = 'LIVE'::public.payment_environment then coalesce(live_enabled, false)
    else false
  end
  from public.fap_guest_fee_rollout where id = true
$$;
revoke all on function public.fap_guest_fee_enabled(public.payment_environment) from public, anon, authenticated;
grant execute on function public.fap_guest_fee_enabled(public.payment_environment) to service_role;

-- Quote the guest fee with the same lodging-only commission basis and the
-- same 5% partner / 7% standard tiers as the existing booking RPC.
create or replace function public.fap_quote_guest_checkout_estimate_v2(
  target_unit_id uuid,
  check_in_date date,
  check_out_date date,
  guest_count integer,
  pet_count integer default 0,
  selected_add_on_ids uuid[] default '{}'::uuid[],
  promotion_code text default null,
  requested_payment_environment public.payment_environment default 'TEST'::public.payment_environment
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  result jsonb;
  quote jsonb;
  fee_cents bigint := 0;
  rate_bps integer := 0;
  tier public.commission_tier;
  pre_tax bigint;
  guest_total bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  result := public.quote_guest_checkout_estimate(
    target_unit_id, check_in_date, check_out_date, guest_count,
    pet_count, coalesce(selected_add_on_ids, '{}'::uuid[]), promotion_code
  );
  quote := coalesce(result -> 'quote', '{}'::jsonb);
  pre_tax := greatest(coalesce((quote ->> 'pre_tax_total_cents')::bigint, 0), 0);
  guest_total := greatest(coalesce((result ->> 'guest_total_cents')::bigint, 0), 0);

  if public.fap_guest_fee_enabled(requested_payment_environment) then
    select organizations.commission_tier into tier
    from public.property_units units
    join public.properties properties on properties.id = units.property_id
    join public.organizations organizations on organizations.id = properties.organization_id
    where units.id = target_unit_id;

    if not found then raise exception 'Property organization not found'; end if;
    rate_bps := case when tier = 'PARTNER_5' then 500 else 700 end;
    fee_cents := round(
      greatest(coalesce((quote ->> 'commission_base_cents')::bigint, 0), 0)::numeric
      * rate_bps::numeric / 10000
    )::bigint;
  end if;

  if fee_cents > 0 then
    quote := quote || jsonb_build_object(
      'guest_service_fee_cents', fee_cents,
      'fee_payer', 'GUEST',
      'guest_service_fee_rate_bps', rate_bps,
      'pre_tax_total_cents', pre_tax + fee_cents,
      'guest_total_cents', guest_total + fee_cents,
      'fee_lines', coalesce(quote -> 'fee_lines', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
          'id', 'find-a-place-service-fee', 'type', 'SERVICE_FEE',
          'label', 'Find A Place service fee',
          'amount_cents', fee_cents
        ))
    );
  else
    quote := quote || jsonb_build_object(
      'guest_service_fee_cents', 0,
      'fee_payer', 'HOST',
      'guest_service_fee_rate_bps', 0
    );
  end if;

  return result || jsonb_build_object(
    'quote', quote,
    'guest_total_cents', guest_total + fee_cents,
    'guest_service_fee_cents', fee_cents,
    'fee_payer', case when fee_cents > 0 then 'GUEST' else 'HOST' end
  );
end;
$$;
revoke all on function public.fap_quote_guest_checkout_estimate_v2(uuid,date,date,integer,integer,uuid[],text,public.payment_environment) from public,anon,authenticated;
grant execute on function public.fap_quote_guest_checkout_estimate_v2(uuid,date,date,integer,integer,uuid[],text,public.payment_environment) to service_role;

-- Make a new hold wrapper; keep existing taxed-hold implementation untouched.
-- It uses the existing booking, availability, tax and cancellation policies.
-- The fee is added ONLY after lodging tax was calculated, so it cannot
-- accidentally increase state lodging-tax bases. Review service-fee taxability
-- in each jurisdiction BEFORE enabling LIVE.
create or replace function public.fap_create_guest_taxed_reservation_hold_v2(
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
  requested_payment_environment public.payment_environment default 'TEST'::public.payment_environment
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  result jsonb;
  quote jsonb;
  reservation_id uuid;
  fee_cents bigint := 0;
  old_total bigint;
  new_total bigint;
  new_pre_tax bigint;
  new_quote jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  result := public.create_guest_taxed_reservation_hold(
    target_unit_id, requested_check_in, requested_check_out,
    requested_guest_count, requested_pet_count, coalesce(requested_add_on_ids, '{}'::uuid[]),
    requested_promotion_code, requested_guest_name, requested_guest_email,
    requested_guest_phone, requested_payment_environment
  );
  reservation_id := (result ->> 'reservation_id')::uuid;

  if public.fap_guest_fee_enabled(requested_payment_environment) then
    -- Use the exact commission amount snapshotted by the existing hold RPC.
    -- That keeps existing 5/7% tiers and promotion rounding fully aligned.
    fee_cents := greatest(coalesce((result ->> 'platform_commission_cents')::bigint, 0), 0);
  end if;

  quote := coalesce(result -> 'quote', '{}'::jsonb);
  old_total := greatest(coalesce((result ->> 'guest_total_cents')::bigint, 0), 0);
  new_total := old_total + fee_cents;

  if fee_cents > 0 then
    new_pre_tax := greatest(coalesce((quote ->> 'pre_tax_total_cents')::bigint, 0), 0) + fee_cents;
    new_quote := quote || jsonb_build_object(
      'guest_service_fee_cents', fee_cents,
      'fee_payer', 'GUEST',
      'guest_service_fee_rate_bps', (result ->> 'commission_rate_bps')::integer,
      'pre_tax_total_cents', new_pre_tax,
      'guest_total_cents', new_total,
      'fee_lines', coalesce(quote -> 'fee_lines', '[]'::jsonb)
        || jsonb_build_array(jsonb_build_object(
          'id', 'find-a-place-service-fee', 'type', 'SERVICE_FEE',
          'label', 'Find A Place service fee',
          'amount_cents', fee_cents
        ))
    );

    update public.reservations reservations
    set pre_tax_total_cents = reservations.pre_tax_total_cents + fee_cents,
        guest_total_cents = reservations.guest_total_cents + fee_cents,
        pricing_snapshot = coalesce(reservations.pricing_snapshot,'{}'::jsonb)
          || jsonb_build_object(
            'guest_service_fee_cents', fee_cents,
            'fee_payer', 'GUEST',
            'guest_service_fee_rate_bps', (result ->> 'commission_rate_bps')::integer,
            'pre_tax_total_cents', new_pre_tax,
            'guest_total_cents', new_total,
            'fee_lines', coalesce(reservations.pricing_snapshot -> 'fee_lines', '[]'::jsonb)
              || jsonb_build_array(jsonb_build_object(
                'id', 'find-a-place-service-fee', 'type', 'SERVICE_FEE',
                'label', 'Find A Place service fee', 'amount_cents', fee_cents
              ))
          ),
        updated_at = now()
    where reservations.id = reservation_id
      and reservations.status = 'HOLD'
      and reservations.payment_status = 'NOT_STARTED';

    if not found then raise exception 'Unable to snapshot guest service fee safely'; end if;
  else
    new_quote := quote || jsonb_build_object(
      'guest_service_fee_cents', 0,
      'fee_payer', 'HOST',
      'guest_service_fee_rate_bps', 0
    );
  end if;

  return result || jsonb_build_object(
    'quote', new_quote,
    'guest_total_cents', new_total,
    'guest_service_fee_cents', fee_cents,
    'fee_payer', case when fee_cents > 0 then 'GUEST' else 'HOST' end
  );
end;
$$;
revoke all on function public.fap_create_guest_taxed_reservation_hold_v2(uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment) from public,anon,authenticated;
grant execute on function public.fap_create_guest_taxed_reservation_hold_v2(uuid,date,date,integer,integer,uuid[],text,text,text,text,public.payment_environment) to service_role;
