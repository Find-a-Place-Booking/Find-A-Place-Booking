-- Production migration already applied on 2026-10-04.
-- Optional post-onboarding host survey. Saves first, emails second.

create table public.host_onboarding_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  respondent_name text,
  respondent_email text,
  organization_name text,
  property_name text not null,
  property_slug text not null,
  survey_version text not null default 'HOST_ONBOARDING_FEEDBACK_V1',
  overall_ease smallint not null check (overall_ease between 1 and 5),
  difficulty_areas text[] not null default '{}'::text[],
  hardest_part text,
  explain_better text,
  unnecessary_part text,
  missing_feature text,
  human_help text not null check (human_help in ('NO', 'A_LITTLE', 'YES_SEVERAL')),
  human_help_details text,
  add_property_confidence smallint not null check (add_property_confidence between 1 and 5),
  one_change text,
  additional_comments text,
  context jsonb not null default '{}'::jsonb,
  needs_review boolean not null default false,
  faq_candidate boolean not null default false,
  email_status text not null default 'PENDING' check (email_status in ('PENDING','SENT','FAILED')),
  email_attempt_count integer not null default 0 check (email_attempt_count >= 0),
  email_provider_message_id text,
  email_error text,
  emailed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, submitted_by)
);

create index host_onboarding_feedback_created_idx
  on public.host_onboarding_feedback(created_at desc);

create index host_onboarding_feedback_review_idx
  on public.host_onboarding_feedback(needs_review, faq_candidate, created_at desc);

create index host_onboarding_feedback_email_retry_idx
  on public.host_onboarding_feedback(email_status, email_attempt_count, updated_at)
  where email_status in ('PENDING','FAILED');

create trigger host_onboarding_feedback_set_updated_at
before update on public.host_onboarding_feedback
for each row execute function public.set_updated_at();

alter table public.host_onboarding_feedback enable row level security;

create policy host_onboarding_feedback_select_own_or_admin
on public.host_onboarding_feedback
for select to authenticated
using (
  submitted_by = (select auth.uid())
  or public.is_active_admin()
);

grant select on public.host_onboarding_feedback to authenticated;

comment on table public.host_onboarding_feedback is
  'Optional post-onboarding survey. Feedback is persisted before internal email delivery and includes operational context to improve onboarding, FAQ and help tips.';
