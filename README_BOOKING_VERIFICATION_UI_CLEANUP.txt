Find A Place Booking — Booking Verification UI Cleanup

This package is cumulative and includes:
- host onboarding completion fixes
- guest government-ID gate removal by default
- booking verification UI cleanup

WHAT THIS UI PASS CHANGES

- Removes the visible two-step email + identity progress box in the normal
  booking experience.
- Reworks the verification card into a cleaner one-step email verification UI.
- Updates heading/copy so the page clearly explains that the guest is verifying
  their email before payment.
- Keeps the identity-verification code path available behind the existing
  BOOKING_IDENTITY_VERIFICATION_REQUIRED flag, but hides it from the normal
  flow where the flag is off.
- Updates the hold banner/button wording to fit the revised flow.

FILES ADDED / UPDATED
- components/GuestVerification.tsx
- components/GuestVerification.module.css
- components/GuestCheckout.tsx

NO DATABASE MIGRATION REQUIRED
This is a presentational/code-flow cleanup only.
