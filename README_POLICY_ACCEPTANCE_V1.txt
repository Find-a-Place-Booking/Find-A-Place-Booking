FIND A PLACE BOOKING — POLICY & AGREEMENT PASS 1
================================================

Purpose
-------
Adds the policy/terms layer immediately after Guest Verification Pass 1 without
changing the working booking totals, taxes, Stripe Connect split, processor-fee
recovery, host proceeds, or payment webhook.

What this adds
--------------
1. New host signup requires explicit acceptance of the current:
   - Host Agreement
   - Terms of Service
   - Cancellation & Refund Policy
   - Privacy / Identity Notice
   The accepted agreement version and timestamp are stored server-side.

2. Guest checkout now runs:
   guest info -> email/ID verification -> policy review/acceptance -> Stripe payment

3. Guests must explicitly open/review BOTH:
   - the reservation-snapshotted property policies; and
   - Find A Place platform terms
   before the agreement checkbox unlocks.

4. Property policy snapshots already created by the booking system remain the
   source of truth. If a host changes rules/PDF later, the existing reservation
   still points to the policy version that applied when the hold was created.

5. Existing host policy options remain supported:
   - selected house rules / policy fields
   - manual written custom policies
   - optional versioned PDF upload

6. PaymentIntent creation is server-gated on current policy acceptance. This is
   not just a disabled browser button.

7. Host booking confirmation emails include the policy/terms acceptance summary.

8. Public legal pages added:
   /terms
   /host-agreement
   /cancellation-policy
   /privacy

Database
--------
Apply only:
  20260919004400_policy_acceptance_foundation.sql

This migration creates audit/acceptance tables only. It does not rewrite any
payment, booking, tax, calendar or payout function.

Expected dry run
----------------
After Guest Verification 043 is already applied:
  npx supabase db push --dry-run

Expected pending migration:
  20260919004400_policy_acceptance_foundation.sql

Then:
  npx supabase db push
  npm run typecheck
  npm run build

Legal note
----------
The included legal pages are operational first drafts based on the platform rules
specified for Find A Place. They should receive Arkansas counsel review before
live launch, especially the limitation-of-liability, cancellation, damage,
tax and dispute language.

Backlog item recorded — NOT changed in this pass
------------------------------------------------
Pet fees need configurable calculation options, including at minimum:
- per pet per night (common/default choice)
- per pet per stay
- flat per stay
Potentially additional host-selectable calculation modes later.

This pass intentionally does not touch rates/fees so policy testing stays isolated.
