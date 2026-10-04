create table if not exists public.property_nearby_experiences (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  category text not null default 'Attraction' check (char_length(trim(category)) between 1 and 80),
  description text,
  distance_miles numeric(7,2) check (distance_miles is null or distance_miles between 0 and 9999),
  drive_minutes integer check (drive_minutes is null or drive_minutes between 0 and 10000),
  website_url text,
  image_path text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_nearby_experiences_property_idx
  on public.property_nearby_experiences(property_id, sort_order, created_at);

create trigger property_nearby_experiences_set_updated_at
before update on public.property_nearby_experiences
for each row execute function public.set_updated_at();

alter table public.property_nearby_experiences enable row level security;

create policy property_nearby_experiences_select_member
on public.property_nearby_experiences
for select to authenticated
using (public.can_access_property(property_id));

create policy property_nearby_experiences_insert_manager
on public.property_nearby_experiences
for insert to authenticated
with check (public.can_manage_property(property_id));

create policy property_nearby_experiences_update_manager
on public.property_nearby_experiences
for update to authenticated
using (public.can_manage_property(property_id))
with check (public.can_manage_property(property_id));

create policy property_nearby_experiences_delete_manager
on public.property_nearby_experiences
for delete to authenticated
using (public.can_manage_property(property_id));

grant select, insert, update, delete
on public.property_nearby_experiences to authenticated;

create or replace function public.reorder_property_nearby_experiences(
  target_property_id uuid,
  ordered_experience_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing_count integer;
  requested_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_property(target_property_id) then
    raise exception 'Property owner or manager access required';
  end if;

  select count(*) into existing_count
  from public.property_nearby_experiences
  where property_id = target_property_id;

  requested_count := coalesce(array_length(ordered_experience_ids, 1), 0);

  if requested_count <> existing_count then
    raise exception 'Nearby order must include every nearby entry exactly once';
  end if;

  if requested_count <> (
    select count(distinct requested.experience_id)
    from unnest(ordered_experience_ids) as requested(experience_id)
  ) then
    raise exception 'Nearby order contains duplicate IDs';
  end if;

  if exists (
    select 1
    from unnest(ordered_experience_ids) as requested(experience_id)
    left join public.property_nearby_experiences experience
      on experience.id = requested.experience_id
     and experience.property_id = target_property_id
    where experience.id is null
  ) then
    raise exception 'Nearby order contains an entry that does not belong to this property';
  end if;

  update public.property_nearby_experiences experience
  set sort_order = ordered.position - 1
  from unnest(ordered_experience_ids) with ordinality as ordered(experience_id, position)
  where experience.id = ordered.experience_id
    and experience.property_id = target_property_id;
end;
$$;

revoke all on function public.reorder_property_nearby_experiences(uuid, uuid[]) from public;
grant execute on function public.reorder_property_nearby_experiences(uuid, uuid[]) to authenticated;

create or replace function public.reorder_property_images(
  target_unit_id uuid,
  ordered_image_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing_count integer;
  requested_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_unit(target_unit_id) then
    raise exception 'Property owner or manager access required';
  end if;

  select count(*) into existing_count
  from public.property_images
  where unit_id = target_unit_id;

  requested_count := coalesce(array_length(ordered_image_ids, 1), 0);

  if requested_count <> existing_count then
    raise exception 'Photo order must include every property photo exactly once';
  end if;

  if requested_count <> (
    select count(distinct requested.image_id)
    from unnest(ordered_image_ids) as requested(image_id)
  ) then
    raise exception 'Photo order contains duplicate image IDs';
  end if;

  if exists (
    select 1
    from unnest(ordered_image_ids) as requested(image_id)
    left join public.property_images image
      on image.id = requested.image_id
     and image.unit_id = target_unit_id
    where image.id is null
  ) then
    raise exception 'Photo order contains an image that does not belong to this property';
  end if;

  update public.property_images image
  set sort_order = ordered.position - 1
  from unnest(ordered_image_ids) with ordinality as ordered(image_id, position)
  where image.id = ordered.image_id
    and image.unit_id = target_unit_id;
end;
$$;

revoke all on function public.reorder_property_images(uuid, uuid[]) from public;
grant execute on function public.reorder_property_images(uuid, uuid[]) to authenticated;

comment on table public.property_nearby_experiences is
  'Host-curated nearby attractions and trip draws shown on a public property listing. Mapbox coordinates used for lookup/routing are not persisted.';

comment on function public.reorder_property_images(uuid, uuid[]) is
  'Atomically rewrites every property image sort_order for a host-managed unit. The first image becomes the public primary/hero photo.';
