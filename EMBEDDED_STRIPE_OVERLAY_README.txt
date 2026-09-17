FIND A PLACE BOOKING - EMBEDDED STRIPE CONNECT OVERLAY

This REPLACES the earlier redirect-based Stripe onboarding overlay.

The host stays on Find A Place. Stripe Connect onboarding is rendered directly
inside /host/payments using Stripe's embedded Connect component.

Before build, from the project root run:

npm install @stripe/connect-js @stripe/react-connect-js @stripe/stripe-js @stripe/react-stripe-js

Then extract this ZIP into the project root and allow matching files to replace.

Required sandbox environment variables:
- NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
- STRIPE_SECRET_KEY
- SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_SITE_URL

Then:
npm run typecheck
npm run build

Do NOT use the old redirect onboarding routes from the previous overlay.

This overlay intentionally keeps guest payments closed until the public guest
reservation transaction is opened safely. The next pass should use embedded
Stripe Checkout or the Payment Element, so the guest also stays on Find A Place.
