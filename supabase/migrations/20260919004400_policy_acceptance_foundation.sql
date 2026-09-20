-- Find A Place Booking
-- Policy / terms acceptance foundation.
--
-- Adds versioned host signup agreement acceptance and reservation-scoped guest
-- policy acceptance. This migration does NOT change booking totals, Stripe
-- Connect routing, tax calculation, processor recovery, or host proceeds.

begin;

create table if not exists public.host_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agreement_version text not null,
  accepted_at timestamptz not null default now(),
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, agreement_version)
);

alter table public.host_terms_acceptances enable row level security;
revoke all on table public.host_terms_acceptances from public;
revoke all on table public.host_terms_acceptances from anon;
revoke all on table public.host_terms_acceptances from authenticated;
grant select, insert, update, delete on table public.host_terms_acceptances to service_role;

comment on table public.host_terms_acceptances is
  'Append-style audit record of the host agreement version accepted during host signup.';

create table if not exists public.reservation_policy_acceptances (
  reservation_id uuid primary key references public.reservations(id) on delete cascade,
  platform_terms_version text not null,
  cancellation_policy_version text not null,
  property_policy_document_id uuid references public.property_policy_documents(id) on delete set null,
  property_policy_document_version integer,
  property_policy_opened_at timestamptz,
  platform_terms_opened_at timestamptz,
  accepted_at timestamptz,
  accepted_guest_email text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_policy_document_version_check
    check (property_policy_document_version is null or property_policy_document_version >= 1),
  constraint reservation_policy_acceptance_time_check
    check (
      accepted_at is null
      or (
        property_policy_opened_at is not null
        and platform_terms_opened_at is not null
        and accepted_at >= property_policy_opened_at
        and accepted_at >= platform_terms_opened_at
      )
    )
);

create index if not exists reservation_policy_acceptances_accepted_idx
  on public.reservation_policy_acceptances(accepted_at)
  where accepted_at is not null;

alter table public.reservation_policy_acceptances enable row level security;
revoke all on table public.reservation_policy_acceptances from public;
revoke all on table public.reservation_policy_acceptances from anon;
revoke all on table public.reservation_policy_acceptances from authenticated;
grant select, insert, update, delete on table public.reservation_policy_acceptances to service_role;

comment on table public.reservation_policy_acceptances is
  'Server-only record that the guest opened the reservation-snapshotted property policies and current Find A Place terms before accepting them.';

commit;
