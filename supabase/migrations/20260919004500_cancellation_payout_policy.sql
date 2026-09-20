-- Find A Place Booking
-- Cancellation cutoff + host payout scheduling foundation.
--
-- Policy:
-- - Ordinary guest cancellation is allowed only BEFORE 14 calendar days prior
--   to check-in. At 14 days before check-in and later, the normal cancellation
--   window is closed.
-- - Host payout becomes eligible 13 calendar days before check-in.
-- - Stripe connected-account payouts are tracked separately from the booking
--   charge/transfer. This migration does not alter booking totals, commission,
--   tax, application-fee, processor-fee, or destination-charge calculations.

begin;

create table if not exists public.reservation_payouts (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  payment_id uuid not null unique references public.payments(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  confirmation_code text not null,
  connected_account_id text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'USD' check (char_length(currency) = 3),
  cancellation_cutoff_date date not null,
  payout_eligible_date date not null,
  status text not null default 'SCHEDULED' check (status in (
    'SCHEDULED',
    'WAITING_FUNDS',
    'WAITING_REFUND',
    'RETRY',
    'PENDING',
    'IN_TRANSIT',
    'PAID',
    'FAILED',
    'CANCELLED'
  )),
  provider_payout_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  initiated_at timestamptz,
  estimated_arrival_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists reservation_payouts_provider_payout_unique
  on public.reservation_payouts(provider_payout_id)
  where provider_payout_id is not null;

create index if not exists reservation_payouts_due_idx
  on public.reservation_payouts(status, payout_eligible_date, updated_at);

create index if not exists reservation_payouts_org_idx
  on public.reservation_payouts(organization_id, payout_eligible_date desc);

create or replace function public.set_reservation_payout_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists reservation_payouts_set_updated_at on public.reservation_payouts;
create trigger reservation_payouts_set_updated_at
before update on public.reservation_payouts
for each row execute function public.set_reservation_payout_updated_at();

alter table public.reservation_payouts enable row level security;

drop policy if exists reservation_payouts_select_manager_or_admin
  on public.reservation_payouts;
create policy reservation_payouts_select_manager_or_admin
on public.reservation_payouts
for select to authenticated
using (
  public.is_active_admin()
  or public.can_manage_organization(organization_id)
);

-- Create/update the payout schedule record only after Stripe payment has
-- succeeded and canonical host proceeds are known. This is accounting only;
-- it does not initiate a bank payout.
create or replace function public.sync_reservation_payout_from_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation_row record;
  successful_refund_cents bigint := 0;
  adjusted_proceeds bigint := 0;
begin
  if new.status::text <> 'SUCCEEDED'
     or new.host_proceeds_cents is null
     or new.host_proceeds_cents < 0 then
    return new;
  end if;

  select
    reservations.id,
    reservations.organization_id,
    reservations.property_id,
    reservations.confirmation_code,
    reservations.check_in,
    reservations.provider_account_ref
  into reservation_row
  from public.reservations reservations
  where reservations.id = new.reservation_id;

  if not found or nullif(trim(coalesce(reservation_row.provider_account_ref, '')), '') is null then
    return new;
  end if;

  select coalesce(sum(refunds.amount_cents), 0)::bigint
  into successful_refund_cents
  from public.refunds refunds
  where refunds.reservation_id = new.reservation_id
    and refunds.status::text = 'SUCCEEDED';

  adjusted_proceeds := greatest(0, new.host_proceeds_cents - successful_refund_cents);

  insert into public.reservation_payouts (
    reservation_id,
    payment_id,
    organization_id,
    property_id,
    confirmation_code,
    connected_account_id,
    amount_cents,
    currency,
    cancellation_cutoff_date,
    payout_eligible_date,
    status,
    metadata
  ) values (
    reservation_row.id,
    new.id,
    reservation_row.organization_id,
    reservation_row.property_id,
    reservation_row.confirmation_code,
    reservation_row.provider_account_ref,
    adjusted_proceeds,
    upper(coalesce(new.currency, 'USD')),
    reservation_row.check_in - 14,
    reservation_row.check_in - 13,
    case when adjusted_proceeds = 0 and successful_refund_cents > 0 then 'CANCELLED' else 'SCHEDULED' end,
    jsonb_build_object(
      'source', 'payment_succeeded',
      'policy', 'CHECKIN_MINUS_13_DAYS'
    )
  )
  on conflict (reservation_id) do update
    set payment_id = excluded.payment_id,
        organization_id = excluded.organization_id,
        property_id = excluded.property_id,
        confirmation_code = excluded.confirmation_code,
        connected_account_id = excluded.connected_account_id,
        currency = excluded.currency,
        cancellation_cutoff_date = excluded.cancellation_cutoff_date,
        payout_eligible_date = excluded.payout_eligible_date,
        amount_cents = case
          when public.reservation_payouts.status in (
            'SCHEDULED','WAITING_FUNDS','WAITING_REFUND','RETRY'
          ) then excluded.amount_cents
          else public.reservation_payouts.amount_cents
        end,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists payments_sync_reservation_payout on public.payments;
create trigger payments_sync_reservation_payout
after insert or update of status, host_proceeds_cents on public.payments
for each row execute function public.sync_reservation_payout_from_payment();

-- A successful refund must reduce/cancel any not-yet-initiated scheduled payout.
-- Full refunds cancel the payout. Partial refunds reduce the amount scheduled
-- for the host because partial refunds are host-funded in the current model.
create or replace function public.sync_reservation_payout_from_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row record;
  payout_row public.reservation_payouts%rowtype;
  successful_refund_cents bigint := 0;
  adjusted_proceeds bigint := 0;
begin
  if new.status::text <> 'SUCCEEDED' then
    return new;
  end if;

  select payments.id, payments.amount_cents, payments.host_proceeds_cents
  into payment_row
  from public.payments payments
  where payments.id = new.payment_id;

  if not found or payment_row.host_proceeds_cents is null then
    return new;
  end if;

  select payouts.*
  into payout_row
  from public.reservation_payouts payouts
  where payouts.reservation_id = new.reservation_id
  for update;

  if not found then
    return new;
  end if;

  if payout_row.status in ('PENDING','IN_TRANSIT','PAID') then
    -- Bank payout reconciliation is handled outside this trigger. Do not
    -- silently rewrite an already-created Stripe payout.
    return new;
  end if;

  select coalesce(sum(refunds.amount_cents), 0)::bigint
  into successful_refund_cents
  from public.refunds refunds
  where refunds.reservation_id = new.reservation_id
    and refunds.status::text = 'SUCCEEDED';

  adjusted_proceeds := greatest(
    0,
    payment_row.host_proceeds_cents - successful_refund_cents
  );

  update public.reservation_payouts payouts
  set amount_cents = adjusted_proceeds,
      status = case
        when adjusted_proceeds = 0 then 'CANCELLED'
        else 'SCHEDULED'
      end,
      last_error = null,
      metadata = coalesce(payouts.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'last_refund_adjustment_id', new.id,
          'successful_refund_cents', successful_refund_cents,
          'last_refund_adjustment_at', now()
        )
  where payouts.id = payout_row.id;

  return new;
end;
$$;

drop trigger if exists refunds_sync_reservation_payout on public.refunds;
create trigger refunds_sync_reservation_payout
after insert or update of status on public.refunds
for each row execute function public.sync_reservation_payout_from_refund();

-- Backfill already-confirmed successful payments so test/early bookings show
-- the same payout policy without touching the booking/payment calculation.
insert into public.reservation_payouts (
  reservation_id,
  payment_id,
  organization_id,
  property_id,
  confirmation_code,
  connected_account_id,
  amount_cents,
  currency,
  cancellation_cutoff_date,
  payout_eligible_date,
  status,
  metadata
)
select
  reservations.id,
  payments.id,
  reservations.organization_id,
  reservations.property_id,
  reservations.confirmation_code,
  reservations.provider_account_ref,
  greatest(
    0,
    payments.host_proceeds_cents - coalesce((
      select sum(refunds.amount_cents)
      from public.refunds refunds
      where refunds.reservation_id = reservations.id
        and refunds.status::text = 'SUCCEEDED'
    ), 0)
  ),
  upper(coalesce(payments.currency, 'USD')),
  reservations.check_in - 14,
  reservations.check_in - 13,
  case
    when greatest(
      0,
      payments.host_proceeds_cents - coalesce((
        select sum(refunds.amount_cents)
        from public.refunds refunds
        where refunds.reservation_id = reservations.id
          and refunds.status::text = 'SUCCEEDED'
      ), 0)
    ) = 0 then 'CANCELLED'
    else 'SCHEDULED'
  end,
  jsonb_build_object('source', 'migration_backfill')
from public.reservations reservations
join public.payments payments
  on payments.reservation_id = reservations.id
where reservations.status::text = 'CONFIRMED'
  and payments.status::text = 'SUCCEEDED'
  and payments.host_proceeds_cents is not null
  and payments.host_proceeds_cents >= 0
  and nullif(trim(coalesce(reservations.provider_account_ref, '')), '') is not null
on conflict (reservation_id) do nothing;

comment on table public.reservation_payouts is
  'Tracks Find A Place host bank-payout timing separately from the destination charge. Normal eligibility is 13 calendar days before check-in; ordinary guest cancellation closes at 14 calendar days before check-in.';
comment on column public.reservation_payouts.cancellation_cutoff_date is
  'On this date and later, ordinary guest self-service cancellation is closed.';
comment on column public.reservation_payouts.payout_eligible_date is
  'First date the reservation may be paid from the connected Stripe balance to the host bank account.';

commit;
