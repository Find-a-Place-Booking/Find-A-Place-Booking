# Find A Place Booking: Guest booking and availability review

Audited November 5, 2026 (America/Chicago) against GitHub main and read-only production data. This report does not constitute a live Stripe charge or a successful authenticated checkout test.

## What the code currently protects

- Property date selection (`components/BookingCard.tsx`) performs a preliminary live availability request. It handles rapid changes with AbortController. Interrupted requests can be logged as network errors, so telemetry counts should not automatically be interpreted as completed booking failures.
- `/api/booking/hold` checks required guest name, email and phone, valid guest count, pet permissions and Cloudflare Turnstile before a hold. It refreshes connected calendars and checks ThinkReservations / ResNexus readiness. It does not skip verification to create a hold.
- `/api/booking/payment-intent` checks payment account readiness, guest verification and accepted policies, confirmed taxes, live calendar updates, ResNexus readiness and conflicting active blocks before initiating payment.
- Date/guest context flows from property booking card into `/checkout`. The checkout page exposes estimated totals before contact details and payment. Airbnb comparison is optional and fails closed without affecting payment.
- Existing 7% guest-paid fee integration is outside this overlay. This ZIP makes no change to fees, Stripe or reservation snapshots.

## Production findings requiring attention

1. **Urgent, host action: Fancy Hill ResNexus needs new credentials.** Ten active RESNEXUS calendar connections are currently in ERROR, with a shared rejection message: "ResNexus did not accept the saved login. Replace the login/password in Find A Place." Last successful sync was October 30, 2026. The other 48 active calendar connections currently show HEALTHY. The relevant host control is `/host/integrations/resnexus`, under **Replace ResNexus login or change sync frequency**. The host should enter their current credentials, reconnect, check resource mappings and verify a fresh successful sync. Do **not** force availability open or bypass the existing fail-closed checks while the account is disconnected.
2. A large number of observed availability `network_error` records (696 over the preceding 14 days, 608 tracked attempts) may include harmless aborted requests on rapid date changes; the current React code cancels prior availability calls. These metrics cannot establish failed customer bookings. There were 13 hold failures over the period concentrated in one tracked attempt; that one attempt should be investigated via production logs and user feedback before changing booking logic.
3. Production Vercel runtime-error endpoint returned 403 to the connected integration, so an authenticated runtime stack-trace review was not possible from this audit.
4. A complete controlled test of actual guest payment, successful hold, confirmation email, calendar export and refund requires an approved TEST-mode checkout and credentialed accounts; do not create a real-money production booking just to audit.

## Suggested manual smoke-test checklist after deployment

- Search Buffalo National River with 15, 40 and 60 mile radii. Ensure results are geographically plausible, no fake stays, and small towns appear.
- Click **Unique stays** and **Sleeps 8+**, verify results are what the listing types actually describe; confirm RV sites with 25-person capacities are not labeled group cabins.
- Navigate on mobile and desktop from Home > Find a stay > stay detail > choose dates > checkout. Confirm guest count, dates, taxes and 7% service fee are visible before payment.
- Validate an unavailable date cannot proceed; change dates and repeat; verify Turnstile retry if it expires; check errors remain understandable.
- In TEST mode, complete one authorized booking, confirm notifications, blocked dates, and the same fee applied consistently. Cancel test booking and check block release according to policy.
- Sign in as a host and use For hosts dropdown / mobile Property managers link. Check host management navigation does not expose private property data to unauthed guests.
- Restore Fancy Hill ResNexus credentials first, then test a currently affected property after a fresh successful sync before declaring calendar coverage healthy.

## Scope boundaries

This overlay changes only discovery, regional search, property-manager information and public navigation. No database migrations, Stripe, booking holds, calendar connectors, taxes, payouts or authentication behavior are changed. The existing host onboarding/publishing, property descriptions and map privacy remain unchanged.
