-- Find A Place Booking
-- Property-level defaults for host guest email automation fields.
-- Existing reservation-specific instructions remain the higher-priority override.

begin;

alter table public.host_guest_email_rules
  add column if not exists default_access_code text,
  add column if not exists default_arrival_notes text;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'host_guest_email_rules_default_access_code_check'
      and conrelid = 'public.host_guest_email_rules'::regclass
  ) then
    alter table public.host_guest_email_rules
      add constraint host_guest_email_rules_default_access_code_check
      check (
        default_access_code is null
        or char_length(default_access_code) <= 160
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'host_guest_email_rules_default_arrival_notes_check'
      and conrelid = 'public.host_guest_email_rules'::regclass
  ) then
    alter table public.host_guest_email_rules
      add constraint host_guest_email_rules_default_arrival_notes_check
      check (
        default_arrival_notes is null
        or char_length(default_arrival_notes) <= 5000
      );
  end if;
end
$migration$;

commit;
