-- Find A Place: standard host-defined fees, separate from guest-selected extras.
-- Apply transactionally. Existing bookings/fee records and Stripe flows are untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS public.unit_custom_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.property_units(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 100),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  amount_cents integer NOT NULL DEFAULT 0 CHECK (amount_cents BETWEEN 0 AND 1000000),
  calculation text NOT NULL DEFAULT 'FLAT_PER_STAY' CHECK (calculation IN ('FLAT_PER_STAY','PER_NIGHT','PER_GUEST_PER_STAY','PER_GUEST_PER_NIGHT','PER_PET_PER_STAY')),
  taxable_as_accommodation boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custom_fee_active_amount CHECK (NOT is_active OR amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS unit_custom_fees_unit_idx ON public.unit_custom_fees(unit_id,sort_order,created_at);
ALTER TABLE public.unit_custom_fees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.unit_custom_fees FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_custom_fees TO authenticated;
DROP POLICY IF EXISTS custom_fees_host_read ON public.unit_custom_fees;
CREATE POLICY custom_fees_host_read ON public.unit_custom_fees FOR SELECT TO authenticated USING (public.can_manage_unit_pricing(unit_id));
DROP POLICY IF EXISTS custom_fees_host_create ON public.unit_custom_fees;
CREATE POLICY custom_fees_host_create ON public.unit_custom_fees FOR INSERT TO authenticated WITH CHECK (public.can_manage_unit_pricing(unit_id));
DROP POLICY IF EXISTS custom_fees_host_update ON public.unit_custom_fees;
CREATE POLICY custom_fees_host_update ON public.unit_custom_fees FOR UPDATE TO authenticated USING (public.can_manage_unit_pricing(unit_id)) WITH CHECK (public.can_manage_unit_pricing(unit_id));
DROP POLICY IF EXISTS custom_fees_host_delete ON public.unit_custom_fees;
CREATE POLICY custom_fees_host_delete ON public.unit_custom_fees FOR DELETE TO authenticated USING (public.can_manage_unit_pricing(unit_id));

-- Called only within the existing authenticated quote function. No new public pricing endpoint.
CREATE OR REPLACE FUNCTION public.fap_add_standard_custom_fees(base_quote jsonb, target_unit_id uuid, nights integer, guests integer, pets integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $custom_fee$
DECLARE fee_row record; charge bigint; total bigint := 0; taxable_total bigint := 0; lines jsonb;
BEGIN
  lines := coalesce(base_quote->'fee_lines','[]'::jsonb);
  FOR fee_row IN SELECT id,name,description,amount_cents,calculation,taxable_as_accommodation FROM public.unit_custom_fees
      WHERE unit_id=target_unit_id AND is_active AND amount_cents > 0 ORDER BY sort_order,created_at LOOP
    charge := CASE fee_row.calculation
      WHEN 'PER_NIGHT' THEN fee_row.amount_cents::bigint * nights
      WHEN 'PER_GUEST_PER_STAY' THEN fee_row.amount_cents::bigint * guests
      WHEN 'PER_GUEST_PER_NIGHT' THEN fee_row.amount_cents::bigint * guests * nights
      WHEN 'PER_PET_PER_STAY' THEN fee_row.amount_cents::bigint * pets
      ELSE fee_row.amount_cents::bigint END;
    IF charge > 0 THEN
      total := total + charge;
      IF fee_row.taxable_as_accommodation THEN taxable_total := taxable_total + charge; END IF;
      lines := lines || jsonb_build_array(jsonb_build_object(
         'id',fee_row.id, 'type','CUSTOM', 'label',fee_row.name,
         'description',fee_row.description, 'calculation',fee_row.calculation, 'amount_cents',charge
      ));
    END IF;
  END LOOP;
  RETURN base_quote || jsonb_build_object(
    'fee_lines',lines,
    'custom_fee_total_cents',total,
    'custom_fee_taxable_cents',taxable_total,
    'pre_tax_total_cents',coalesce((base_quote->>'pre_tax_total_cents')::bigint,0)+total
  );
END $custom_fee$;
REVOKE ALL ON FUNCTION public.fap_add_standard_custom_fees(jsonb,uuid,integer,integer,integer) FROM PUBLIC,anon,authenticated;

-- Minimal, guarded integration into the existing quote, leaving lodging commission basis untouched.
DO $patch_quote$
DECLARE source text; changed text; head text := 'return jsonb_build_object(';
  old_tail text := '''quote_is_bookable'',false' || E'\r\n  );';
  new_tail text := '''quote_is_bookable'',false' || E'\r\n  ), target_unit_id, night_count, guest_count, pet_count);';
BEGIN
  source := pg_get_functiondef('public.quote_unit_stay(uuid,date,date,integer,integer,uuid[],text)'::regprocedure);
  IF position('return public.fap_add_standard_custom_fees(jsonb_build_object(' IN source) > 0 THEN
    RETURN;
  END IF;
  IF position(head IN source) = 0 OR position(old_tail IN source) = 0 THEN
    RAISE EXCEPTION 'FAP quote changed; custom fee patch cannot be applied safely';
  END IF;
  changed := replace(source,head,'return public.fap_add_standard_custom_fees(jsonb_build_object(');
  changed := replace(changed,old_tail,new_tail);
  IF changed = source OR position('return public.fap_add_standard_custom_fees(jsonb_build_object(' IN changed)=0 THEN
    RAISE EXCEPTION 'Custom fee quote patch failed';
  END IF;
  EXECUTE changed;
END $patch_quote$;

-- For tax rules scoped to accommodation, include only fees that the host marks as
-- accommodation-taxable. PRE_TAX_TOTAL scopes already include all custom fees.
DO $patch_tax$
DECLARE source text; changed text;
  old_expr text := 'lodging_cents + cleaning_cents + pet_cents + extra_guest_cents;';
  new_expr text := 'lodging_cents + cleaning_cents + pet_cents + extra_guest_cents + greatest(coalesce((quote ->> ''custom_fee_taxable_cents'')::bigint,0),0);';
BEGIN
  source := pg_get_functiondef('public.quote_guest_checkout_estimate(uuid,date,date,integer,integer,uuid[],text)'::regprocedure);
  IF position(new_expr IN source) = 0 THEN
    IF position(old_expr IN source) = 0 THEN RAISE EXCEPTION 'FAP tax calculator changed; abort'; END IF;
    changed := replace(source,old_expr,new_expr);
    EXECUTE changed;
  END IF;
END $patch_tax$;

DO $patch_tax_fallback$
DECLARE source text; changed text;
  old_expr text := 'greatest(coalesce((snapshot->>''extra_guest_fee_cents'')::bigint,0),0);';
  new_expr text := 'greatest(coalesce((snapshot->>''extra_guest_fee_cents'')::bigint,0),0) + greatest(coalesce((snapshot->>''custom_fee_taxable_cents'')::bigint,0),0);';
BEGIN
  source := pg_get_functiondef('public.fap_quote_guest_checkout_estimate_v2(uuid,date,date,integer,integer,uuid[],text,public.payment_environment)'::regprocedure);
  IF position(new_expr IN source) = 0 THEN
    IF position(old_expr IN source) = 0 THEN RAISE EXCEPTION 'FAP fallback tax calculator changed; abort'; END IF;
    changed := replace(source,old_expr,new_expr);
    EXECUTE changed;
  END IF;
END $patch_tax_fallback$;
COMMIT;
