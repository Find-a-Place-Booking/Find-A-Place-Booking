begin;

create or replace function public.save_property_setup(
  target_property_id uuid,
  listing_data jsonb,
  selected_amenities text[] default '{}'::text[],
  selected_policies text[] default '{}'::text[]
)
returns table(
  property_id uuid,
  slug text,
  status public.property_status,
  saved_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  before_status public.property_status;
  primary_unit_id uuid;
  result_property_id uuid;
  result_slug text;
  result_status public.property_status;
  result_saved_at timestamptz;
  has_setup_pricing boolean;
  weeknight_text text;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_property(target_property_id) then
    raise exception 'Property owner or manager access required';
  end if;

  select properties.status, units.id
  into before_status, primary_unit_id
  from public.properties properties
  join public.property_units units
    on units.property_id = properties.id
   and units.is_primary
  where properties.id = target_property_id;

  if before_status is null or primary_unit_id is null then
    raise exception 'Property or primary rentable unit not found';
  end if;

  weeknight_text := trim(coalesce(listing_data ->> 'weeknight', ''));

  has_setup_pricing :=
    weeknight_text <> ''
    or trim(coalesce(listing_data ->> 'weekend', '')) <> ''
    or trim(coalesce(listing_data ->> 'cleaning', '')) <> ''
    or trim(coalesce(listing_data ->> 'pet', '')) <> '';

  select saved.property_id, saved.slug, saved.status, saved.saved_at
  into result_property_id, result_slug, result_status, result_saved_at
  from public.save_property_listing(
    target_property_id,
    listing_data,
    selected_amenities,
    selected_policies
  ) saved;

  if before_status in (
    'DRAFT',
    'CHANGES_REQUESTED',
    'REJECTED',
    'APPROVED'
  ) and has_setup_pricing then
    if weeknight_text = '' then
      raise exception
        'Set a weeknight rate before saving weekend rates or standard fees';
    end if;

    perform public.save_unit_base_pricing(
      primary_unit_id,
      jsonb_build_object(
        'weeknight', listing_data ->> 'weeknight',
        'weekend', listing_data ->> 'weekend',
        'cleaning', listing_data ->> 'cleaning',
        'pet', listing_data ->> 'pet',
        'petCalculation', 'PER_NIGHT',
        'extraGuest', '',
        'includedGuests', '',
        'minimumStay', coalesce(nullif(listing_data ->> 'minStay', ''), '1')
      )
    );
  end if;

  return query
  select
    result_property_id,
    result_slug,
    result_status,
    result_saved_at;
end;
$$;

revoke all on function public.save_property_setup(
  uuid,jsonb,text[],text[]
) from public, anon;

grant execute on function public.save_property_setup(
  uuid,jsonb,text[],text[]
) to authenticated;

notify pgrst, 'reload schema';

commit;
