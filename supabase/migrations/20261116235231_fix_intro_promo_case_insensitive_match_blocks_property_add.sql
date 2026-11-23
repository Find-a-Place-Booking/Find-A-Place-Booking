-- Align promotion-code existence checks with the lower(code) unique index.
-- This corrected host property creation failures triggered by duplicate promo codes.
-- ALREADY APPLIED TO PRODUCTION. Kept here for reproducible schema history.
DO $promo_case_fix$
DECLARE
  original_ddl text;
  safe_ddl text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO original_ddl
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname = 'fap_sync_intro_promotions'
    AND pg_get_function_identity_arguments(oid) = 'target_organization_id uuid'
  LIMIT 1;

  IF original_ddl IS NULL THEN
    RAISE EXCEPTION 'Intro promotion function missing; no changes made';
  END IF;

  -- Safe for production systems which already have this correction.
  IF strpos(original_ddl,'lower(code)=lower(promo_code)') > 0 THEN
    RAISE NOTICE 'Intro promotion case-insensitive check already correct';
    RETURN;
  END IF;

  IF (length(original_ddl) - length(replace(original_ddl,'upper(code)=promo_code',''))) <> length('upper(code)=promo_code') THEN
    RAISE EXCEPTION 'Intro promotion lookup does not match the audited version; no changes made';
  END IF;

  safe_ddl := replace(original_ddl, 'upper(code)=promo_code', 'lower(code)=lower(promo_code)');
  IF safe_ddl = original_ddl THEN
    RAISE EXCEPTION 'Intro promotion case fix not applied';
  END IF;
  EXECUTE safe_ddl;
END
$promo_case_fix$;
