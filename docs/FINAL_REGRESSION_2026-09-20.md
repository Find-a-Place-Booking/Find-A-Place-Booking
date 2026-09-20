# Find A Place Booking — Final regression pass

This pass is intentionally narrow. It does not change the known-good Stripe
PaymentIntent/destination-charge path, 5%/7% commission basis, tax math,
processor-fee recovery, or webhook ownership of booking confirmation.

## Fixed

- **Partial-refund payout deadlock:** a successful partial refund changes the
  local payment state to `PARTIALLY_REFUNDED`. The payout scheduler now treats
  that as a settled payment and pays the already-reduced host proceeds instead
  of retrying forever.
- **Transient Stripe schedule checks no longer poison account readiness:** the
  hourly payout guard still records a schedule error, but does not downgrade a
  valid payment account to `PENDING`. Initial/account-sync readiness and every
  actual payout still fail closed unless Stripe confirms manual payouts.
- **Pet policy enforcement at the server boundary:** pet bookings now require
  the unit's `pets-allowed` policy and respect its configured `max_pets`.
- **Add-on injection guard:** guest-submitted add-ons must belong to the booked
  unit, be active, and be guest-visible. Unknown, hidden, duplicate, or null
  selections are rejected instead of being silently ignored.
- **Internal email routing:** refund, payout-failure, and dispute alerts now link
  staff to `/admin/reservations/...`; host emails still link to host pages.
- **Schema health:** `/api/health/supabase` now proves the transactional-email
  outbox columns and migration 049 are present.

## Runtime regression matrix

1. New host / existing host dashboard still loads.
2. Rates & fees: test all three pet fee modes in Pricing preview.
3. Published pet-friendly property: book at/under max pets; confirm quote/hold.
4. Same property: request over max pets; hold must fail before Stripe.
5. Non-pet property: request one pet; hold must fail before Stripe.
6. Full TEST booking with local Stripe webhook running: HOLD → email → Identity
   → policies → PaymentIntent → webhook → CONFIRMED → trip.
7. Cancellation before cutoff: full refund and payout cancellation/reduction.
8. Partial refund on a confirmed booking: payout stays eligible for the reduced
   amount rather than entering endless RETRY.
9. Cancellation at/inside 14 days remains blocked for ordinary guest flow.
10. Host Calendar: Test connection / Sync now / empty-feed preservation.
11. `/api/health/supabase` returns `ok: true` and
    `final_regression_schema: final-regression-049-v1`.
12. `npm run typecheck`, `npm run build`, and `npm audit` all clean.

## Known configuration item

The Mapbox browser error seen in local development is still an environment
configuration issue (`NEXT_PUBLIC_MAPBOX_TOKEN`), not a booking-flow error.
