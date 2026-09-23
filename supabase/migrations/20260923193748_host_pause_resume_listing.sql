begin;

create or replace function public.host_pause_property(
  target_property_id uuid
)
returns table(
  property_id uuid,
  status public.property_status,
  slug text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.properties%rowtype;
  after_row public.properties%rowtype;
  primary_unit public.property_units%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_property(target_property_id) then
    raise exception 'Property owner or manager access required';
  end if;

  select properties.*
  into before_row
  from public.properties properties
  where properties.id = target_property_id
  for update;

  if not found then
    raise exception 'Property not found';
  end if;

  select units.*
  into primary_unit
  from public.property_units units
  where units.property_id = target_property_id
    and units.is_primary
  limit 1;

  if primary_unit.id is null then
    raise exception 'Primary rentable unit not found';
  end if;

  if before_row.status = 'PAUSED' then
    return query
    select before_row.id, before_row.status, primary_unit.slug;
    return;
  end if;

  if before_row.status <> 'PUBLISHED' then
    raise exception 'Only a published property can be disabled';
  end if;

  update public.properties properties
  set status = 'PAUSED',
      updated_at = now()
  where properties.id = target_property_id
  returning * into after_row;

  insert into public.property_review_events (
    property_id,
    actor_profile_id,
    event_type,
    from_status,
    to_status,
    note
  ) values (
    target_property_id,
    actor_id,
    'PAUSED',
    before_row.status,
    after_row.status,
    'Host disabled this listing from the public marketplace.'
  );

  insert into public.audit_logs (
    actor_profile_id,
    action,
    entity_type,
    entity_id,
    reason,
    before_state,
    after_state,
    metadata
  ) values (
    actor_id,
    'property.publication.host_paused',
    'property',
    target_property_id,
    'Host disabled this listing from public marketplace visibility.',
    to_jsonb(before_row),
    to_jsonb(after_row),
    jsonb_build_object(
      'source', 'host_properties',
      'unit_id', primary_unit.id,
      'slug', primary_unit.slug,
      'existing_reservations_preserved', true
    )
  );

  return query
  select after_row.id, after_row.status, primary_unit.slug;
end;
$$;

revoke all on function public.host_pause_property(uuid)
from public, anon;

grant execute on function public.host_pause_property(uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;
