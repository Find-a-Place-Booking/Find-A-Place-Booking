-- Find A Place Booking
-- Public host display name used on listings and guest trip pages.

begin;

alter table public.organizations
  add column if not exists public_host_name text;

comment on column public.organizations.public_host_name is
  'Optional guest-facing host/business display name. Keeps the public host identity separate from the internal organization name.';

notify pgrst, 'reload schema';

commit;
