FIND A PLACE BOOKING - STRIPE CONNECT SANDBOX OVERLAY

Extract this ZIP into the ROOT of the Find A Place Booking project and allow it
to replace matching files.

Files replaced:
- app/host/payments/page.tsx
- lib/payments/provider.ts
- lib/payments/stripe.ts

Files added:
- app/host/payments/actions.ts
- app/host/payments/stripe/return/route.ts
- app/host/payments/stripe/refresh/route.ts
- app/api/stripe/webhook/route.ts
- lib/payments/stripe-api.ts
- lib/payments/sync-stripe-account.ts
- lib/supabase/admin.ts
- docs/STRIPE_SANDBOX_INTEGRATION.md

No npm package is required. The integration uses Stripe's HTTPS API directly and
Node's built-in crypto module for webhook signature verification.

After extracting:
1) npm run typecheck
2) npm run build
3) start the site
4) sign in as a host and open /host/payments
5) click Connect Stripe

Before webhook testing, add a server-only Supabase key:
SUPABASE_SECRET_KEY=...  OR  SUPABASE_SERVICE_ROLE_KEY=...

Do not use live Stripe keys during this test pass.
