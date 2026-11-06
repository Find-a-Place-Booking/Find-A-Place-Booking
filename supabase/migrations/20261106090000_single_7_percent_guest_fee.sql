-- Find A Place: one standard 7% guest-paid service fee for all NEW reservations.
-- Historical reservation financial snapshots, Stripe charges, refunds and calendars are untouched.
-- Apply only alongside the updated application copy / retired admin rate controls.
BEGIN;
DO $verify_guest_fee$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fap_guest_fee_rollout
    WHERE id = true AND live_enabled = true AND test_enabled = true
  ) THEN
    RAISE EXCEPTION 'Guest-paid fees are not enabled for LIVE and TEST. Aborting 7%% rate unification.';
  END IF;
END
$verify_guest_fee$;

-- 7% becomes the only rate assigned to organizations. Existing reservations keep
-- their original commission_rate_bps, commission_tier and pricing_snapshot.
UPDATE public.organizations
SET commission_tier = 'STANDARD_7'::public.commission_tier,
    commission_effective_from = now(),
    updated_at = now()
WHERE commission_tier <> 'STANDARD_7'::public.commission_tier;

-- Guard future organization writes, including old partner verification routines.
-- The partner badge/status can remain independent of its former commission perk.
CREATE OR REPLACE FUNCTION public.enforce_standard_guest_fee_tier()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  NEW.commission_tier := 'STANDARD_7'::public.commission_tier;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.enforce_standard_guest_fee_tier() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS organizations_only_standard_booking_fee ON public.organizations;
CREATE TRIGGER organizations_only_standard_booking_fee
BEFORE INSERT OR UPDATE OF commission_tier ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.enforce_standard_guest_fee_tier();

-- Old commission switch RPC must not be callable from admin clients, even if
-- an old interface is still cached. Do not drop enum values used by history.
REVOKE EXECUTE ON FUNCTION public.admin_set_partner_commission(uuid,boolean,text)
FROM PUBLIC, anon, authenticated;

-- Update managed PUBLIC wording only. Do not erase or recalculate past bookings.
UPDATE public.site_content_blocks
SET title = 'Guest-paid booking fee',
    body = 'Guests pay a 7% Find A Place service fee on the lodging subtotal after eligible discounts. The fee is disclosed during checkout and does not apply to cleaning, pet fees, optional extras or lodging taxes. Hosts continue to receive payments through their connected Stripe account and pay applicable Stripe processing charges.',
    updated_at = now()
WHERE key = 'hosts.commission';

UPDATE public.site_content_blocks
SET title = 'Payment processing and guest service fee',
    body = 'Guest booking charges are processed directly on the host''s connected merchant account. For NEW Find A Place reservations, a 7% service fee is added to the guest''s checkout total, calculated from the discounted lodging subtotal, excluding taxes and separately listed cleaning, pet and optional add-on charges. The fee is disclosed before the guest pays and is retained by Find A Place through the connected payment''s application fee. Hosts do not pay a second Find A Place platform commission on those new reservations.\n\nReservations made before this fee policy took effect retain their original agreed payment, commission and fee snapshots; previously completed charges are not recalculated.

Guest lodging tax dollars remain with the host''s connected-account proceeds. Stripe processing fees are the host''s responsibility. Hosts remain responsible for applicable tax filing and remittance under the host agreement.',
    updated_at = now()
WHERE key = 'policy.host.payments';

-- This changes a substantive host agreement term. Require a fresh acceptance
-- through the EXISTING HostPolicyAcceptance UI rather than silently treating
-- old acceptance as approval of a revised contract.
DO $version$
DECLARE current_revision integer;
BEGIN
  SELECT revision INTO current_revision
  FROM public.platform_policy_versions WHERE policy_key = 'host_agreement' FOR UPDATE;
  IF current_revision NOT IN (6,7) OR current_revision IS NULL THEN
    RAISE EXCEPTION 'Unexpected host agreement revision %; review before applying', current_revision;
  END IF;
  IF current_revision = 6 THEN
    UPDATE public.platform_policy_versions
    SET revision = 7, version_label = '2026-11-05-v7',
        effective_at = now(), updated_at = now()
    WHERE policy_key = 'host_agreement';
  END IF;
END
$version$;
COMMIT;
