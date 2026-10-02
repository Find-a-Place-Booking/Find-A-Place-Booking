FIND A PLACE BOOKING — SAFE SYSTEM FIXES — 2026-10-02
Base GitHub main commit verified before packaging:
f90141aec23c28e58fa2b686e5eac20ad2d8d63b

NOT APPLIED ANYWHERE:
- No GitHub files were changed by ChatGPT.
- No Supabase migrations/data were changed by ChatGPT.
- No existing host, property, reservation or payment row was edited.

WHAT IS IN HERE
01_calendar_details
  Adds real Find A Place reservation details to the existing click-a-day calendar drawer.
  Fixes ResNexus BROWSER_WORKER being mislabeled as iCal.
  Does not change manual block or reservation routing behavior.

02_onboarding_tax
  Makes checkout tax setup optional in the wizard and completion API.
  Keeps tax setup available for hosts who want FAP to calculate it.
  A skipped tax setup leaves the existing database HOST_SELF_REMIT behavior in charge.
  Requires a host to explicitly choose NONE / iCal / PMS for availability rather than leaving UNSET.
  Fresh Stripe status is checked before automatic publication, but a temporary Stripe sync problem leaves the property safely saved as draft rather than losing onboarding work.

03_guest_checkout_recovery
  Stops expired holds from looping on Retry secure payment.
  Keeps same-page guest inputs/selections when an expired hold is reset.
  Accepts the server-extended hold expiration returned when a PaymentIntent starts.
  Confirmation polling continues after 30 seconds at a slower rate and stops for terminal failed/expired/cancelled states.

04_system_dependencies
  Adds the database contract used by the hardening changes.
  ResNexus ambiguous reservations are quarantined as account-level unresolved date windows instead of aborting the entire 10-unit sync.
  Exact ResNexus room/site blocks continue syncing.
  Unresolved windows fail closed only for their affected dates.
  ResNexus freshness now also protects approved date changes.
  New external-calendar listings need one successful sync before FIRST publication only.
  Existing published/paused listings are explicitly exempt because published_at is already populated.
  Stripe account/capability webhooks resync the canonical payment account state.
  Payment start rechecks Stripe plus current calendar state immediately before PaymentIntent work.
  Public availability fails closed when ResNexus itself is stale.
  Expired HOLD rows are auto-cleaned ONLY when no payment row exists.
  PAYMENT_PENDING/PAYMENT_FAILED/payment-bearing reservations are deliberately not auto-cleaned.

SAFE APPLY ORDER
Preferred: apply the migration in 04_system_dependencies through the normal Supabase migration workflow, then deploy the app overlays.
The app-side RPC calls also detect a not-yet-visible migration and fall back to the existing behavior, so a brief code-first deploy does not take guest availability/payment down.

EXISTING HOST COMPATIBILITY
- No tax requirement is added to existing hosts.
- No calendar first-sync requirement is applied retroactively to a listing that has ever been published.
- Existing confirmed bookings/payment snapshots are not rewritten.
- Existing manual blocks are not converted into reservations.
- Stripe only pauses a listing if Stripe's current account state actually loses payment readiness through the existing payment-account safety trigger.
- Current ResNexus ERROR rows are not forcibly reset by the migration; they recover through the next successful worker sync after the ambiguous-event cascade is fixed.

SOURCE-CONTROL DRIFT FOUND DURING AUDIT
Production Supabase already records these migrations but current GitHub main does not contain matching migration files:
- 20261001222241_fix_onboarding_unit_id_ambiguity
- 20261001223323_stop_resnexus_ambiguous_fanout_blocks
- 20261001224450_allow_live_property_edits_with_cancellation_warning
They were NOT re-created from memory inside these runtime overlays. Their exact SQL remains in Supabase migration history and should be copied back into source control separately so a fresh database can reproduce production.
TYPECHECK CORRECTION — 2026-10-02
The payment-intent route includes the missing missingDatabaseFunction() compatibility helper. This corrects the failed TypeScript check in the first package.

