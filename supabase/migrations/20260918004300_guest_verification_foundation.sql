-- Find A Place Booking
-- Guest verification foundation.
--
-- Adds reservation-scoped email verification and Stripe Identity status.
-- This migration does NOT change booking totals, application-fee math,
-- host proceeds, tax calculation, Stripe Connect routing, or payment capture.

begin;

alter table public.reservations
  add column if not exists guest_email_verified_at timestamptz,
  add column if not exists stripe_identity_verification_session_id text,
  add column if not exists identity_verification_status text not null default 'NOT_STARTED',
  add column if not exists identity_verified_at timestamptz,
  add column if not exists identity_verification_attempt_count integer not null default 0,
  add column if not exists identity_verification_platform_cost_cents bigint not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_identity_verification_status_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_identity_verification_status_check
      check (
        identity_verification_status in (
          'NOT_STARTED',
          'REQUIRES_INPUT',
          'PROCESSING',
          'VERIFIED',
          'CANCELED'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_identity_verification_attempt_count_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_identity_verification_attempt_count_check
      check (identity_verification_attempt_count >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservations_identity_verification_cost_check'
      and conrelid = 'public.reservations'::regclass
  ) then
    alter table public.reservations
      add constraint reservations_identity_verification_cost_check
      check (identity_verification_platform_cost_cents >= 0);
  end if;
end
$$;

create unique index if not exists reservations_identity_session_unique_idx
  on public.reservations(stripe_identity_verification_session_id)
  where stripe_identity_verification_session_id is not null;

create index if not exists reservations_guest_verification_idx
  on public.reservations(
    payment_status,
    guest_email_verified_at,
    identity_verification_status
  );

create table if not exists public.guest_email_verifications (
  reservation_id uuid primary key
    references public.reservations(id) on delete cascade,
  guest_email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  verified_at timestamptz,
  attempt_count integer not null default 0,
  send_count integer not null default 1,
  window_started_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_email_verifications_attempt_count_check
    check (attempt_count >= 0),
  constraint guest_email_verifications_send_count_check
    check (send_count >= 0)
);

create index if not exists guest_email_verifications_expiry_idx
  on public.guest_email_verifications(expires_at)
  where verified_at is null;

alter table public.guest_email_verifications enable row level security;

revoke all on table public.guest_email_verifications from public;
revoke all on table public.guest_email_verifications from anon;
revoke all on table public.guest_email_verifications from authenticated;
grant select, insert, update, delete on table public.guest_email_verifications to service_role;

comment on column public.reservations.guest_email_verified_at is
  'Timestamp when the reservation email address completed Find A Place email-code verification.';
comment on column public.reservations.stripe_identity_verification_session_id is
  'Stripe Identity VerificationSession reference. Find A Place stores the reference/status only, not identity-document images.';
comment on column public.reservations.identity_verification_status is
  'Reservation-scoped Stripe Identity state used to gate checkout payment creation.';
comment on column public.reservations.identity_verified_at is
  'Timestamp when Stripe Identity reported the reservation guest as verified.';
comment on column public.reservations.identity_verification_attempt_count is
  'Number of Stripe Identity sessions created for this reservation; used for safe idempotency across retries.';
comment on column public.reservations.identity_verification_platform_cost_cents is
  'Platform-side Identity verification expense. It is not charged to the guest or deducted from host proceeds.';
comment on table public.guest_email_verifications is
  'Server-only, reservation-scoped email OTP state. Codes are stored only as HMAC hashes.';

commit;
