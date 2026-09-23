alter table public.host_terms_acceptances
  add column if not exists platform_terms_version text,
  add column if not exists cancellation_policy_version text,
  add column if not exists privacy_notice_version text,
  add column if not exists review_evidence jsonb not null default '{}'::jsonb;

comment on column public.host_terms_acceptances.platform_terms_version is
  'Version of the Find A Place platform Terms of Service accepted during host signup.';
comment on column public.host_terms_acceptances.cancellation_policy_version is
  'Version of the Find A Place cancellation/refund policy accepted during host signup.';
comment on column public.host_terms_acceptances.privacy_notice_version is
  'Version of the Find A Place privacy notice accepted during host signup.';
comment on column public.host_terms_acceptances.review_evidence is
  'Host signup review evidence, including documents presented/opened and the acceptance statement.';

create or replace function public.seed_host_policy_acceptance_from_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  signup_acceptance public.host_terms_acceptances%rowtype;
begin
  if new.host_policy_accepted_at is not null then
    return new;
  end if;

  select acceptances.*
  into signup_acceptance
  from public.host_terms_acceptances acceptances
  where acceptances.user_id = new.owner_profile_id
    and nullif(trim(coalesce(acceptances.agreement_version, '')), '') is not null
    and nullif(trim(coalesce(acceptances.cancellation_policy_version, '')), '') is not null
    and nullif(trim(coalesce(acceptances.privacy_notice_version, '')), '') is not null
  order by acceptances.accepted_at desc
  limit 1;

  if found then
    new.host_policy_accepted_at := signup_acceptance.accepted_at;
    new.host_policy_accepted_by := new.owner_profile_id;
    new.host_agreement_version := signup_acceptance.agreement_version;
    new.cancellation_policy_version := signup_acceptance.cancellation_policy_version;
    new.privacy_notice_version := signup_acceptance.privacy_notice_version;
  end if;

  return new;
end;
$function$;

drop trigger if exists host_onboarding_seed_signup_policy_acceptance
  on public.host_onboarding_drafts;

create trigger host_onboarding_seed_signup_policy_acceptance
before insert on public.host_onboarding_drafts
for each row
execute function public.seed_host_policy_acceptance_from_signup();
