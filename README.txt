Find A Place Booking — Checkout Logo Release Overlay

Drop this over the project root.

Files:
- components/CheckoutBrandExit.tsx
- app/checkout/page.tsx

Fix:
The regular Find A Place logo was a plain Link to "/". Once a reservation hold
had been created, clicking that logo navigated home without calling the
checkout release endpoint, so the dates stayed blocked until the hold expired.

The active checkout header now uses CheckoutBrandExit. It:
- checks the checkout URL for reservationId + checkoutToken
- calls the existing /api/booking/release endpoint
- lets the server safely cancel any unfinished Stripe PaymentIntent first
- releases the INTERNAL_HOLD
- then navigates home

The existing "Edit dates or guests" exit behavior is unchanged.

It intentionally does NOT release holds on generic pagehide/visibility changes,
because mobile browsers can fire those when the app is backgrounded.
