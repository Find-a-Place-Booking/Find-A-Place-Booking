begin;

drop policy if exists reservation_reviews_update_manager_or_admin
on public.reservation_reviews;

create policy reservation_reviews_update_admin_only
on public.reservation_reviews
for update
to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

create or replace function public.host_respond_to_review(
  target_review_id uuid,
  response_text text
)
returns table(
  review_id uuid,
  property_id uuid,
  response text,
  responded_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  review_row public.reservation_reviews%rowtype;
  cleaned_response text := nullif(trim(coalesce(response_text, '')), '');
  response_time timestamptz := now();
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select reviews.*
  into review_row
  from public.reservation_reviews reviews
  where reviews.id = target_review_id
  for update;

  if not found then
    raise exception 'Review not found';
  end if;

  if not public.can_manage_property(review_row.property_id) then
    raise exception 'Property owner or manager access required';
  end if;

  if cleaned_response is null then
    raise exception 'Write a response before saving';
  end if;

  if char_length(cleaned_response) > 4000 then
    raise exception 'Host response must be 4000 characters or fewer';
  end if;

  update public.reservation_reviews reviews
  set host_response = cleaned_response,
      host_response_by = actor_id,
      host_responded_at = response_time,
      updated_at = response_time
  where reviews.id = target_review_id;

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    metadata
  ) values (
    actor_id,
    'review.host_response.saved',
    'reservation_review',
    target_review_id,
    'Host responded to a verified guest review.',
    jsonb_build_object(
      'property_id', review_row.property_id,
      'reservation_id', review_row.reservation_id
    )
  );

  return query
  select
    target_review_id,
    review_row.property_id,
    cleaned_response,
    response_time;
end;
$$;

revoke all on function public.host_respond_to_review(uuid,text)
from public, anon;

grant execute on function public.host_respond_to_review(uuid,text)
to authenticated;

notify pgrst, 'reload schema';

commit;
