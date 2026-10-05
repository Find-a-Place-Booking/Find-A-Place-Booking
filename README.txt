Find A Place Booking — Date Carryover Overlay

Drop this over the project root.

Replaces:
- components/BookingCard.tsx

What it fixes:
- When a guest searches dates/guest count on the home page, goes to /stays,
  and then selects a property, the booking card now restores that same
  check-in, check-out, and guest count from the existing results-page journey state.
- If a property URL already contains checkin/checkout/guests, those values win.
- This also covers property selections made from the results map because the
  results page already records the clicked stay and the full search-results URL.
- When the guest presses "Reserve these dates", the existing checkout route
  receives those restored values as checkIn/checkOut/guests.

This does NOT change:
- availability rules
- reservation holds
- Stripe/payment logic
- taxes
- calendar syncing
- booking confirmation
