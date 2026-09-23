Find A Place Booking — Guest ID Gate Removed

This overlay is CUMULATIVE with the host-onboarding completion overlay.
It includes the onboarding fixes plus the guest-verification change below.

CURRENT BOOKING GATE

Required:
- guest name
- phone number present
- email verification code
- booking/property policy acceptance
- Stripe payment

NOT required by default:
- government photo ID
- matching selfie

WHY THE IDENTITY CODE IS STILL PRESENT

The Stripe Identity route, reservation columns, status mapping and UI path are
intentionally preserved. Find A Place can restore the previous government-ID +
selfie gate later without changing the database schema.

To restore the previous behavior:

BOOKING_IDENTITY_VERIFICATION_REQUIRED=true

Then redeploy.

When the variable is absent or false:
- email verification completes guest verification;
- payment-intent creation is NOT blocked by identity status;
- the checkout UI does not present an identity step;
- the Stripe Identity session endpoint refuses to create a session, preventing
  accidental verification charges while the feature is disabled;
- old reservations that already contain identity data remain intact.

NO DATABASE MIGRATION IS REQUIRED for the ID-gate change.

The earlier onboarding migration included in this ZIP,
20260923093934_onboarding_real_photos_and_finalization.sql,
has already been applied to the current production Supabase project.

IDENTITY-GATE FILES
- lib/bookings/guest-verification.ts
- app/api/booking/verification/status/route.ts
- app/api/booking/verification/identity/session/route.ts
- components/GuestVerification.tsx
- components/GuestCheckout.tsx

RECOMMENDED BOOKING REGRESSION TEST
1. Start a new reservation.
2. Enter guest name, email and phone.
3. Complete Turnstile / create the hold.
4. Confirm only the email-code step is shown.
5. Verify the email.
6. Confirm checkout moves directly to policy acceptance.
7. Open/accept the required policies.
8. Confirm Stripe Payment Element loads without any ID/selfie request.
9. Complete a test payment.
10. Confirm webhook -> CONFIRMED reservation and calendar conversion still work.
11. Resume a held booking from its checkout URL and confirm it also skips ID.
12. Optional: set BOOKING_IDENTITY_VERIFICATION_REQUIRED=true in a nonproduction
    environment and verify the old Stripe Identity step returns.
