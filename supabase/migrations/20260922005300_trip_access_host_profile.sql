-- Find A Place Booking
-- Public host profile copy used on listing/trip pages.

begin;

alter table public.organizations
  add column if not exists public_host_bio text;

comment on column public.organizations.public_host_bio is
  'Optional public host description shown on property listings and confirmed guest trip pages.';

notify pgrst, 'reload schema';

commit;
