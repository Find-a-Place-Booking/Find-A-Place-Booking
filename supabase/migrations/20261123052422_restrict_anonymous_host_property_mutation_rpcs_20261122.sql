-- Find A Place: restrict host property mutation RPCs to signed-in users.
-- APPLIED TO PRODUCTION SUPABASE on 2026-11-22 CT. Included to keep Git source in sync.
-- Existing authenticated and service_role grants remain unchanged.
-- Does not modify any existing listing, booking, payment, or calendar data.
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.archive_property(uuid)', 'EXECUTE')
  OR NOT has_function_privilege('authenticated', 'public.create_blank_property(uuid,text,text,text)', 'EXECUTE')
  OR NOT has_function_privilege('authenticated', 'public.save_property_listing(uuid,jsonb,text[],text[])', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'Expected signed-in host permissions absent; no changes applied';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.archive_property(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_blank_property(uuid,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_property_listing(uuid,jsonb,text[],text[]) FROM anon;
