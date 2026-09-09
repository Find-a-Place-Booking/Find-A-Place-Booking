-- Find A Place Booking
-- Step 7 cleanup: host avatar storage/profile path
--
-- This migration is intentionally limited to host profile imagery. It does not
-- add public host profiles, payment accounts, booking data, or publication.

begin;

alter table public.profiles
  add column if not exists avatar_storage_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'host-avatars',
  'host-avatars',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- A user owns the folder named with their auth UUID. Active admins may read
-- avatars for future support/admin views, but hosts cannot inspect each other.
drop policy if exists host_avatar_storage_select_self_or_admin on storage.objects;
create policy host_avatar_storage_select_self_or_admin on storage.objects
for select to authenticated
using (
  bucket_id = 'host-avatars'
  and (
    ((storage.foldername(name))[1]) = (select auth.uid())::text
    or public.is_active_admin()
  )
);

drop policy if exists host_avatar_storage_insert_self on storage.objects;
create policy host_avatar_storage_insert_self on storage.objects
for insert to authenticated
with check (
  bucket_id = 'host-avatars'
  and ((storage.foldername(name))[1]) = (select auth.uid())::text
);

drop policy if exists host_avatar_storage_update_self on storage.objects;
create policy host_avatar_storage_update_self on storage.objects
for update to authenticated
using (
  bucket_id = 'host-avatars'
  and ((storage.foldername(name))[1]) = (select auth.uid())::text
)
with check (
  bucket_id = 'host-avatars'
  and ((storage.foldername(name))[1]) = (select auth.uid())::text
);

drop policy if exists host_avatar_storage_delete_self on storage.objects;
create policy host_avatar_storage_delete_self on storage.objects
for delete to authenticated
using (
  bucket_id = 'host-avatars'
  and ((storage.foldername(name))[1]) = (select auth.uid())::text
);

create or replace function public.set_my_avatar_path(avatar_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_profile_id uuid := auth.uid();
begin
  if current_profile_id is null then
    raise exception 'Authentication required';
  end if;

  if avatar_path is not null and split_part(avatar_path, '/', 1) <> current_profile_id::text then
    raise exception 'Avatar path must belong to the signed-in profile';
  end if;

  update public.profiles
  set avatar_storage_path = nullif(trim(avatar_path), ''),
      updated_at = now()
  where id = current_profile_id;
end;
$$;

revoke all on function public.set_my_avatar_path(text) from public;
grant execute on function public.set_my_avatar_path(text) to authenticated;

comment on column public.profiles.avatar_storage_path is
  'Private host-avatar object path. Guest-facing host-profile publication is a later explicit product decision.';

commit;
