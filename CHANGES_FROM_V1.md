# Changes from the first hardening ZIP

Use this V2 FINAL package instead.

The second audit found these additional upstream/downstream issues:

1. Historical `ARKANSAS` values can miss automatic `AR` tax rules.
2. Payment readiness must use the same routing precedence as booking hold.
3. Readiness can be lost after publication when Stripe/tax/live-gate state
   changes.
4. Host onboarding tax fields were staying in the onboarding draft instead of
   being persisted into the real property tax tables.
5. The first V2 draft was tightened further so normalization runs with safe
   trigger privileges and INSERT paths never reference `OLD`.
