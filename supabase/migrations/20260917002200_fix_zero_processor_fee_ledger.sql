-- Find A Place Booking
-- Hotfix: do not insert a zero-value PROCESSOR_FEE ledger entry.
--
-- Current failure:
--   financial_ledger_entries_amount_cents_check
--
-- The ledger intentionally enforces amount_cents <> 0. In Stripe sandbox,
-- processor_fee_actual_cents can legitimately resolve to 0, so the confirmation
-- transaction must omit the PROCESSOR_FEE row instead of inserting amount 0.
--
-- Safe to apply after the prior sandbox guest-booking hotfixes.
-- This does NOT create or repeat a Stripe charge.

begin;

create or replace function public.confirm_sandbox_reservation_payment(
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
  processor_host_share bigint;
  processor_platform_share bigint;
  processor_variance bigint;
begin
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

  if payment_row.provider <> 'STRIPE' then
    raise exception 'Sandbox confirmation expects Stripe';
  end if;

  if reservation_row.status = 'CONFIRMED'
     and reservation_row.payment_status = 'SUCCEEDED'
     and payment_row.status = 'SUCCEEDED' then
    return jsonb_build_object(
      'status', 'CONFIRMED',
      'confirmation_code', reservation_row.confirmation_code
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended(reservation_row.unit_id::text, 0));

  host_proceeds := greatest(payment_row.amount_cents - payment_row.application_fee_cents, 0);
  processor_host_share :=
    greatest(payment_row.application_fee_cents - reservation_row.platform_commission_cents, 0);
  processor_platform_share :=
    greatest(coalesce(target_processor_fee_actual_cents, 0) - processor_host_share, 0);
  processor_variance :=
    coalesce(target_processor_fee_actual_cents, 0) - processor_host_share;

  update public.payments payments
  set
    status = 'SUCCEEDED',
    provider_payment_id = coalesce(target_provider_payment_id, payments.provider_payment_id),
    provider_charge_id = coalesce(target_provider_charge_id, payments.provider_charge_id),
    processor_fee_actual_cents = greatest(coalesce(target_processor_fee_actual_cents, 0), 0),
    processor_fee_host_share_cents = processor_host_share,
    processor_fee_platform_share_cents = processor_platform_share,
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
    label = 'Find A Place sandbox reservation',
    metadata = blocks.metadata || jsonb_build_object('payment_id', target_payment_id),
    updated_at = now()
  where blocks.reservation_id = target_reservation_id
    and blocks.state = 'ACTIVE'
    and blocks.block_type = 'INTERNAL_HOLD';

  update public.promotion_reservations promo_reservations
  set status = 'CONSUMED', consumed_at = now()
  where promo_reservations.reservation_id = target_reservation_id
    and promo_reservations.status = 'RESERVED'
  returning promo_reservations.promotion_code_id
  into consumed_promotion_code_id;

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
      reservation_id, payment_id, entry_group_id, entry_type,
      amount_cents, currency, description, metadata
    ) values
      (
        target_reservation_id, target_payment_id, ledger_group, 'GUEST_CHARGE',
        payment_row.amount_cents, reservation_row.currency,
        'Sandbox guest charge',
        jsonb_build_object('sandbox_only', true)
      ),
      (
        target_reservation_id, target_payment_id, ledger_group, 'HOST_PROCEEDS',
        -host_proceeds, reservation_row.currency,
        'Sandbox host proceeds routed by Stripe',
        jsonb_build_object('sandbox_only', true)
      ),
      (
        target_reservation_id, target_payment_id, ledger_group, 'PLATFORM_COMMISSION',
        -reservation_row.platform_commission_cents, reservation_row.currency,
        'Find A Place commission allocation',
        jsonb_build_object('sandbox_only', true)
      );

    -- A zero processor fee is valid in some sandbox/test cases. The ledger
    -- deliberately forbids zero-value entries, so only append PROCESSOR_FEE
    -- when Stripe reports a positive actual fee.
    if greatest(coalesce(target_processor_fee_actual_cents, 0), 0) > 0 then
      insert into public.financial_ledger_entries (
        reservation_id, payment_id, entry_group_id, entry_type,
        amount_cents, currency, description, metadata
      ) values (
        target_reservation_id, target_payment_id, ledger_group, 'PROCESSOR_FEE',
        -greatest(coalesce(target_processor_fee_actual_cents, 0), 0),
        reservation_row.currency,
        'Stripe processor fee',
        jsonb_build_object(
          'sandbox_only', true,
          'host_share_cents', processor_host_share,
          'platform_share_cents', processor_platform_share
        )
      );
    end if;

    if processor_variance <> 0 then
      insert into public.financial_ledger_entries (
        reservation_id, payment_id, entry_group_id, entry_type,
        amount_cents, currency, description, metadata
      ) values (
        target_reservation_id, target_payment_id, ledger_group, 'ADJUSTMENT',
        processor_variance, reservation_row.currency,
        'Sandbox processor-fee estimate variance',
        jsonb_build_object('sandbox_only', true)
      );
    end if;
  end if;

  insert into public.reservation_events (
    reservation_id, event_type, actor_profile_id, metadata
  ) values (
    target_reservation_id, 'PAYMENT_SUCCEEDED', null,
    jsonb_build_object(
      'provider', 'STRIPE',
      'payment_id', target_payment_id,
      'provider_payment_id', target_provider_payment_id,
      'provider_charge_id', target_provider_charge_id,
      'processor_fee_actual_cents', target_processor_fee_actual_cents,
      'sandbox_only', true
    )
  );

  return jsonb_build_object(
    'status', 'CONFIRMED',
    'confirmation_code', reservation_row.confirmation_code,
    'host_proceeds_cents', host_proceeds,
    'platform_commission_cents', reservation_row.platform_commission_cents,
    'processor_fee_actual_cents', target_processor_fee_actual_cents
  );
end;
$$;

comment on function public.confirm_sandbox_reservation_payment(
  uuid,uuid,text,text,bigint
) is
  'Service-role-only idempotent sandbox payment confirmation. Zero processor fees are omitted from the append-only ledger.';

commit;
