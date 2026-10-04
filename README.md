# Find A Place Booking — minimum-stay + verification funnel fix

## 1. Minimum-stay selection
The public availability response now includes:
- the unit's default minimum stay
- active date-specific minimum-stay rules

The guest date picker resolves the same arrival-date rule precedence used by
`resolve_unit_pricing_days()` / `quote_unit_stay()`:
1. higher priority first
2. narrower matching date range first
3. newest rule as the final tie breaker

Behavior:
- check-in dates that cannot satisfy their required minimum before a blocked
  night are disabled
- checkout dates shorter than the arrival-date minimum are disabled
- the guest sees the exact minimum and earliest valid checkout
- for minimum stays over 1 night, selecting check-in automatically selects the
  earliest valid checkout; the guest can still extend the stay

Example verified against current Lil' Rustic data:
- base minimum: 2 nights
- Christmas rule Dec 23, 2026–Jan 4, 2027: 3 nights
- selecting Dec 25 now resolves to a 3-night minimum and earliest checkout
  Dec 28, so the guest cannot reach checkout with Dec 25–27.

The server-side hold/quote validation remains unchanged and authoritative.

## 2. Email verification rework
Email verification is no longer a hard pre-payment gate by default.

Current funnel evidence since the email-code system was introduced:
- 7 holds created an email-verification row
- 4 expired unverified before payment
- 3 verified
- only 2 of the verified holds reached payment

The abandoned rows had no email-send error recorded; the stall was after the
code was sent.

What changes:
- phone number remains required
- email format validation remains required in `/api/booking/hold`
- policy acceptance remains required
- Stripe/payment readiness checks remain unchanged
- identity verification remains optional/off by default as before
- email-code infrastructure is preserved

To restore the old email-code gate later:
`BOOKING_EMAIL_VERIFICATION_REQUIRED=true`

With the variable absent/false, `reservationVerificationReadiness()` allows
checkout to proceed without waiting for a six-digit email code.

## Files
- `app/api/booking/availability/route.ts`
- `components/AvailabilityDatePicker.tsx`
- `lib/bookings/guest-verification.ts`

No database migration is required.
