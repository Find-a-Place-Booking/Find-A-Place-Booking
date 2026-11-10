-- Grants/revokes verified partner app access without changing lodging commission.
create or replace function public.admin_set_host_webapp_partner(target_organization_id uuid,verified boolean,verification_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); before_row public.organizations%rowtype; after_row public.organizations%rowtype;
begin
 if actor is null or not public.admin_has_any_role(array['SUPER_ADMIN','PARTNER_ADMIN']::public.admin_role[]) then raise exception 'Partner verification admin required';end if;
 select o.* into before_row from public.organizations o where o.id=target_organization_id and o.status<>'ARCHIVED' for update;
 if not found then raise exception 'Active host organization not found';end if;
 update public.organizations set partner_status=case when verified then 'VERIFIED'::public.partner_status else 'REJECTED'::public.partner_status end,
 partner_verified_by=case when verified then actor else null end,partner_verified_at=case when verified then now() else null end,
 partner_verification_note=nullif(left(trim(coalesce(verification_note,'')),1000),''),updated_at=now()
 where id=target_organization_id returning * into after_row;
 insert into public.audit_logs(actor_profile_id,action,entity_type,entity_id,reason,before_state,after_state,metadata)
 values(actor,case when verified then 'host_webapp.partner_verified' else 'host_webapp.partner_removed' end,'organization',target_organization_id,left(verification_note,1000),to_jsonb(before_row),to_jsonb(after_row),jsonb_build_object('source','admin_host_webapp'));
end;$$;
revoke all on function public.admin_set_host_webapp_partner(uuid,boolean,text) from public,anon;
grant execute on function public.admin_set_host_webapp_partner(uuid,boolean,text) to authenticated;
