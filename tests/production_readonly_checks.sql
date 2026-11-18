-- READ ONLY. Run after deployment to verify key production invariants.
SELECT policy_key,version_label,effective_at FROM public.platform_policy_versions ORDER BY policy_key;
SELECT p.name,p.status,d.blocked_check_in_days,d.blocked_check_out_days
FROM public.properties p JOIN public.property_units u ON u.property_id=p.id
LEFT JOIN public.unit_booking_day_rules d ON d.unit_id=u.id
WHERE p.organization_id='5abbdf30-6a35-444e-a843-62c56f6f5290'::uuid ORDER BY p.name;
SELECT p.name,v.duration_seconds,v.size_bytes, v.created_at
FROM public.property_videos v JOIN public.property_units u ON v.unit_id=u.id JOIN public.properties p ON u.property_id=p.id
WHERE p.organization_id='41a1c3d8-b7a6-46f0-be95-9347377a9586'::uuid;
SELECT (SELECT count(*) FROM public.amenity_catalog WHERE active) AS active_amenities,
  (SELECT count(*) FROM public.site_copy_drafts) AS saved_admin_drafts,
  (SELECT count(*) FROM public.unit_security_deposit_settings WHERE enabled) AS enabled_deposit_properties,
  (SELECT count(*) FROM public.reservation_security_deposits) AS new_booking_deposits;
SELECT status,count(*) FROM public.reservation_security_deposits GROUP BY status ORDER BY status;
SELECT c.provider,c.sync_status,count(*) FROM public.calendar_connections c WHERE c.provider='OWNEREZ' GROUP BY 1,2;
