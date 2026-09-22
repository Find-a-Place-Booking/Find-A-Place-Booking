-- Find A Place Booking
-- Host platform-policy acceptance.
--
-- Host authority-to-list confirmation and acceptance of Find A Place's legal
-- policies are separate concepts. This migration records exact policy versions
-- and prevents onboarding from being completed without an acceptance record.

begin;

alter table public.host_onboarding_drafts
  add column if not exists host_policy_accepted_at timestamptz,
  add column if not exists host_policy_accepted_by uuid
    references public.profiles(id) on delete set null,
  add column if not exists host_agreement_version text,
  add column if not exists cancellation_policy_version text,
  add column if not exists privacy_notice_version text;

comment on column public.host_onboarding_drafts.host_policy_accepted_at is
  'Timestamp when an authorized host owner/manager accepted the recorded Find A Place policy versions.';
comment on column public.host_onboarding_drafts.host_policy_accepted_by is
  'Profile that accepted the recorded Find A Place host policy versions.';
comment on column public.host_onboarding_drafts.host_agreement_version is
  'Exact Host Agreement version accepted by the host.';
comment on column public.host_onboarding_drafts.cancellation_policy_version is
  'Exact Find A Place Cancellation Policy version accepted by the host.';
comment on column public.host_onboarding_drafts.privacy_notice_version is
  'Exact Privacy Notice version accepted by the host.';

create or replace function public.record_host_policy_acceptance(
  target_organization_id uuid,
  accepted_host_agreement_version text,
  accepted_cancellation_policy_version text,
  accepted_privacy_notice_version text
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  draft_row public.host_onboarding_drafts%rowtype;
  accepted_at_value timestamptz := now();
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.organization_members members
    where members.organization_id = target_organization_id
      and members.profile_id = actor_id
      and members.status = 'ACTIVE'
      and members.role in ('OWNER','MANAGER')
  ) then
    raise exception 'Organization owner or manager access required';
  end if;

  if nullif(trim(coalesce(accepted_host_agreement_version, '')), '') is null
     or nullif(trim(coalesce(accepted_cancellation_policy_version, '')), '') is null
     or nullif(trim(coalesce(accepted_privacy_notice_version, '')), '') is null then
    raise exception 'All host policy versions are required';
  end if;

  if char_length(accepted_host_agreement_version) > 100
     or char_length(accepted_cancellation_policy_version) > 100
     or char_length(accepted_privacy_notice_version) > 100 then
    raise exception 'Policy version value is too long';
  end if;

  select drafts.*
  into draft_row
  from public.host_onboarding_drafts drafts
  where drafts.organization_id = target_organization_id
  for update;

  if not found then
    raise exception 'Host onboarding record not found';
  end if;

  if draft_row.host_policy_accepted_at is not null
     and draft_row.host_agreement_version = accepted_host_agreement_version
     and draft_row.cancellation_policy_version = accepted_cancellation_policy_version
     and draft_row.privacy_notice_version = accepted_privacy_notice_version then
    return draft_row.host_policy_accepted_at;
  end if;

  update public.host_onboarding_drafts drafts
  set
    host_policy_accepted_at = accepted_at_value,
    host_policy_accepted_by = actor_id,
    host_agreement_version = accepted_host_agreement_version,
    cancellation_policy_version = accepted_cancellation_policy_version,
    privacy_notice_version = accepted_privacy_notice_version,
    updated_at = now()
  where drafts.organization_id = target_organization_id;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    actor_id,
    'host_policy.accepted',
    'organization',
    target_organization_id,
    'Host accepted the current Find A Place platform policies.',
    jsonb_build_object(
      'host_agreement_version', accepted_host_agreement_version,
      'cancellation_policy_version', accepted_cancellation_policy_version,
      'privacy_notice_version', accepted_privacy_notice_version,
      'accepted_at', accepted_at_value
    )
  );

  return accepted_at_value;
end;
$$;

revoke all on function public.record_host_policy_acceptance(
  uuid,text,text,text
) from public, anon;
grant execute on function public.record_host_policy_acceptance(
  uuid,text,text,text
) to authenticated;

create or replace function public.enforce_host_policy_acceptance_on_ready()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'READY_FOR_PROPERTY'
     and (
       new.host_policy_accepted_at is null
       or new.host_policy_accepted_by is null
       or nullif(trim(coalesce(new.host_agreement_version, '')), '') is null
       or nullif(trim(coalesce(new.cancellation_policy_version, '')), '') is null
       or nullif(trim(coalesce(new.privacy_notice_version, '')), '') is null
     ) then
    raise exception
      'Current host policy acceptance is required before host setup can be completed';
  end if;

  return new;
end;
$$;

drop trigger if exists host_onboarding_require_policy_acceptance
  on public.host_onboarding_drafts;

create trigger host_onboarding_require_policy_acceptance
before insert or update of status,
  host_policy_accepted_at,
  host_policy_accepted_by,
  host_agreement_version,
  cancellation_policy_version,
  privacy_notice_version
on public.host_onboarding_drafts
for each row
execute function public.enforce_host_policy_acceptance_on_ready();

create or replace function public.host_policy_acceptance_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select 'host-policy-acceptance-062-v1'::text;
$$;

revoke all on function public.host_policy_acceptance_version() from public;
grant execute on function public.host_policy_acceptance_version()
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
