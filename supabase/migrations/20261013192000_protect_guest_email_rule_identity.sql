-- Applied to production 2026-10-13. Safe to apply in other environments.
-- Protects pre-arrival vs post-stay email identity without touching content or bookings.
begin;

create or replace function public.protect_host_guest_email_rule_identity()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if old.organization_id is distinct from new.organization_id
     or old.property_id is distinct from new.property_id
     or old.trigger_event is distinct from new.trigger_event then
    raise exception 'Guest email property and event cannot be changed on an existing rule.'
      using errcode = '23514';
  end if;
  return new;
end
$fn$;

drop trigger if exists host_guest_email_rules_identity_guard on public.host_guest_email_rules;
create trigger host_guest_email_rules_identity_guard
before update on public.host_guest_email_rules
for each row execute function public.protect_host_guest_email_rule_identity();

-- The live database has this constraint already. A repeat deployment should
-- not attempt to add it a second time.
do $guard$
begin
 if not exists (
   select 1 from pg_constraint
   where conname = 'host_guest_email_rules_canonical_type_check'
   and conrelid = 'public.host_guest_email_rules'::regclass
 ) then
  alter table public.host_guest_email_rules
  add constraint host_guest_email_rules_canonical_type_check
  check (
    (name <> 'Pre-arrival instructions' or trigger_event = 'BEFORE_CHECKIN')
    and (name <> 'Post-stay thank you' or trigger_event = 'AFTER_CHECKOUT')
  );
 end if;
end $guard$;

create unique index if not exists host_guest_email_rules_canonical_slot_unique
 on public.host_guest_email_rules(property_id, trigger_event)
 where property_id is not null and name in ('Pre-arrival instructions', 'Post-stay thank you');

commit;
