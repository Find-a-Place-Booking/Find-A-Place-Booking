FIND A PLACE BOOKING - EMBEDDED STRIPE AUTH FIX

Apply this AFTER the embedded Stripe overlay.

Extract into the ROOT of the Find A Place Booking project and replace matching
files.

Replaced:
- lib/payments/stripe-rest.ts
- app/api/stripe/connect/account-session/route.ts
- components/payments/EmbeddedStripeOnboarding.tsx

Added:
- docs/STRIPE_EMBEDDED_AUTH_FIX.md

Then completely restart Next:

Ctrl+C
npm run dev

Open:
http://localhost:3000/host/payments

Click:
Connect Stripe

If the earlier sandbox overlay already created an incompatible Stripe test
account, this patch will replace that local provider reference with a new
fully-embedded test account automatically.

No new npm package is required beyond the Stripe Connect packages already
installed for the embedded overlay.
