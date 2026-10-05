# Find A Place Booking — checkout trust & conversion test overlay

Baseline: GitHub `main` commit `4659db18dcad410f8ff20cc84a5db8010f552190`.

This is a **presentation-only checkout test overlay**. It does not modify Supabase, Stripe backend code, booking routes, tax logic, calendar logic, reservation state transitions, or webhook handling.

## What changed

- Makes **Secure checkout** visible at the top of the guest checkout.
- Adds small trust cues: dates checked before payment + Stripe payment processing.
- Makes the pre-hold message explicitly say **No charge yet**.
- Makes a successful hold feel like progress: **Your dates are reserved** + calm hold timer.
- Keeps the existing `Reserve → Pay` visual progression.
- Strengthens the final payment screen with **Your payment is secure** before the Stripe Payment Element.
- Final CTA becomes `Pay $X & confirm stay`, tying the payment action to the confirmed stay.
- Adds a small `Get help` link beside payment for guests who need reassurance before booking.
- Keeps property/date/guest/price visible, adds **Dates held for you**, and strengthens the final-total callout.
- Listing booking card reinforces **ready to reserve**, **no charge yet**, and secure Stripe checkout after dates are selected.

## Deliberately unchanged

- `/api/booking/hold`
- `/api/booking/payment-intent`
- Stripe Connect/direct-charge configuration
- `stripe.confirmPayment(...)` behavior
- Stripe Payment Element/payment-method configuration
- Turnstile
- verification readiness
- policy-open / policy-accept requirements
- calendar/PMS refreshes and availability checks
- tax calculation
- commissions/application fees
- webhook processing
- reservation/payment statuses

## Important

This overlay still does **not** show `Reserve for $X` on the listing page. The pre-hold estimate needs to be reconciled with the authoritative live tax calculation first; until then the exact guest total is emphasized only after the canonical booking hold returns it.

## Files

- `components/GuestCheckout.tsx`
- `components/GuestCheckout.module.css`
- `components/BookingCard.tsx`
