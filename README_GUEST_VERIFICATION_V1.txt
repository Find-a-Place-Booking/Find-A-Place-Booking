FIND A PLACE BOOKING — GUEST VERIFICATION PASS 1
=================================================

Scope
-----
This pass adds the first guest-security layer before Stripe payment:

1. Phone number is required, but NOT SMS-verified.
2. Booking email must be verified with a six-digit code.
3. Guest must complete Stripe Identity document + matching-selfie verification.
4. The payment endpoint re-checks all three requirements server-side before a
   Stripe PaymentIntent can be created or recovered.
5. Stripe Identity is treated as a Find A Place platform expense. It does NOT
   increase the guest total and does NOT reduce host proceeds.
6. The host's normal booking-confirmation email now includes the guest email,
   phone number, email-verification status and Stripe Identity verification
   status. It never includes ID images, ID numbers, DOB or selfie data.

Explicitly unchanged
--------------------
- lodging/tax calculations
- 5% / 7% commission calculation
- Stripe destination-charge routing
- application-fee calculation
- host processing-fee recovery
- host proceeds
- Stripe payment confirmation/webhook logic
- refund logic
- calendar availability logic

New external services / keys
----------------------------
NONE.

Email codes reuse the existing Resend integration.
Stripe Identity reuses the existing Stripe secret + publishable keys.
No Twilio or SMS provider is used.

Stripe Identity account setup
-----------------------------
Stripe Identity must be enabled/activated for the same Stripe platform account.
Stripe may require the Identity application/terms to be completed in the
Dashboard before live verification is allowed.

The code defaults the internal live Identity expense to 150 cents per verified
reservation. TEST reservations record zero cost. If Stripe pricing changes,
set this optional environment variable:

STRIPE_IDENTITY_COST_CENTS=150

That value is reporting/accounting metadata only. It never changes the booking
split sent to the host.

Files added
-----------
app/api/booking/verification/email/send/route.ts
app/api/booking/verification/email/confirm/route.ts
app/api/booking/verification/identity/session/route.ts
app/api/booking/verification/status/route.ts
components/GuestVerification.tsx
components/GuestVerification.module.css
lib/bookings/guest-verification.ts
lib/notifications/guest-verification-email.ts
supabase/migrations/20260918004300_guest_verification_foundation.sql

Existing files replaced
-----------------------
app/api/booking/hold/route.ts
app/api/booking/payment-intent/route.ts
components/GuestCheckout.tsx
lib/notifications/reservation-emails.ts

These replacements were built on the post-tax flow: the hold route continues to
call create_guest_taxed_reservation_hold and GuestCheckout keeps the tax total.

Apply
-----
1. Extract this ZIP directly over:

C:\Users\jlccu\find-a-place-booking-production-step-1

and replace the matching files.

2. Before testing the updated app, preview the database migration:

npx supabase db push --dry-run

Expected new migration only:

20260918004300_guest_verification_foundation.sql

If older migrations unexpectedly appear, STOP instead of approving them.

3. If the dry run only shows 043:

npx supabase db push

4. Validate the app:

npm run typecheck
npm run build

5. Start local testing:

npm run dev

Test flow
---------
1. Pick dates and open checkout.
2. Enter legal name, email AND phone. Phone is required but receives no text.
3. Continue to verification.
4. Enter the email code.
   - If RESEND_API_KEY is configured, it arrives by email.
   - In Stripe TEST mode only, if Resend is not configured, the test code is
     shown in the verification UI and logged to the dev server.
5. Open Stripe Identity and complete the document + matching-selfie flow.
6. The Stripe Payment Element should appear only after both checks are verified.
7. Complete the normal Stripe test payment.
8. Confirm the host booking email shows:
   - guest name
   - verified booking email
   - required phone number
   - "Verified by Stripe Identity"

Privacy boundary
----------------
Find A Place stores the Stripe VerificationSession ID, status and verification
timestamp. It does not store the guest's ID image, ID number, DOB or selfie.
Hosts receive only the guest's normal booking contact information and the
verification result.
