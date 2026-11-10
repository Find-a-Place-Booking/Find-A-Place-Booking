-- Applied to the production Supabase database during the Nov 9 audit.
-- Keep partner VERIFIED/REJECTED changes and their audit trail, but stop
-- changing the (now uniform) 7% booking rate as a side effect of verification.
-- This intentionally leaves reservation, Stripe and guest pricing logic alone.
DO $cleanup$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO definition
  FROM pg_proc AS p
  WHERE p.pronamespace='public'::regnamespace
    AND p.proname='review_partner_verification'
  LIMIT 1;
  IF definition IS NULL THEN
    RAISE EXCEPTION 'Partner verification function is missing';
  END IF;
  -- Safe to rerun after the change, but don't overwrite an unknown function.
  IF position('commission_tier = ''PARTNER_5'',' in definition) = 0
     AND position('commission_tier = ''STANDARD_7'',' in definition) = 0 THEN
    RETURN;
  END IF;
  IF position('commission_tier = ''PARTNER_5'',' in definition) = 0
     OR position('commission_tier = ''STANDARD_7'',' in definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected partner function; refusing partial update';
  END IF;
  definition := replace(definition, 'commission_tier = ''PARTNER_5'',', '');
  definition := replace(definition, 'commission_tier = ''STANDARD_7'',', '');
  EXECUTE definition;
END;
$cleanup$;
