begin;

create or replace function public.host_publish_property(
  target_property_id uuid
)
returns table(
  property_id uuid,
  status public.property_status,
  published_at timestamptz,
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
  issues text[];
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

  if before_row.status = 'ARCHIVED' then
    raise exception 'Archived properties cannot be published';
  end if;

  if before_row.status = 'PUBLISHED' then
    select units.*
    into primary_unit
    from public.property_units units
    where units.property_id = target_property_id
      and units.is_primary
    limit 1;

    return query
    select before_row.id, before_row.status, before_row.published_at, primary_unit.slug;
    return;
  end if;

  if before_row.status not in (
    'DRAFT',
    'CHANGES_REQUESTED',
    'REJECTED',
    'APPROVED',
    'PAUSED'
  ) then
    raise exception 'This property cannot be published from its current status';
  end if;

  issues := public.property_submission_issues(target_property_id);
  if cardinality(issues) > 0 then
    raise exception
      'Property is not ready to publish: %',
      array_to_string(issues, ', ');
  end if;

  if not exists (
    select 1
    from public.payment_accounts accounts
    where accounts.organization_id = before_row.organization_id
      and accounts.provider = 'STRIPE'
      and accounts.environment = 'LIVE'
      and accounts.status = 'READY'
      and accounts.charges_enabled
      and accounts.payouts_enabled
      and accounts.provider_account_id is not null
  ) then
    raise exception
      'Connect a live Stripe account that can accept charges and payouts before publishing';
  end if;

  select units.*
  into primary_unit
  from public.property_units units
  where units.property_id = target_property_id
    and units.is_primary
  for update;

  if not found then
    raise exception 'Primary rentable unit not found';
  end if;

  update public.properties properties
  set status = 'PUBLISHED',
      submitted_at = coalesce(properties.submitted_at, now()),
      reviewed_at = coalesce(properties.reviewed_at, now()),
      approved_at = coalesce(properties.approved_at, now()),
      published_at = coalesce(properties.published_at, now()),
      published_by = actor_id,
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
    'PUBLISHED',
    before_row.status,
    after_row.status,
    'Host published a complete, payment-ready listing.'
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
    'property.publication.host_published',
    'property',
    target_property_id,
    'Host published a complete listing without a separate admin publication step.',
    to_jsonb(before_row),
    to_jsonb(after_row),
    jsonb_build_object(
      'source', 'host_property_editor',
      'unit_id', primary_unit.id,
      'slug', primary_unit.slug,
      'payment_environment', 'LIVE'
    )
  );

  return query
  select after_row.id, after_row.status, after_row.published_at, primary_unit.slug;
end;
$$;

revoke all on function public.host_publish_property(uuid)
from public, anon;
grant execute on function public.host_publish_property(uuid)
to authenticated;

update public.properties properties
set status = 'DRAFT',
    updated_at = now()
where properties.status in ('PENDING_REVIEW', 'APPROVED');

notify pgrst, 'reload schema';

commit;
