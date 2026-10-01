# Find A Place Booking — Checkout visibility + funnel analytics polish

This package is based on current `main` commit:

`e3089a833b9f8f2a041ae1a2f31ad1a223078d10`

It does **not** change the guest booking navigation, reservation creation,
Stripe direct-charge flow, webhook confirmation flow, commission math,
availability locking, or payout behavior.

## What changes

### Guest checkout view

Before a guest enters name/email/phone, the same checkout page now shows a
read-only estimate with:

- lodging
- promotion discount
- cleaning / pet / extra-guest fees
- selected extras
- estimated taxes
- estimated total

The estimate updates when pets, extras or promo code change.

The real total is still created by the existing reservation-hold function.
The estimate does not create a reservation, Stripe object or availability
block.

### Booking funnel analytics

The existing `checkout_started` event remains.

Additional Vercel custom events:

- `checkout_viewed`
- `checkout_estimate_ready`
- `checkout_details_submitted`
- `checkout_hold_created`
- `checkout_email_verified`
- `checkout_policies_accepted`
- `checkout_payment_ready`
- `checkout_payment_submitted`
- `checkout_payment_error`
- `checkout_confirmed`
- `checkout_turnstile_expired`
- `checkout_turnstile_error`

Only the stay identifier and live/test mode are attached. Names, emails,
phone numbers, reservation IDs and checkout tokens are not sent.

Private checkout pageviews remain blocked from Vercel Analytics. Custom funnel
events are rewritten to the neutral `/booking-funnel` analytics URL so private
query strings never leave the page.

### Turnstile

Guests now see whether the booking security check is:

- loading
- ready and waiting for completion
- complete
- expired
- failed

A failed check shows a retry button and a useful explanation instead of leaving
the checkout button silently disabled.

### Host tax wording

The host tax UI now makes the actual system behavior explicit:

- FAP automatically adds the configured **statewide** tax rules.
- Hosts should **not enter those statewide rates again**.
- Hosts enter only the remaining local city/county, lodging, tourism, hotel or
  A&P rates.

Important: FAP does **not** currently look up city/county tax rates
automatically. The wording intentionally does not claim that it does. That
would require a verified locality tax-rate dataset and a separate tax-engine
change.

This is especially important for Mammoth Spring because a combined tax total
must not be pasted into the local field if that total already includes the
Arkansas statewide taxes.

## Apply

1. Extract this ZIP into the repository root.
2. Double-click `APPLY_BOOKING_FLOW_POLISH.cmd` or run:
   `node scripts/apply-booking-flow-polish.mjs`
3. Run:
   - `npm run typecheck`
   - `npm run build`
4. Apply:
   `supabase/migrations/20261001173000_guest_checkout_estimate.sql`
5. Deploy normally.

The patch script stops if the expected current-file markers do not match. That
is intentional; it avoids silently mangling a newer version of the checkout.
