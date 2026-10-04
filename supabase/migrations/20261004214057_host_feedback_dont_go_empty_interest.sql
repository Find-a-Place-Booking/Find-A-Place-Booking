-- Production migration already applied on 2026-10-04.
-- Adds the Don't Go Empty interest response to onboarding feedback.

alter table public.host_onboarding_feedback
  add column if not exists dont_go_empty_interest boolean;

comment on column public.host_onboarding_feedback.dont_go_empty_interest is
  'Host response to the optional Don''t Go Empty program interest question. True means interested in follow-up; false means not interested right now.';
