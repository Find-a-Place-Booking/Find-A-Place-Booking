-- Add direct-to-storage photo upload access for verified operations admins,
-- restricted to unpublished property paths. Existing host storage policies
-- are unchanged. The bucket already limits uploads to JPG/PNG/WebP <=10MB.
drop policy if exists property_storage_insert_ops_admin on storage.objects;
create policy property_storage_insert_ops_admin on storage.objects
for insert to authenticated
with check (
  bucket_id = 'property-images'
  and public.admin_has_any_role(array['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[])
  and exists (
    select 1 from public.properties p
    where p.id::text = split_part(name,'/',2)
      and p.organization_id::text = split_part(name,'/',1)
      and p.status::text in ('DRAFT','PENDING_REVIEW','CHANGES_REQUESTED','APPROVED','PAUSED','REJECTED')
  )
);

drop policy if exists property_storage_delete_ops_admin on storage.objects;
create policy property_storage_delete_ops_admin on storage.objects
for delete to authenticated
using (
  bucket_id = 'property-images'
  and public.admin_has_any_role(array['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[])
  and exists (
    select 1 from public.properties p
    where p.id::text = split_part(name,'/',2)
      and p.organization_id::text = split_part(name,'/',1)
      and p.status::text in ('DRAFT','PENDING_REVIEW','CHANGES_REQUESTED','APPROVED','PAUSED','REJECTED')
  )
);

-- Only registered objects count as listing images. Register photo + audit
-- entry in ONE DB transaction after browser-to-Supabase storage upload.
create or replace function public.admin_register_listing_photo(
  target_property_id uuid, storage_path_value text,
  original_name_value text, change_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
 actor_id uuid:=(select auth.uid()); p public.properties%rowtype;
 u public.property_units%rowtype; storage_meta jsonb;
 img_mime text; img_size bigint; img_count integer;
 next_order integer; new_id uuid;
begin
 if actor_id is null or not public.admin_has_any_role(
  array['SUPER_ADMIN','OPERATIONS_ADMIN']::public.admin_role[])
 then raise exception 'Operations admin role required'; end if;
 if length(trim(coalesce(change_reason,'')))<8 then
  raise exception 'Document why this photo was added for the host'; end if;
 select * into p from public.properties where id=target_property_id for update;
 if not found then raise exception 'Property not found'; end if;
 if p.status::text not in ('DRAFT','PENDING_REVIEW','CHANGES_REQUESTED','APPROVED','PAUSED','REJECTED') then
  raise exception 'Admin photo upload is only available for unpublished listings'; end if;
 select * into u from public.property_units where property_id=p.id and is_primary and is_active limit 1;
 if not found then raise exception 'Active primary rentable unit required'; end if;
 if storage_path_value is null
   or split_part(storage_path_value,'/',1)<>p.organization_id::text
   or split_part(storage_path_value,'/',2)<>p.id::text
   or split_part(storage_path_value,'/',3)='' 
   or split_part(storage_path_value,'/',4)<>''
   or lower(storage_path_value) !~ '\.(jpg|jpeg|png|webp)$' then
  raise exception 'Photo path must match the host and property'; end if;
 select objects.metadata into storage_meta from storage.objects objects
 where objects.bucket_id='property-images' and objects.name=storage_path_value;
 if not found then raise exception 'Upload the photo to private storage before registering it'; end if;
 img_mime:=coalesce(storage_meta->>'mimetype',storage_meta->>'contentType');
 if img_mime not in ('image/jpeg','image/png','image/webp') then raise exception 'Unsupported photo MIME type'; end if;
 if not coalesce(storage_meta->>'size','') ~ '^[0-9]{1,12}$' then
  raise exception 'Storage did not record a valid photo size'; end if;
 img_size:=(storage_meta->>'size')::bigint;
 if img_size<1 or img_size>10485760 then raise exception 'Photo must be no larger than 10 MB'; end if;
 if exists(select 1 from public.property_images where storage_path=storage_path_value) then
   raise exception 'Photo was already registered'; end if;
 select count(*),coalesce(max(sort_order),-1)+1 into img_count,next_order
 from public.property_images where unit_id=u.id;
 if img_count>=25 then raise exception 'Property already has 25 photos'; end if;
 insert into public.property_images(unit_id,storage_path,original_name,content_type,size_bytes,sort_order,alt_text,created_by)
 values(u.id,storage_path_value,left(coalesce(nullif(trim(original_name_value),''),'Property photo'),255),
 img_mime,img_size,next_order,left(p.name||' property photo',250),actor_id)
 returning id into new_id;
 insert into public.audit_logs(actor_profile_id,action,entity_type,entity_id,reason,metadata)
 values(actor_id,'property.admin_photo_added','property',p.id,left(trim(change_reason),500),
 jsonb_build_object('image_id',new_id,'size_bytes',img_size,'mime',img_mime,'source','admin_publishing'));
 return new_id;
end; $$;
revoke all on function public.admin_register_listing_photo(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.admin_register_listing_photo(uuid,text,text,text) to authenticated,service_role;
