Find A Place Booking — First Checkout Subtotal

Drop this overlay over the project root.

Files:
- app/checkout/page.tsx
- app/checkout/CheckoutSubtotal.module.css

What changes
------------
The first checkout screen now shows a prominent stay subtotal BEFORE the guest
fills out contact information or creates a reservation hold.

The subtotal is calculated server-side with the same live `quote_unit_stay`
pricing function used by the booking system, so it includes:
- date-specific nightly lodging
- cleaning fee
- extra-guest fee when applicable
- other required unit fee lines included by the pricing engine

The initial preview intentionally does NOT pretend to be the final total. It
clearly says taxes, pet fees, optional extras and eligible promo discounts are
shown in the final total before payment.

Why this is safe
----------------
- It does NOT create a reservation or hold.
- It does NOT block inventory.
- It does NOT touch Stripe.
- It does NOT change tax calculation.
- It does NOT alter the final amount charged.
- If the price preview RPC ever fails, checkout still renders normally; the
  preview is fail-open and never becomes a booking gate.

This is deliberately a subtotal rather than an estimated tax total so the first
screen cannot show a tax figure that differs from the authoritative tax
snapshot created with the reservation hold.
