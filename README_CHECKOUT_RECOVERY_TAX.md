# Checkout recovery + tax overlay

## Already applied live in Supabase

The database side was applied and rollback-tested before this overlay was packaged.

### Tax behavior
- Automatic statewide rules are always evaluated.
- Arkansas LIVE checkout is hard-guarded to require both the 6.5% state sales rule and the 2% tourism rule in the final tax snapshot.
- Arkansas now gets both 6.5% state sales tax and 2% tourism tax by default.
- If a certified host already has a clearly matching statewide line, that specific host line overrides the matching automatic rule rather than being added twice.
- Host local/custom taxes stack on top.
- Tax money still settles to the host's connected Stripe charge; Find A Place does not retain it.

### Hold/recovery behavior
- New guest holds remain 20 minutes.
- Payment can still extend the hold through the existing payment-intent flow.
- Clicking "Edit dates or guests" explicitly releases an unpaid hold.
- An open Stripe PaymentIntent is cancelled before dates are released.
- Expired/released checkouts can be restored for up to 24 hours if the same dates are still available.
- Recovery reuses the SAME reservation row and confirmation code.
- The recovery link puts the dates back on a fresh 20-minute hold and recalculates taxes.
- Paid or processing reservations can never be released/reopened by this recovery path.

### Recovery email
- One email maximum per reservation.
- It can send before expiry only after the tracker recorded a page exit and the session stayed inactive.
- Otherwise it sends after expiration.
- It contains the same confirmation/reference number and a signed recovery link.
- Clicking the link resumes the active hold, or recreates the hold on the same reservation if the dates remain available.
- If another guest has taken the dates, recovery fails closed and returns the guest to the stay.

## Files in this overlay
- `app/api/booking/release/route.ts`
- `app/checkout/recover/route.ts`
- `app/api/cron/checkout-recovery/route.ts`
- `components/CheckoutExitLink.tsx`
- `lib/bookings/checkout-recovery.ts`
- `lib/notifications/checkout-recovery.ts`
- `lib/payments/stripe-checkout.ts`
- `app/checkout/page.tsx`
- `vercel.json`
- three Supabase migration files (included so repo history matches production)

No Stripe charge creation, webhook confirmation, commission calculation, calendar sync, PMS integration, or existing booking confirmation logic was replaced.

## Build correction

The first packaged overlay referenced a non-existent
`recordBookingEventForReservation` helper in two new routes. That would break
the Next.js build. This corrected overlay removes that invalid import/call.
No live booking/payment logic depends on that helper.
