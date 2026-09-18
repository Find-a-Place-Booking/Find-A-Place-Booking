# Find A Place — Canonical Booking Cleanup

This replaces the temporary `/api/booking/sandbox/*` architecture with one
booking/payment pipeline that is used in Stripe test mode now and live mode
later.

## Locked payment model

Stripe Connect Destination Charges.

For each booking:

1. Guest is charged once on the Find A Place platform.
2. Stripe immediately routes host proceeds to the connected recipient account.
3. `application_fee_amount` is retained by Find A Place.
4. Under the current `HOST_FULL` policy, the application fee is:
   - Find A Place 5% or 7% commission
   - plus configured processor-fee recovery from the host
5. Stripe debits its actual processing fee from the platform balance.
6. The database records the commission, processing recovery, actual Stripe fee,
   host proceeds, and any estimate variance separately.

The successful $4,841 sandbox charge already proved this money routing:
host connected-account balance = $4,371.94.

## Important change: webhook owns confirmation

The browser NEVER marks a reservation confirmed.

After `stripe.confirmPayment()` the guest goes to the confirmation page.
That page polls `/api/booking/status`.

Only the signed Stripe webhook calls:

`confirm_reservation_payment(...)`

That transaction:
- marks the payment succeeded;
- marks the reservation confirmed;
- converts the hold to an INTERNAL_RESERVATION block;
- consumes any reserved promotion;
- writes the append-only financial ledger;
- writes the payment success event.

This is the same architecture for test and live Stripe keys.

## Files added/replaced

New:
- `lib/payments/booking-runtime.ts`
- `lib/payments/stripe-checkout.ts`
- `app/api/booking/hold/route.ts`
- `app/api/booking/payment-intent/route.ts`
- `app/api/booking/status/route.ts`
- `components/GuestCheckout.tsx`
- `components/GuestCheckout.module.css`
- `components/BookingConfirmation.tsx`
- `supabase/migrations/20260917002300_canonical_guest_booking.sql`

Replaced:
- `app/api/stripe/webhook/route.ts`
- `app/checkout/page.tsx`
- `app/booking/confirmed/page.tsx`
- `components/BookingCard.tsx`
- `app/stays/[slug]/page.tsx`

Retired by `apply-cleanup.ps1`:
- `app/api/booking/sandbox/`
- `components/SandboxGuestCheckout.tsx`
- `components/SandboxGuestCheckout.module.css`
- `components/SandboxBookingConfirmation.tsx`
- `lib/payments/sandbox-booking.ts`
- `lib/payments/stripe-guest.ts`

Do NOT delete old SQL migration files 018–022. Applied migrations are history.
Migration 023 supersedes their runtime functions.

## Environment

Replace the old sandbox flag with:

```env
BOOKING_CHECKOUT_ENABLED=true

# Generate a long random secret, at least 32 characters.
BOOKING_GUEST_TOKEN_SECRET=replace-with-a-long-random-secret

# Test mode can default to 2.9% + 30c, but set these explicitly so the policy
# is visible and carries unchanged into deployment.
STRIPE_PROCESSING_RATE_BPS=290
STRIPE_PROCESSING_FIXED_CENTS=30
```

Keep:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`
- `STRIPE_SECRET_KEY=sk_test_...`
- Supabase server/service key.

For live mode the code refuses to silently invent processing pricing. Configure
the two processing-recovery values explicitly.

## Database

Run the entire new migration in Supabase:

`supabase/migrations/20260917002300_canonical_guest_booking.sql`

Then enable the DB booking gate:

```sql
update public.platform_runtime_flags
set allow_guest_checkout = true,
    updated_at = now()
where singleton = 1;
```

Test mode still uses Stripe test keys. This flag does not turn Stripe live.

## Stripe webhook — required now

There is deliberately no browser-side finalizer anymore.

For local testing, use Stripe CLI so the exact production webhook path is tested:

```powershell
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

The CLI prints a `whsec_...` signing secret. Put that in `.env.local`:

```env
STRIPE_WEBHOOK_SECRET=whsec_...
```

Restart `npm run dev` after changing `.env.local`.

Listen for the PaymentIntent events; the route safely ignores unrelated events.

When deployed, configure the same `/api/stripe/webhook` route in Stripe using
the deployed HTTPS URL and use its live/test endpoint signing secret.

## Apply the code overlay

Extract the ZIP into the repository root, replacing matching files.

Then run:

```powershell
powershell -ExecutionPolicy Bypass -File .\apply-cleanup.ps1
npm run typecheck
npm run build
```

Do not test a card until BOTH commands pass.

Then:

```powershell
npm run dev
```

## First clean test

1. Keep fake host connected Stripe recipient READY.
2. Start `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
3. Open the published stay.
4. Pick genuinely available dates.
5. Enter guest details.
6. Continue to Stripe Payment Element.
7. Pay with `4242 4242 4242 4242`.
8. Browser goes to confirmation.
9. Stripe webhook marks the reservation CONFIRMED.
10. Verify:
    - guest confirmation page;
    - host Reservations;
    - calendar INTERNAL_RESERVATION;
    - Stripe platform payment;
    - Stripe application fee;
    - host connected-account proceeds;
    - payments row and ledger.

## Live-money safety / tax

The payment-intent route blocks LIVE Stripe keys unless
`reservations.tax_status = 'CALCULATED'`.

That means this code can be fully tested now with test keys, but switching to
live keys alone will NOT accidentally allow untaxed lodging bookings.

A separate tax implementation/decision is still required before launch.


## V2 corrections

This V2 corrects two Stripe implementation mistakes from the first cleanup package:

- server-side Stripe calls now use the official `stripe` Node SDK (`22.4.0`) with API version `2026-07-29.dahlia`;
- `payment_method_types` is no longer hardcoded. Dynamic payment methods are left to Stripe/Dashboard configuration.

The raw PaymentIntent + Payment Element path is retained intentionally because Find A Place owns reservation, availability, promotion and tax state independently of Stripe. Destination-charge routing is unchanged from the already-successful split test.

Install the SDK before typecheck/build:

```powershell
npm install stripe@22.4.0
powershell -ExecutionPolicy Bypass -File .\apply-cleanup.ps1
npm run typecheck
npm run build
```

The final route list must include `/api/booking/hold`, `/api/booking/payment-intent`, `/api/booking/status`, and `/api/stripe/webhook`, and must contain no `/api/booking/sandbox/*` routes.
