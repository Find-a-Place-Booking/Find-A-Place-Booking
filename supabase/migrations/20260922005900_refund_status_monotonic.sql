-- Keep refund completion monotonic across out-of-order Stripe webhooks.
begin;

create or replace function public.record_refund_result(
  target_refund_id uuid,
  target_provider_refund_id text,
  target_status public.refund_status,
  target_failure_message text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  refund_row public.refunds%rowtype;
  payment_row public.payments%rowtype;
  succeeded_total bigint;
  is_full boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  select refunds.* into refund_row
  from public.refunds refunds
  where refunds.id = target_refund_id
  for update;
  if not found then raise exception 'Refund not found'; end if;

  if refund_row.status = 'SUCCEEDED' and target_status <> 'SUCCEEDED' then
    return jsonb_build_object('status', 'SUCCEEDED', 'duplicate', true);
  end if;

  if refund_row.status = 'SUCCEEDED' and target_status = 'SUCCEEDED' then
    return jsonb_build_object('status', 'SUCCEEDED', 'duplicate', true);
  end if;

  update public.refunds refunds
  set
    status = target_status,
    provider_refund_id = coalesce(target_provider_refund_id, refunds.provider_refund_id),
    reason = case
      when target_status = 'FAILED' and target_failure_message is not null
        then left(coalesce(refunds.reason || ' · ', '') || target_failure_message, 500)
      else refunds.reason
    end,
    updated_at = now()
  where refunds.id = target_refund_id
  returning * into refund_row;

  select payments.* into payment_row
  from public.payments payments
  where payments.id = refund_row.payment_id
  for update;

  if target_status <> 'SUCCEEDED' then
    return jsonb_build_object('status', target_status);
  end if;

  select coalesce(sum(refunds.amount_cents), 0)
  into succeeded_total
  from public.refunds refunds
  where refunds.payment_id = payment_row.id and refunds.status = 'SUCCEEDED';

  is_full := succeeded_total >= payment_row.amount_cents;

  update public.payments payments
  set status = case when is_full then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,
      updated_at = now()
  where payments.id = payment_row.id;

  update public.reservations reservations
  set
    payment_status = case when is_full then 'REFUNDED' else 'PARTIALLY_REFUNDED' end,
    status = case when is_full then 'CANCELLED' else reservations.status end,
    cancelled_at = case when is_full then coalesce(reservations.cancelled_at, now()) else reservations.cancelled_at end,
    updated_at = now()
  where reservations.id = refund_row.reservation_id;

  if is_full then
    update public.availability_blocks blocks
    set state = 'CANCELLED', updated_at = now()
    where blocks.reservation_id = refund_row.reservation_id
      and blocks.state = 'ACTIVE'
      and blocks.block_type in ('INTERNAL_HOLD','INTERNAL_RESERVATION');

    insert into public.tax_ledger_entries (
      reservation_id,payment_id,refund_id,authority_id,tax_rule_id,entry_type,
      amount_cents,currency,tax_period_start,description,metadata
    )
    select
      collected.reservation_id,
      collected.payment_id,
      refund_row.id,
      collected.authority_id,
      collected.tax_rule_id,
      'REFUND_REVERSAL',
      -collected.amount_cents,
      collected.currency,
      date_trunc('month', now())::date,
      'Full guest refund tax reversal',
      jsonb_build_object(
        'provider_refund_id', refund_row.provider_refund_id,
        'original_tax_entry_id', collected.id
      )
    from public.tax_ledger_entries collected
    where collected.reservation_id = refund_row.reservation_id
      and collected.payment_id = refund_row.payment_id
      and collected.entry_type = 'COLLECTED'
    on conflict (refund_id, tax_rule_id)
      where entry_type = 'REFUND_REVERSAL' and refund_id is not null
      do nothing;
  end if;

  if not exists (
    select 1 from public.financial_ledger_entries ledger
    where ledger.refund_id = refund_row.id and ledger.entry_type = 'REFUND'
  ) then
    insert into public.financial_ledger_entries (
      reservation_id,payment_id,refund_id,entry_type,amount_cents,currency,description,metadata
    ) values (
      refund_row.reservation_id,
      refund_row.payment_id,
      refund_row.id,
      'REFUND',
      -refund_row.amount_cents,
      refund_row.currency,
      case when is_full then 'Full guest refund' else 'Host-funded partial guest refund' end,
      jsonb_build_object(
        'provider_refund_id', refund_row.provider_refund_id,
        'platform_fee_refund_cents', refund_row.platform_fee_refund_cents,
        'is_full_refund', is_full,
        'tax_reversed', is_full
      )
    );
  end if;

  insert into public.reservation_events (reservation_id,event_type,actor_profile_id,metadata)
  values (
    refund_row.reservation_id,
    case when is_full then 'FULL_REFUND_SUCCEEDED' else 'PARTIAL_REFUND_SUCCEEDED' end,
    null,
    jsonb_build_object(
      'refund_id', refund_row.id,
      'provider_refund_id', refund_row.provider_refund_id,
      'amount_cents', refund_row.amount_cents,
      'platform_fee_refund_cents', refund_row.platform_fee_refund_cents,
      'tax_reversed', is_full
    )
  );

  return jsonb_build_object(
    'status', 'SUCCEEDED',
    'full_refund', is_full,
    'refunded_total_cents', succeeded_total
  );
end;
$$;

create or replace function public.record_application_fee_refund_result(
  target_refund_id uuid,
  target_status text,
  target_application_fee_refund_id text default null,
  target_error text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if target_status not in (
    'NOT_REQUIRED','PENDING','SUCCEEDED','FAILED'
  ) then
    raise exception 'Invalid application fee refund status';
  end if;

  -- Webhooks and host actions may finish out of order. A completed Stripe
  -- application-fee refund must never return to PENDING or FAILED locally.
  if exists (
    select 1 from public.refunds refunds
    where refunds.id = target_refund_id
      and refunds.application_fee_refund_status = 'SUCCEEDED'
      and target_status <> 'SUCCEEDED'
    for update
  ) then
    return;
  end if;

  update public.refunds refunds
  set
    application_fee_refund_status = target_status,
    application_fee_refund_id =
      coalesce(
        target_application_fee_refund_id,
        refunds.application_fee_refund_id
      ),
    application_fee_refund_error =
      case
        when target_status = 'SUCCEEDED' then null
        else left(
          nullif(trim(coalesce(target_error, '')), ''),
          500
        )
      end,
    updated_at = now()
  where refunds.id = target_refund_id;

  if not found then
    raise exception 'Refund not found';
  end if;
end;
$$;

revoke all on function public.record_refund_result(uuid,text,public.refund_status,text) from public, anon, authenticated;
grant execute on function public.record_refund_result(uuid,text,public.refund_status,text) to service_role;
revoke all on function public.record_application_fee_refund_result(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.record_application_fee_refund_result(uuid,text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
