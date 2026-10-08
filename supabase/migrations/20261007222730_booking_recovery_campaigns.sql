-- Find A Place Booking
-- Missed-booking recovery: host opt-in settings, date-range opportunities,
-- recipient-scoped offers and recovery-email suppression.

begin;

create table if not exists public.booking_recovery_settings (
  property_id uuid primary key references public.properties(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  is_enabled boolean not null default false,
  day_one_enabled boolean not null default true,
  offer_mode text not null default 'ASK'
    check (offer_mode in ('ASK','AUTO','OFF')),
  default_discount_bps integer not null default 1000
    check (default_discount_bps between 100 and 5000),
  minimum_interest integer not null default 2
    check (minimum_interest between 1 and 50),
  offer_expiry_hours integer not null default 48
    check (offer_expiry_hours between 12 and 168),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_recovery_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid not null references public.property_units(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  interest_count integer not null default 0 check (interest_count >= 0),
  recoverable_count integer not null default 0 check (recoverable_count >= 0),
  suggested_discount_bps integer not null default 1000
    check (suggested_discount_bps between 100 and 5000),
  status text not null default 'OPEN'
    check (status in ('OPEN','SENT','DECLINED','EXPIRED')),
  first_interest_at timestamptz not null,
  last_interest_at timestamptz not null,
  opened_at timestamptz not null default now(),
  offered_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in),
  unique (unit_id, check_in, check_out)
);

create table if not exists public.booking_recovery_offer_recipients (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.booking_recovery_opportunities(id) on delete cascade,
  source_reservation_id uuid not null references public.reservations(id) on delete cascade,
  recipient_email text not null,
  promotion_code_id uuid not null references public.promotion_codes(id) on delete cascade,
  access_token uuid not null default gen_random_uuid() unique,
  discount_bps integer not null check (discount_bps between 100 and 5000),
  discount_cents bigint not null check (discount_cents > 0),
  sent_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (opportunity_id, recipient_email)
);

create table if not exists public.booking_recovery_suppressions (
  recipient_email text primary key,
  access_token uuid not null default gen_random_uuid() unique,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_recovery_settings_org_idx
  on public.booking_recovery_settings(organization_id, is_enabled);
create index if not exists booking_recovery_opportunities_property_status_idx
  on public.booking_recovery_opportunities(property_id, status, check_in);
create index if not exists booking_recovery_opportunities_org_status_idx
  on public.booking_recovery_opportunities(organization_id, status, opened_at desc);
create index if not exists booking_recovery_offer_recipients_opportunity_idx
  on public.booking_recovery_offer_recipients(opportunity_id, sent_at);
create index if not exists booking_recovery_offer_recipients_promo_idx
  on public.booking_recovery_offer_recipients(promotion_code_id, expires_at);
create index if not exists booking_recovery_offer_recipients_reservation_idx
  on public.booking_recovery_offer_recipients(source_reservation_id);

-- Reuse the project's standard updated_at trigger helper.
drop trigger if exists booking_recovery_settings_set_updated_at on public.booking_recovery_settings;
create trigger booking_recovery_settings_set_updated_at
before update on public.booking_recovery_settings
for each row execute function public.set_updated_at();

drop trigger if exists booking_recovery_opportunities_set_updated_at on public.booking_recovery_opportunities;
create trigger booking_recovery_opportunities_set_updated_at
before update on public.booking_recovery_opportunities
for each row execute function public.set_updated_at();

drop trigger if exists booking_recovery_suppressions_set_updated_at on public.booking_recovery_suppressions;
create trigger booking_recovery_suppressions_set_updated_at
before update on public.booking_recovery_suppressions
for each row execute function public.set_updated_at();

alter table public.booking_recovery_settings enable row level security;
alter table public.booking_recovery_opportunities enable row level security;
alter table public.booking_recovery_offer_recipients enable row level security;
alter table public.booking_recovery_suppressions enable row level security;

revoke all on table public.booking_recovery_settings from anon, authenticated;
revoke all on table public.booking_recovery_opportunities from anon, authenticated;
revoke all on table public.booking_recovery_offer_recipients from anon, authenticated;
revoke all on table public.booking_recovery_suppressions from anon, authenticated;

grant select, insert, update on table public.booking_recovery_settings to authenticated;
grant select on table public.booking_recovery_opportunities to authenticated;

drop policy if exists booking_recovery_settings_host_select on public.booking_recovery_settings;
create policy booking_recovery_settings_host_select
on public.booking_recovery_settings
for select to authenticated
using (public.can_access_property(property_id));

drop policy if exists booking_recovery_settings_host_insert on public.booking_recovery_settings;
create policy booking_recovery_settings_host_insert
on public.booking_recovery_settings
for insert to authenticated
with check (
  public.can_manage_property(property_id)
  and exists (
    select 1
    from public.properties p
    where p.id = booking_recovery_settings.property_id
      and p.organization_id = booking_recovery_settings.organization_id
  )
);

drop policy if exists booking_recovery_settings_host_update on public.booking_recovery_settings;
create policy booking_recovery_settings_host_update
on public.booking_recovery_settings
for update to authenticated
using (public.can_manage_property(property_id))
with check (
  public.can_manage_property(property_id)
  and exists (
    select 1
    from public.properties p
    where p.id = booking_recovery_settings.property_id
      and p.organization_id = booking_recovery_settings.organization_id
  )
);

drop policy if exists booking_recovery_opportunities_host_select on public.booking_recovery_opportunities;
create policy booking_recovery_opportunities_host_select
on public.booking_recovery_opportunities
for select to authenticated
using (public.can_access_property(property_id));

-- Service-role jobs own opportunity creation, recipient delivery and suppression
-- records. No anon/authenticated policies are intentionally provided for those
-- service-only tables.

grant select, insert, update, delete on table public.booking_recovery_settings to service_role;
grant select, insert, update, delete on table public.booking_recovery_opportunities to service_role;
grant select, insert, update, delete on table public.booking_recovery_offer_recipients to service_role;
grant select, insert, update, delete on table public.booking_recovery_suppressions to service_role;

commit;
