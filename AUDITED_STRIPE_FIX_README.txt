FIND A PLACE BOOKING — AUDITED STRIPE EMBEDDED FIX

This replaces the earlier Stripe account-creation patches.

Extract into the project root and replace matching files.

Replaced:
- lib/payments/stripe-rest.ts
- lib/payments/sync-stripe-account.ts
- app/api/stripe/connect/account-session/route.ts

Added:
- docs/STRIPE_INTEGRATION_AUDIT.md

No new npm install is required if the embedded Connect packages are already installed.

Then:
Ctrl+C
npm run typecheck
npm run build
npm run dev

Open:
http://localhost:3000/host/payments

Click:
Connect Stripe

This is still SANDBOX ONLY. Because earlier test patches may have stored bad test
account references, the route will create one clean Accounts v2 recipient account
when it sees an old schema marker.

Do not carry automatic test-account replacement into live mode.
