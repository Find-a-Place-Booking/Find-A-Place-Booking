# Find A Place Booking — Booking Journey Tracking Overlay

This overlay adds durable guest booking funnel tracking without changing the existing booking/payment routing.

## What it tracks

- Stay page viewed
- Availability API requested / succeeded / failed
- Calendar date clicks
- Checkout CTA clicks
- Checkout page viewed
- First interaction with each checkout field (field label/type only, never values)
- Hold requested / created / failed
- Turnstile/security endpoint failures
- Verification status, code sends, code confirmation, identity start/failure
- Policy status, host policy open, platform terms open, policy acceptance
- PaymentIntent requested / ready / failed
- Pay button clicks
- Booking status polling
- Confirmation page viewed
- Booking confirmed
- Any visible booking/checkout error rendered in the page
- Page exit and time spent on the current booking page
- Final reservation/payment state mirrored from the database even if the browser closes

## Privacy

The funnel does not store guest name, email, phone number, card data, verification codes, checkout tokens, Turnstile tokens, or Stripe client secrets.

## Admin

Open `/admin/booking-health`.

You get:
- 7-day funnel counts
- Possible drop-offs after 10 minutes of inactivity
- Error/failure groups
- Recent attempts
- A per-attempt timeline showing every tracked step

## Database

The two migrations in this overlay have already been applied to the live Supabase project during the debugging session. Keep the migration files in the repo so schema history matches production.

## Deployment

Overlay these files at the repo root and deploy normally.
