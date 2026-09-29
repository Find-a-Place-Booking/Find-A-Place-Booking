-- Find A Place Booking
-- Host-controlled automated reservation emails.

begin;

create table if not exists public.host_guest_email_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  property_id uuid
    references public.properties(id) on delete cascade,
  name text not null,
  trigger_event text not null,
  day_offset integer not null default 3,
  send_time_local time without time zone not null default '10:00',
  subject_template text not null,
  body_template text not null,
  require_access_code boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_guest_email_rules_name_check
    check (char_length(trim(name)) between 1 and 120),
  constraint host_guest_email_rules_trigger_check
    check (trigger_event in ('BEFORE_CHECKIN', 'AFTER_CHECKOUT')),
  constraint host_guest_email_rules_day_offset_check
    check (day_offset between 0 and 60),
  constraint host_guest_email_rules_subject_check
    check (char_length(subject_template) between 1 and 200),
  constraint host_guest_email_rules_body_check
    check (char_length(body_template) between 1 and 8000)
);

create index if not exists host_guest_email_rules_active_idx
  on public.host_guest_email_rules(organization_id, property_id, is_active);

drop trigger if exists host_guest_email_rules_set_updated_at
  on public.host_guest_email_rules;
create trigger host_guest_email_rules_set_updated_at
before update on public.host_guest_email_rules
for each row execute function public.set_updated_at();

alter table public.host_guest_email_rules enable row level security;

drop policy if exists host_guest_email_rules_select
  on public.host_guest_email_rules;
create policy host_guest_email_rules_select
on public.host_guest_email_rules
for select
to authenticated
using (public.can_manage_organization(organization_id));

drop policy if exists host_guest_email_rules_insert
  on public.host_guest_email_rules;
create policy host_guest_email_rules_insert
on public.host_guest_email_rules
for insert
to authenticated
with check (
  public.can_manage_organization(organization_id)
  and created_by = (select auth.uid())
  and (
    property_id is null
    or exists (
      select 1
      from public.properties properties
      where properties.id = property_id
        and properties.organization_id = organization_id
    )
  )
);

drop policy if exists host_guest_email_rules_update
  on public.host_guest_email_rules;
create policy host_guest_email_rules_update
on public.host_guest_email_rules
for update
to authenticated
using (public.can_manage_organization(organization_id))
with check (
  public.can_manage_organization(organization_id)
  and (
    property_id is null
    or exists (
      select 1
      from public.properties properties
      where properties.id = property_id
        and properties.organization_id = organization_id
    )
  )
);

drop policy if exists host_guest_email_rules_delete
  on public.host_guest_email_rules;
create policy host_guest_email_rules_delete
on public.host_guest_email_rules
for delete
to authenticated
using (public.can_manage_organization(organization_id));

revoke all on table public.host_guest_email_rules from anon;
grant select, insert, update, delete
  on table public.host_guest_email_rules to authenticated;
grant all on table public.host_guest_email_rules to service_role;

-- If a host edits, pauses or deletes an automation, stale failed/pending
-- deliveries from the previous rule revision must not be retried later by the
-- existing transactional-email retry cron.
create or replace function public.skip_stale_host_guest_email_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_rule_id uuid;
begin
  target_rule_id := case
    when tg_op = 'DELETE' then old.id
    else new.id
  end;

  update public.notification_deliveries deliveries
  set status = 'SKIPPED',
      last_error = 'Host guest-email automation changed before delivery.',
      updated_at = now()
  where deliveries.notification_type like
      ('HOST_AUTO:' || target_rule_id::text || ':%')
    and deliveries.status in ('PENDING', 'FAILED');

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$function$;

drop trigger if exists host_guest_email_rules_skip_stale_update
  on public.host_guest_email_rules;
create trigger host_guest_email_rules_skip_stale_update
after update on public.host_guest_email_rules
for each row execute function public.skip_stale_host_guest_email_deliveries();

drop trigger if exists host_guest_email_rules_skip_stale_delete
  on public.host_guest_email_rules;
create trigger host_guest_email_rules_skip_stale_delete
after delete on public.host_guest_email_rules
for each row execute function public.skip_stale_host_guest_email_deliveries();

-- Reservation date/status/email changes invalidate queued host automation
-- payloads that were rendered from the old reservation state.
create or replace function public.skip_stale_guest_email_on_reservation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.check_in is distinct from new.check_in
     or old.check_out is distinct from new.check_out
     or old.status is distinct from new.status
     or old.guest_email is distinct from new.guest_email then
    update public.notification_deliveries deliveries
    set status = 'SKIPPED',
        last_error = 'Reservation changed before host guest-email delivery.',
        updated_at = now()
    where deliveries.reservation_id = new.id
      and deliveries.notification_type like 'HOST_AUTO:%'
      and deliveries.status in ('PENDING', 'FAILED');
  end if;

  return new;
end;
$function$;

drop trigger if exists reservations_skip_stale_host_guest_email
  on public.reservations;
create trigger reservations_skip_stale_host_guest_email
after update of check_in, check_out, status, guest_email
on public.reservations
for each row execute function public.skip_stale_guest_email_on_reservation_change();

create table if not exists public.reservation_guest_instructions (
  reservation_id uuid primary key
    references public.reservations(id) on delete cascade,
  access_code text,
  arrival_notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservation_guest_instructions_access_code_check
    check (access_code is null or char_length(access_code) <= 160),
  constraint reservation_guest_instructions_arrival_notes_check
    check (arrival_notes is null or char_length(arrival_notes) <= 5000)
);

drop trigger if exists reservation_guest_instructions_set_updated_at
  on public.reservation_guest_instructions;
create trigger reservation_guest_instructions_set_updated_at
before update on public.reservation_guest_instructions
for each row execute function public.set_updated_at();

alter table public.reservation_guest_instructions enable row level security;

drop policy if exists reservation_guest_instructions_select
  on public.reservation_guest_instructions;
create policy reservation_guest_instructions_select
on public.reservation_guest_instructions
for select
to authenticated
using (public.can_manage_reservation(reservation_id));

drop policy if exists reservation_guest_instructions_insert
  on public.reservation_guest_instructions;
create policy reservation_guest_instructions_insert
on public.reservation_guest_instructions
for insert
to authenticated
with check (
  public.can_manage_reservation(reservation_id)
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists reservation_guest_instructions_update
  on public.reservation_guest_instructions;
create policy reservation_guest_instructions_update
on public.reservation_guest_instructions
for update
to authenticated
using (public.can_manage_reservation(reservation_id))
with check (public.can_manage_reservation(reservation_id));

drop policy if exists reservation_guest_instructions_delete
  on public.reservation_guest_instructions;
create policy reservation_guest_instructions_delete
on public.reservation_guest_instructions
for delete
to authenticated
using (public.can_manage_reservation(reservation_id));

revoke all on table public.reservation_guest_instructions from anon;
grant select, insert, update, delete
  on table public.reservation_guest_instructions to authenticated;
grant all on table public.reservation_guest_instructions to service_role;

commit;
