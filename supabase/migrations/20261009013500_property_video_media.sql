create table if not exists public.property_videos (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null unique references public.property_units(id) on delete cascade,
  storage_path text not null unique,
  original_name text,
  content_type text not null check (content_type in ('video/mp4','video/webm')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 78643200),
  duration_seconds numeric(7,2) check (
    duration_seconds is null or (duration_seconds > 0 and duration_seconds <= 60)
  ),
  is_primary boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists property_videos_set_updated_at on public.property_videos;
create trigger property_videos_set_updated_at
before update on public.property_videos
for each row execute function public.set_updated_at();

alter table public.property_videos enable row level security;

revoke all on table public.property_videos from anon, authenticated;
grant select, insert, update, delete on table public.property_videos to authenticated;
grant select, insert, update, delete on table public.property_videos to service_role;

drop policy if exists property_videos_host_select on public.property_videos;
create policy property_videos_host_select
on public.property_videos
for select to authenticated
using (
  exists (
    select 1
    from public.property_units u
    where u.id = property_videos.unit_id
      and public.can_edit_property(u.property_id)
  )
);

drop policy if exists property_videos_host_insert on public.property_videos;
create policy property_videos_host_insert
on public.property_videos
for insert to authenticated
with check (
  exists (
    select 1
    from public.property_units u
    where u.id = property_videos.unit_id
      and public.can_edit_property(u.property_id)
  )
);

drop policy if exists property_videos_host_update on public.property_videos;
create policy property_videos_host_update
on public.property_videos
for update to authenticated
using (
  exists (
    select 1
    from public.property_units u
    where u.id = property_videos.unit_id
      and public.can_edit_property(u.property_id)
  )
)
with check (
  exists (
    select 1
    from public.property_units u
    where u.id = property_videos.unit_id
      and public.can_edit_property(u.property_id)
  )
);

drop policy if exists property_videos_host_delete on public.property_videos;
create policy property_videos_host_delete
on public.property_videos
for delete to authenticated
using (
  exists (
    select 1
    from public.property_units u
    where u.id = property_videos.unit_id
      and public.can_edit_property(u.property_id)
  )
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'property-videos',
  'property-videos',
  false,
  78643200,
  array['video/mp4','video/webm']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists property_video_storage_insert_editable_manager on storage.objects;
create policy property_video_storage_insert_editable_manager
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'property-videos'
  and public.can_edit_property(((storage.foldername(name))[2])::uuid)
);

drop policy if exists property_video_storage_select_manager on storage.objects;
create policy property_video_storage_select_manager
on storage.objects
for select to authenticated
using (
  bucket_id = 'property-videos'
  and (
    public.is_active_admin()
    or public.is_organization_member(((storage.foldername(name))[1])::uuid)
  )
);

drop policy if exists property_video_storage_update_editable_manager on storage.objects;
create policy property_video_storage_update_editable_manager
on storage.objects
for update to authenticated
using (
  bucket_id = 'property-videos'
  and public.can_edit_property(((storage.foldername(name))[2])::uuid)
)
with check (
  bucket_id = 'property-videos'
  and public.can_edit_property(((storage.foldername(name))[2])::uuid)
);

drop policy if exists property_video_storage_delete_editable_manager on storage.objects;
create policy property_video_storage_delete_editable_manager
on storage.objects
for delete to authenticated
using (
  bucket_id = 'property-videos'
  and public.can_edit_property(((storage.foldername(name))[2])::uuid)
);

