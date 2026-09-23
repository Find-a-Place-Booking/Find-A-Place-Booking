begin;

-- Host onboarding and newly-created properties are production/live by default.
-- Publication, Stripe readiness, unit activity, availability, security and the
-- global guest-checkout runtime flag still control whether a booking can proceed.
alter table public.properties
  alter column live_checkout_enabled set default true;

-- Backfill existing non-archived properties so an old pilot-era false value
-- cannot silently block an otherwise valid live reservation.
alter table public.properties
  disable trigger properties_protect_live_checkout_gate;

update public.properties
set live_checkout_enabled = true
where status <> 'ARCHIVED'
  and live_checkout_enabled is distinct from true;

alter table public.properties
  enable trigger properties_protect_live_checkout_gate;

commit;
