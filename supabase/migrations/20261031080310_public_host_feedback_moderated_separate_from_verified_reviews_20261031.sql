-- Already applied in the production Supabase project. Include in the repository
-- for migration history only. Do not manually reapply.
create table if not exists public.public_host_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reviewer_name text not null check (char_length(btrim(reviewer_name)) between 2 and 100),
  reviewer_email text not null check (char_length(reviewer_email) between 5 and 254),
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 20 and 2000),
  experience_type text not null check (experience_type in ('STAYED','HOST_INTERACTION','OTHER')),
  status text not null default 'PENDING' check (status in ('PENDING','PUBLISHED','REJECTED')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  moderation_note text,
  constraint public_host_reviews_reviewer_email_lowercase check (reviewer_email=lower(btrim(reviewer_email)))
);
create unique index if not exists public_host_reviews_one_per_host_email
  on public.public_host_reviews(organization_id,reviewer_email);
create index if not exists public_host_reviews_by_host_public
  on public.public_host_reviews(organization_id,created_at desc)
  where status='PUBLISHED';
create index if not exists public_host_reviews_pending
  on public.public_host_reviews(created_at desc)
  where status='PENDING';
alter table public.public_host_reviews enable row level security;
revoke all on public.public_host_reviews from PUBLIC,anon,authenticated;
grant select,insert,update on public.public_host_reviews to service_role;
comment on table public.public_host_reviews is 'Moderated, unverified external reviews of host organizations; distinct from reservation-verified guest reviews. Only trusted server code may access.';
