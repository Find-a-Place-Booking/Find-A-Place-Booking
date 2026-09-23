begin;

alter table public.properties
  add column if not exists homepage_feature_priority smallint not null default 3;

alter table public.properties
  drop constraint if exists properties_homepage_feature_priority_check;

alter table public.properties
  add constraint properties_homepage_feature_priority_check
  check (homepage_feature_priority between 1 and 3);

comment on column public.properties.homepage_feature_priority is
  'Internal homepage featured-stay priority. 1 = founding partner, 2 = paid placement, 3 = standard/default. Lower values appear first in homepage featured inventory.';

create or replace function public.admin_set_homepage_feature_priority(
  target_property_id uuid,
  target_priority integer
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_row public.properties%rowtype;
  after_row public.properties%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_active_admin() then
    raise exception 'Admin access required';
  end if;

  if target_priority not between 1 and 3 then
    raise exception 'Homepage feature priority must be 1, 2 or 3';
  end if;

  select properties.*
  into before_row
  from public.properties properties
  where properties.id = target_property_id
  for update;

  if not found then
    raise exception 'Property not found';
  end if;

  update public.properties properties
  set homepage_feature_priority = target_priority,
      updated_at = now()
  where properties.id = target_property_id
  returning * into after_row;

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
    'property.homepage_feature_priority_changed',
    'property',
    target_property_id,
    'Admin changed homepage featured-stay placement priority.',
    to_jsonb(before_row),
    to_jsonb(after_row),
    jsonb_build_object(
      'priority', target_priority,
      'priority_label',
      case target_priority
        when 1 then 'FOUNDING_PARTNER'
        when 2 then 'PAID_PLACEMENT'
        else 'STANDARD'
      end
    )
  );
end;
$$;

revoke all on function public.admin_set_homepage_feature_priority(uuid,integer) from public;
grant execute on function public.admin_set_homepage_feature_priority(uuid,integer) to authenticated;

create index if not exists properties_homepage_feature_priority_idx
  on public.properties(homepage_feature_priority, published_at desc)
  where status = 'PUBLISHED';

commit;
