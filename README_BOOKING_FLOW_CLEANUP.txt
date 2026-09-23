Find A Place Booking — Guest Booking Flow Cleanup

This package is CUMULATIVE. It includes:
- host onboarding completion / real photo upload / Stripe onboarding work
- government ID + selfie removed as a default booking gate
- cleaned email-verification UI
- this booking-flow cleanup

THIS PASS IS PRESENTATION / FLOW ONLY

No payment routing, application-fee logic, Stripe direct-charge creation,
tax calculation, webhook confirmation, reservation locking, calendar conversion,
refund rules, checkout-token security or pricing calculations are changed.

CHECKOUT IMPROVEMENTS

1. Clear four-step progress
   Details → Verify → Review → Pay

2. Hold visibility
   - reservation confirmation code remains visible
   - the guest sees the remaining hold time
   - the timer is display-only; server/database expiration remains authoritative

3. Email verification
   - remains required
   - government ID is not shown in the normal disabled-identity flow
   - already-verified/resumed holds automatically move forward

4. Inline policies
   - host policies expand inline in a compact, height-capped section
   - Find A Place booking terms summary expands inline
   - full policy PDF / terms / cancellation / privacy documents remain linked
   - existing /api/booking/policies/open evidence is still recorded
   - existing acceptance endpoint/version snapshots are unchanged
   - both review sections and the agreement checkbox are still required

5. Payment
   - same Stripe Payment Element
   - same connected-account context
   - same PaymentIntent route and webhook finalization
   - clearer "Final step / Pay securely" presentation
   - booking total remains in the sticky summary

6. Confirmation
   - clearer confirmed state
   - confirmation number, dates and total are prominent
   - My Trip remains the post-booking management destination
   - detailed receipt remains intact
   - duplicate in-component My Trip CTA removed; page-level CTA remains

FILES CHANGED BY THIS PASS
- components/GuestCheckout.tsx
- components/GuestCheckout.module.css
- components/GuestPolicyAcceptance.tsx
- components/GuestPolicyAcceptance.module.css
- components/BookingConfirmation.tsx
- components/BookingConfirmation.module.css

NO NEW DATABASE MIGRATION REQUIRED FOR THIS PASS.

RECOMMENDED REGRESSION TEST

1. Choose a published stay and dates.
2. Fill guest info, extras/promo as applicable.
3. Create the hold and verify the countdown appears.
4. Verify email.
5. Confirm it moves directly to Review & Agree.
6. Expand Host property policies; verify no page-width/layout jump.
7. Expand Find A Place booking terms; verify links remain accessible.
8. Confirm the agreement stays disabled until both sections are reviewed.
9. Agree and continue.
10. Confirm the existing Stripe Payment Element loads.
11. Complete a Stripe test payment.
12. Confirm the webhook finalizes the reservation/calendar exactly as before.
13. Confirm the final page shows booking code, dates, total, receipt and My Trip.
14. Repeat on mobile width.
15. Resume a held checkout URL and confirm the correct stage is recovered.
