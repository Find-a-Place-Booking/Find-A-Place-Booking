Find A Place Booking — host signup policy review mobile fix

Replace:
- components/HostSignupPolicyReview.tsx
- components/HostSignupPolicyReview.module.css

What changes:
- Required Host Agreement / Terms / Cancellation / Privacy reviews open inside a full-screen review panel.
- The signup form stays mounted underneath, so name/contact/password entries are not lost.
- "Done reviewing · next" advances through the remaining required documents.
- The existing hidden evidence fields and final required agreement checkbox remain intact.
- "Open separately" remains available as a fallback.
- No auth, policy-version, database, onboarding, Stripe, or booking logic changes.

GitHub write access returned 403, so this is a drop-in overlay.
