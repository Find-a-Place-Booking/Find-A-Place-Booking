FIND A PLACE — SANDBOX BOOKING RECOVERY / REFRESH FIX (V5)

This fixes the structural problem that caused a sandbox booking to disappear
when the checkout page was refreshed.

Before:
- reservation ID lived in React/session/cookie state
- payment-intent/status/finalize routes depended on the temporary browser cookie
- refreshing the page could make the UI lose the booking even though the
  reservation and successful Stripe PaymentIntent still existed

Now:
- the canonical reservation UUID is written into the checkout URL immediately
  after a hold is created
- refreshing /checkout keeps the reservationId
- checkout automatically loads the reservation status
- if Stripe already succeeded, checkout automatically retries FINALIZATION only
  (it does not create another charge)
- if Stripe has not succeeded, checkout resumes the existing PaymentIntent
- finalizer verifies Stripe PaymentIntent metadata against reservation + payment
  server-side before confirming
- status/payment-intent/finalize no longer rely on the fragile temporary cookie
- confirmation page also receives reservationId in its URL, so refresh works

CURRENT SUCCESSFUL PAYMENT RECOVERY

After applying the 022 zero-processor-fee SQL hotfix and this patch, open:

http://localhost:3000/checkout?stay=pine-hollow-ridge-cabin&checkIn=2026-09-21&checkOut=2026-09-30&guests=2&reservationId=190b71f5-a9aa-481f-b7bc-560a9a392d4d

Do NOT pay again.

The page should:
1. find the existing reservation
2. retrieve the existing Stripe PaymentIntent
3. see that Stripe already succeeded
4. run database finalization
5. redirect to the confirmation page

The known confirmation code for this sandbox reservation is AF24A2294A.

FILES REPLACED
- app/api/booking/sandbox/finalize/route.ts
- app/api/booking/sandbox/payment-intent/route.ts
- app/api/booking/sandbox/status/route.ts
- components/SandboxGuestCheckout.tsx
- app/checkout/page.tsx
- components/SandboxBookingConfirmation.tsx
- app/booking/confirmed/page.tsx

No new SQL is included in this V5 UI/recovery patch. The existing 022 SQL hotfix
must already be applied.

After extracting:
npm run typecheck
npm run build
npm run dev
