-- Find A Place Booking: independent refundable deposits and guest e-signature evidence
-- Apply before deploying the matching application code. New deposit policy is OFF by default.
-- This migration does not alter past bookings, existing Stripe payments, lodging taxes or commissions.
BEGIN;

CREATE TABLE IF NOT EXISTS public.unit_security_deposit_settings (
  unit_id uuid PRIMARY KEY REFERENCES public.property_units(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  amount_cents integer NOT NULL DEFAULT 0 CHECK(amount_cents BETWEEN 0 AND 250000),
  due_days_before_arrival integer NOT NULL DEFAULT 2 CHECK(due_days_before_arrival BETWEEN 0 AND 30),
  refund_days_after_checkout integer NOT NULL DEFAULT 7 CHECK(refund_days_after_checkout BETWEEN 0 AND 30),
  terms text NOT NULL DEFAULT '' CHECK(char_length(terms) <= 3000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enabled_deposit_has_amount CHECK(NOT enabled OR amount_cents > 0)
);
ALTER TABLE public.unit_security_deposit_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.unit_security_deposit_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.unit_security_deposit_settings TO authenticated;
DROP POLICY IF EXISTS unit_deposit_host_read ON public.unit_security_deposit_settings;
CREATE POLICY unit_deposit_host_read ON public.unit_security_deposit_settings FOR SELECT TO authenticated
USING (public.can_manage_unit_pricing(unit_id));
DROP POLICY IF EXISTS unit_deposit_host_insert ON public.unit_security_deposit_settings;
CREATE POLICY unit_deposit_host_insert ON public.unit_security_deposit_settings FOR INSERT TO authenticated
WITH CHECK (public.can_manage_unit_pricing(unit_id));
DROP POLICY IF EXISTS unit_deposit_host_update ON public.unit_security_deposit_settings;
CREATE POLICY unit_deposit_host_update ON public.unit_security_deposit_settings FOR UPDATE TO authenticated
USING (public.can_manage_unit_pricing(unit_id)) WITH CHECK (public.can_manage_unit_pricing(unit_id));

CREATE TABLE IF NOT EXISTS public.reservation_security_deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL UNIQUE REFERENCES public.reservations(id) ON DELETE RESTRICT,
  unit_id uuid NOT NULL REFERENCES public.property_units(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 250000),
  currency text NOT NULL DEFAULT 'USD' CHECK(currency = 'USD'),
  terms_snapshot text NOT NULL DEFAULT '',
  due_days_before_arrival integer NOT NULL DEFAULT 2,
  refund_days_after_checkout integer NOT NULL DEFAULT 7,
  status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','PAID','REFUND_PENDING','REFUNDED','CANCELLED','FAILED','DISPUTED')),
  stripe_account_id text,
  stripe_payment_intent_id text UNIQUE,
  stripe_refund_id text UNIQUE,
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reservation_security_deposits_org_idx ON public.reservation_security_deposits(organization_id,status);
ALTER TABLE public.reservation_security_deposits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_security_deposits FROM anon, authenticated;
GRANT SELECT ON public.reservation_security_deposits TO authenticated;
DROP POLICY IF EXISTS deposit_host_read ON public.reservation_security_deposits;
CREATE POLICY deposit_host_read ON public.reservation_security_deposits FOR SELECT TO authenticated
USING (public.can_manage_organization(organization_id));

-- Freeze terms the guest was shown during prepayment review, not whatever
-- the host changes them to after payment.
CREATE TABLE IF NOT EXISTS public.reservation_deposit_disclosures (
  reservation_id uuid PRIMARY KEY REFERENCES public.reservations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.property_units(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 1 AND 250000),
  terms_snapshot text NOT NULL DEFAULT '',
  due_days_before_arrival integer NOT NULL DEFAULT 2,
  refund_days_after_checkout integer NOT NULL DEFAULT 7,
  presented_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reservation_deposit_disclosures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reservation_deposit_disclosures FROM PUBLIC, anon, authenticated;

-- Freeze the host's current deposit policy only when a NEW booking becomes CONFIRMED.
-- Do not bill the guest here: the guest must separately consent to the deposit charge.
CREATE OR REPLACE FUNCTION public.fap_snapshot_deposit_on_confirmation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE disclosure public.reservation_deposit_disclosures%ROWTYPE;
BEGIN
  IF NEW.status::text <> 'CONFIRMED' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status::text = 'CONFIRMED' THEN RETURN NEW; END IF;
  END IF;
  SELECT * INTO disclosure FROM public.reservation_deposit_disclosures WHERE reservation_id=NEW.id AND unit_id=NEW.unit_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  INSERT INTO public.reservation_security_deposits
    (reservation_id,unit_id,organization_id,amount_cents,terms_snapshot,due_days_before_arrival,refund_days_after_checkout)
  VALUES (NEW.id,NEW.unit_id,NEW.organization_id,disclosure.amount_cents,disclosure.terms_snapshot,disclosure.due_days_before_arrival,disclosure.refund_days_after_checkout)
  ON CONFLICT (reservation_id) DO NOTHING;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS fap_snapshot_deposit_on_confirmation ON public.reservations;
CREATE TRIGGER fap_snapshot_deposit_on_confirmation AFTER INSERT OR UPDATE OF status ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.fap_snapshot_deposit_on_confirmation();
REVOKE ALL ON FUNCTION public.fap_snapshot_deposit_on_confirmation() FROM PUBLIC, anon, authenticated;

-- Record an explicit electronic signature bound to the property's policy PDF version.
ALTER TABLE public.reservation_policy_acceptances
  ADD COLUMN IF NOT EXISTS typed_signature_name text,
  ADD COLUMN IF NOT EXISTS typed_signature_at timestamptz,
  ADD COLUMN IF NOT EXISTS typed_signature_document_id uuid,
  ADD COLUMN IF NOT EXISTS typed_signature_document_version integer,
  ADD COLUMN IF NOT EXISTS electronic_signature_consent boolean NOT NULL DEFAULT false;

COMMIT;
