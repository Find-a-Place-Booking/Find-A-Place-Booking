-- Prevent an expired/released hold from confirming over a later booking.
begin;

create or replace function public.confirm_reservation_payment(
  target_reservation_id uuid,
  target_payment_id uuid,
  target_provider_payment_id text,
  target_provider_charge_id text,
  target_processor_fee_actual_cents bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  reservation_row public.reservations%rowtype;
  payment_row public.payments%rowtype;
  consumed_promotion_code_id uuid;
  ledger_group uuid := gen_random_uuid();
  host_proceeds bigint;
  platform_tax bigint;
  processor_fee bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select reservations.* into reservation_row
  from public.reservations reservations
  where reservations.id = target_reservation_id
  for update;
  if not found then raise exception 'Reservation not found'; end if;

  select payments.* into payment_row
  from public.payments payments
  where payments.id = target_payment_id
    and payments.reservation_id = target_reservation_id
  for update;
  if not found then raise exception 'Payment not found'; end if;

  if reservation_row.status = 'CONFIRMED'
     and reservation_row.payment_status = 'SUCCEEDED'
     and payment_row.status = 'SUCCEEDED' then
    return jsonb_build_object(
      'status', 'CONFIRMED',
      'confirmation_code', reservation_row.confirmation_code
    );
  end if;

  if reservation_row.status not in ('HOLD','PAYMENT_PENDING','PAYMENT_FAILED') then
    raise exception 'Reservation is no longer confirmable';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(reservation_row.unit_id::text, 0));

  -- A payment can complete after its hold was released by another checkout.
  -- Fail closed and leave the Stripe charge visible for reconciliation rather
  -- than confirming two bookings for the same nights.
  if not exists (
    select 1 from public.availability_blocks blocks
    where blocks.reservation_id = target_reservation_id
      and blocks.unit_id = reservation_row.unit_id
      and blocks.state = 'ACTIVE'
      and blocks.block_type = 'INTERNAL_HOLD'
      and blocks.expires_at > now()
      and blocks.start_date = reservation_row.check_in
      and blocks.end_date = reservation_row.check_out
  ) then
    raise exception 'Paid reservation has no active matching calendar hold; manual payment reconciliation required';
  end if;

  if exists (
    select 1 from public.availability_blocks blocks
    where blocks.unit_id = reservation_row.unit_id
      and blocks.state = 'ACTIVE'
      and blocks.reservation_id is distinct from target_reservation_id
      and (blocks.expires_at is null or blocks.expires_at > now())
      and blocks.start_date < reservation_row.check_out
      and blocks.end_date > reservation_row.check_in
  ) then
    raise exception 'Paid reservation overlaps an existing calendar block; manual payment reconciliation required';
  end if;

  platform_tax := greatest(coalesce(payment_row.platform_tax_retained_cents, 0), 0);
  processor_fee := greatest(coalesce(target_processor_fee_actual_cents, 0), 0);
  host_proceeds := greatest(
    payment_row.amount_cents - payment_row.application_fee_cents - processor_fee,
    0
  );

  update public.payments payments
  set
    status = 'SUCCEEDED',
    provider_payment_id = coalesce(target_provider_payment_id, payments.provider_payment_id),
    provider_charge_id = coalesce(target_provider_charge_id, payments.provider_charge_id),
    processor_fee_actual_cents = processor_fee,
    processor_fee_host_share_cents = processor_fee,
    processor_fee_platform_share_cents = 0,
    host_proceeds_cents = host_proceeds,
    failure_code = null,
    failure_message = null,
    updated_at = now()
  where payments.id = target_payment_id;

  update public.reservations reservations
  set
    status = 'CONFIRMED',
    payment_status = 'SUCCEEDED',
    hold_expires_at = null,
    confirmed_at = coalesce(reservations.confirmed_at, now()),
    updated_at = now()
  where reservations.id = target_reservation_id;

  update public.availability_blocks blocks
  set
    block_type = 'INTERNAL_RESERVATION',
    expires_at = null,
    label = 'Find A Place reservation',
    metadata = blocks.metadata || jsonb_build_object(
      'payment_id', target_payment_id,
      'provider_payment_id', target_provider_payment_id,
      'charge_model', 'DIRECT'
    ),
    updated_at = now()
  where blocks.reservation_id = target_reservation_id
    and blocks.state = 'ACTIVE'
    and blocks.block_type = 'INTERNAL_HOLD';

  update public.promotion_reservations promo_reservations
  set status = 'CONSUMED', consumed_at = now()
  where promo_reservations.reservation_id = target_reservation_id
    and promo_reservations.status = 'RESERVED'
  returning promo_reservations.promotion_code_id into consumed_promotion_code_id;

  if consumed_promotion_code_id is not null then
    update public.promotion_codes promotions
    set redemption_count = promotions.redemption_count + 1,
        updated_at = now()
    where promotions.id = consumed_promotion_code_id;
  end if;

  if not exists (
    select 1 from public.financial_ledger_entries ledger
    where ledger.payment_id = target_payment_id
      and ledger.entry_type = 'GUEST_CHARGE'
  ) then
    insert into public.financial_ledger_entries (
      reservation_id,payment_id,entry_group_id,entry_type,amount_cents,
      currency,description,metadata
    ) values
      (
        target_reservation_id,target_payment_id,ledger_group,'GUEST_CHARGE',
        payment_row.amount_cents,reservation_row.currency,
        'Guest charge processed directly on the host Stripe account',
        jsonb_build_object(
          'provider', payment_row.provider,
          'provider_payment_id', target_provider_payment_id,
          'charge_model', 'DIRECT',
          'provider_account_ref', reservation_row.provider_account_ref
        )
      ),
      (
        target_reservation_id,target_payment_id,ledger_group,'HOST_PROCEEDS',
        -host_proceeds,reservation_row.currency,
        'Host net proceeds after application fee and Stripe processing',
        jsonb_build_object(
          'provider_account_ref', reservation_row.provider_account_ref,
          'charge_model', 'DIRECT'
        )
      ),
      (
        target_reservation_id,target_payment_id,ledger_group,'PLATFORM_COMMISSION',
        -reservation_row.platform_commission_cents,reservation_row.currency,
        'Find A Place platform commission collected as an application fee',
        jsonb_build_object('commission_rate_bps', reservation_row.commission_rate_bps)
      );

    if platform_tax > 0 then
      insert into public.financial_ledger_entries (
        reservation_id,payment_id,entry_group_id,entry_type,amount_cents,
        currency,description,metadata
      ) values (
        target_reservation_id,target_payment_id,ledger_group,'TAX',-platform_tax,
        reservation_row.currency,
        'Lodging tax retained by Find A Place for remittance',
        jsonb_build_object('tax_snapshot', reservation_row.tax_snapshot)
      );
    end if;

    if processor_fee > 0 then
      insert into public.financial_ledger_entries (
        reservation_id,payment_id,entry_group_id,entry_type,amount_cents,
        currency,description,metadata
      ) values (
        target_reservation_id,target_payment_id,ledger_group,'PROCESSOR_FEE',
        -processor_fee,reservation_row.currency,
        'Stripe processing fee charged to the connected host account',
        jsonb_build_object(
          'host_share_cents', processor_fee,
          'platform_share_cents', 0,
          'charge_model', 'DIRECT'
        )
      );
    end if;
  end if;

  if platform_tax > 0 then
    insert into public.tax_ledger_entries (
      reservation_id,payment_id,authority_id,tax_rule_id,entry_type,amount_cents,
      currency,tax_period_start,description,metadata
    )
    select
      target_reservation_id,
      target_payment_id,
      (line ->> 'authority_id')::uuid,
      (line ->> 'rule_id')::uuid,
      'COLLECTED',
      (line ->> 'tax_cents')::bigint,
      reservation_row.currency,
      date_trunc('month', now())::date,
      coalesce(line ->> 'label', 'Lodging tax collected'),
      jsonb_build_object(
        'calculation_id', reservation_row.tax_provider_calculation_id,
        'authority_code', line ->> 'authority_code',
        'rule_code', line ->> 'rule_code',
        'rate_bps', line ->> 'rate_bps',
        'taxable_base_cents', line ->> 'taxable_base_cents',
        'remittance_agency', line ->> 'remittance_agency',
        'charge_model', 'DIRECT'
      )
    from jsonb_array_elements(
      coalesce(reservation_row.tax_snapshot -> 'rules', '[]'::jsonb)
    ) as line
    where coalesce((line ->> 'tax_cents')::bigint, 0) > 0
    on conflict (reservation_id, tax_rule_id)
      where entry_type = 'COLLECTED'
      do nothing;
  end if;

  insert into public.reservation_events (
    reservation_id,event_type,actor_profile_id,metadata
  ) values (
    target_reservation_id,
    'PAYMENT_SUCCEEDED',
    null,
    jsonb_build_object(
      'provider', payment_row.provider,
      'payment_id', target_payment_id,
      'provider_payment_id', target_provider_payment_id,
      'provider_charge_id', target_provider_charge_id,
      'provider_account_ref', reservation_row.provider_account_ref,
      'charge_model', 'DIRECT',
      'application_fee_cents', payment_row.application_fee_cents,
      'platform_commission_cents', reservation_row.platform_commission_cents,
      'platform_tax_retained_cents', platform_tax,
      'processor_fee_recovery_cents', 0,
      'processor_fee_actual_cents', processor_fee,
      'processor_fee_host_share_cents', processor_fee,
      'processor_fee_platform_share_cents', 0,
      'host_proceeds_cents', host_proceeds
    )
  );

  return jsonb_build_object(
    'status', 'CONFIRMED',
    'confirmation_code', reservation_row.confirmation_code,
    'charge_model', 'DIRECT',
    'host_proceeds_cents', host_proceeds,
    'platform_commission_cents', reservation_row.platform_commission_cents,
    'platform_tax_retained_cents', platform_tax,
    'application_fee_cents', payment_row.application_fee_cents,
    'processor_fee_recovery_cents', 0,
    'processor_fee_actual_cents', processor_fee
  );
end;
$$;

revoke all on function public.confirm_reservation_payment(uuid,uuid,text,text,bigint) from public, anon, authenticated;
grant execute on function public.confirm_reservation_payment(uuid,uuid,text,text,bigint) to service_role;
notify pgrst, 'reload schema';
commit;
