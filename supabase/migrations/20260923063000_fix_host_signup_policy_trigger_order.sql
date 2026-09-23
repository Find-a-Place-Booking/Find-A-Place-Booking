drop trigger if exists host_onboarding_seed_signup_policy_acceptance
  on public.host_onboarding_drafts;

drop trigger if exists aa_host_onboarding_seed_signup_policy_acceptance
  on public.host_onboarding_drafts;

create trigger aa_host_onboarding_seed_signup_policy_acceptance
before insert on public.host_onboarding_drafts
for each row
execute function public.seed_host_policy_acceptance_from_signup();
