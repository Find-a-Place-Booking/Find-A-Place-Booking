-- Find A Place Booking
-- Milestone 3: identity / organization / admin / audit foundation
--
-- This migration intentionally does NOT add public CRUD policies, property
-- tables, reservations, payments, calendars, email events or processor logic.
-- Those systems are added in later verified milestones.

begin;

create type public.organization_status as enum (
  'ONBOARDING',
  'ACTIVE',
  'SUSPENDED',
  'ARCHIVED'
);

create type public.organization_member_role as enum (
  'OWNER',
  'MANAGER',
  'STAFF'
);

create type public.membership_status as enum (
  'INVITED',
  'ACTIVE',
  'SUSPENDED'
);

create type public.partner_status as enum (
  'NOT_CLAIMED',
  'PARTNER_PENDING',
  'VERIFIED',
  'REJECTED'
);

create type public.commission_tier as enum (
  'STANDARD_7',
  'PARTNER_5'
);

create type public.admin_account_status as enum (
  'ACTIVE',
  'SUSPENDED'
);

create type public.admin_role as enum (
  'SUPER_ADMIN',
  'FINANCE_ADMIN',
  'OPERATIONS_ADMIN',
  'PARTNER_ADMIN',
  'SUPPORT'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  contact_email text,
  contact_phone text,
  status public.organization_status not null default 'ONBOARDING',
  partner_status public.partner_status not null default 'NOT_CLAIMED',
  commission_tier public.commission_tier not null default 'STANDARD_7',
  commission_effective_from timestamptz not null default now(),
  partner_verified_by uuid references public.profiles(id) on delete set null,
  partner_verified_at timestamptz,
  partner_verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_partner_5_requires_verification check (
    commission_tier = 'STANDARD_7' or partner_status = 'VERIFIED'
  ),
  constraint organizations_partner_verification_timestamp check (
    partner_status <> 'VERIFIED' or partner_verified_at is not null
  )
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.organization_member_role not null default 'STAFF',
  status public.membership_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, profile_id)
);

create table public.admin_users (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  status public.admin_account_status not null default 'ACTIVE',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_role_assignments (
  id uuid primary key default gen_random_uuid(),
  admin_profile_id uuid not null references public.admin_users(profile_id) on delete cascade,
  role public.admin_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (admin_profile_id, role)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index organization_members_profile_id_idx
  on public.organization_members(profile_id);

create index organizations_partner_review_idx
  on public.organizations(partner_status, commission_tier);

create index admin_role_assignments_admin_profile_id_idx
  on public.admin_role_assignments(admin_profile_id);

create index audit_logs_entity_idx
  on public.audit_logs(entity_type, entity_id, created_at desc);

create index audit_logs_actor_idx
  on public.audit_logs(actor_profile_id, created_at desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger organization_members_set_updated_at
before update on public.organization_members
for each row execute function public.set_updated_at();

create trigger admin_users_set_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs are append-only';
end;
$$;

create trigger audit_logs_prevent_update
before update on public.audit_logs
for each row execute function public.prevent_audit_log_mutation();

create trigger audit_logs_prevent_delete
before delete on public.audit_logs
for each row execute function public.prevent_audit_log_mutation();

-- Lock every foundation table behind RLS before application auth is wired.
-- Policies are intentionally added in the dedicated authentication/RLS milestone.
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_role_assignments enable row level security;
alter table public.audit_logs enable row level security;

comment on table public.organizations is
  'Host/operator organizations. Unverified partner claims remain STANDARD_7 until authorized verification.';

comment on column public.organizations.commission_tier is
  'Current organization tier only. Every future reservation must snapshot its own tier/rate at booking creation.';

comment on table public.audit_logs is
  'Append-only platform audit history for privileged and financially meaningful changes.';

commit;
