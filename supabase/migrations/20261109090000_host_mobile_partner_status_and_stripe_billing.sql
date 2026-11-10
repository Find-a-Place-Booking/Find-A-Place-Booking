-- Find A Place Host mobile app: partner access is controlled by partner_status,
-- NOT by the organization's 7% booking fee tier. Stripe subscriptions are
-- separate from connected-account booking payments.
-- Safe to re-run: additive columns, indexes, function replacement.
ALTER TABLE public.host_mobile_access
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text,
  ADD COLUMN IF NOT EXISTS stripe_cancel_at_period_end boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS host_mobile_access_stripe_customer_id_unique
  ON public.host_mobile_access(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS host_mobile_access_stripe_subscription_id_unique
  ON public.host_mobile_access(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.start_host_mobile_trial(
  target_organization_id uuid,
  target_profile_id uuid
) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  trial_end timestamptz;
BEGIN
  IF coalesce((select auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members members
    WHERE members.organization_id = target_organization_id
      AND members.profile_id = target_profile_id
      AND members.status = 'ACTIVE'
      AND members.role = 'OWNER'
  ) THEN
    RAISE EXCEPTION 'An active organization owner is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id=target_organization_id AND o.status <> 'ARCHIVED'
  ) THEN
    RAISE EXCEPTION 'Host organization is not active';
  END IF;
  -- Verified partner organizations get permanent included access; no trial
  -- or commission-based condition is necessary.
  IF EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = target_organization_id
      AND o.partner_status = 'VERIFIED'
  ) THEN
    RAISE EXCEPTION 'Verified partners already have included host mobile access';
  END IF;

  INSERT INTO public.host_mobile_access(
    organization_id, trial_started_at, trial_expires_at
  ) VALUES (
    target_organization_id, now(), now() + interval '30 days'
  ) ON CONFLICT (organization_id) DO UPDATE SET
    trial_started_at = now(),
    trial_expires_at = now() + interval '30 days',
    updated_at = now()
  WHERE public.host_mobile_access.trial_started_at IS NULL
    AND public.host_mobile_access.stripe_subscription_id IS NULL
  RETURNING trial_expires_at INTO trial_end;
  IF trial_end IS NULL THEN
    RAISE EXCEPTION 'This organization already used its mobile trial or has a subscription';
  END IF;
  RETURN trial_end;
END;
$function$;

-- The trial function is invoked exclusively by our server after authenticating
-- the account owner. The browser must never call it directly.
REVOKE ALL ON FUNCTION public.start_host_mobile_trial(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_host_mobile_trial(uuid, uuid) TO service_role;
