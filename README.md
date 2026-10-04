# Find A Place Booking — streamlined guest checkout UI

Source baseline: GitHub main at commit 1652fc3ca0778535569287578391e4570c7c7533.

This overlay intentionally changes only guest-facing presentation/components.

Changed:
- stay page CTA: `Reserve these dates`
- clear `No charge yet` reassurance
- checkout progress simplified visually from Details → Verify → Review → Pay to Reserve → Pay
- existing verification/status checks still run underneath unchanged
- existing policy review/acceptance endpoints still run unchanged
- existing hold endpoint unchanged
- existing payment-intent endpoint unchanged
- Stripe Connect/direct-charge routing unchanged
- Stripe confirmation logic unchanged
- webhook/booking confirmation logic unchanged
- final payment CTA shows the actual held reservation total, e.g. `Pay $683.73 securely`
- technical “host connected Stripe account” wording replaced with guest-friendly Stripe trust copy
- payment summary gets a stronger total callout
- header back link becomes the quieter `Edit dates or guests`
- loading language simplified

Not changed:
- Supabase
- tax calculation
- calendar refresh/availability checks
- hold creation logic
- policy enforcement
- email/identity verification feature flags
- PaymentIntent creation
- Stripe payment methods
- commissions/application fees
- reservation state transitions
- webhooks

Important:
The stay-page pre-checkout pricing estimate was NOT used for a “Reserve for $X” CTA in this overlay.
The current production `quote_guest_checkout_estimate` function is not yet aligned with the newest
state-tax reconciliation logic for every property, so displaying that estimate could show a total
that differs from the actual held reservation. This overlay waits until the authoritative hold is
created, then displays the exact total returned by the existing booking backend.

Files:
- components/BookingCard.tsx
- components/GuestCheckout.tsx
- components/GuestCheckout.module.css
- app/checkout/page.tsx
