Find A Place Booking — Mobile Checkout Clean Overlay

Drop the included components/GuestCheckout.module.css over the same file in the repo.

What this changes:
- Mobile checkout form stays ABOVE the large booking summary.
- Removes the large property image from the mobile checkout summary.
- Tightens spacing/cards so checkout feels like a payment flow instead of a long landing page.
- Makes Name / Email / Phone / Promo inputs 16px on mobile to prevent iOS input zoom.
- Makes Reserve and Pay buttons larger and easier to tap.
- Makes add-ons easier to tap without taking over the whole screen.
- Compresses the three security/trust messages into two compact rows.
- Cleans the held-reservation and Stripe payment sections on small screens.
- Adds safe-area bottom spacing for iPhones.

Deliberately NOT changed:
- /api/booking/hold
- /api/booking/payment-intent
- Stripe confirmPayment behavior
- reservation/payment state logic
- Supabase
- taxes
- calendars/PMS integrations
- webhooks

Baseline:
- GitHub main commit e0bc03a1c99cce20861085cc99d3fbc62a5e7a8d ("Checkout Security")
- Original GuestCheckout.module.css blob SHA b9d5348d69ed3b47b8f6fdd94a58e0d8812e4418

The GitHub connector in this chat has read access but returned 403 for repository writes, so this is packaged as a drop-in overlay rather than claiming it was pushed.
