create function public.guard_host_onboarding_feedback_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_status text;
begin
  select d.status::text
    into linked_status
  from public.host_onboarding_drafts d
  where d.created_property_id = new.property_id
  order by d.updated_at desc
  limit 1;

  if linked_status is not null and linked_status <> 'READY_FOR_PROPERTY' then
    raise exception 'Host onboarding feedback is available after setup is complete';
  end if;

  return new;
end;
$$;

create trigger guard_host_onboarding_feedback_completion
before insert or update of property_id
on public.host_onboarding_feedback
for each row
execute function public.guard_host_onboarding_feedback_completion();
