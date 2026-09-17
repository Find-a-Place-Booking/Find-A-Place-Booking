FIND A PLACE BOOKING - STRIPE ACCOUNTS V2 FIX

The screenshots show the real problem:
Stripe is blocking POST /v1/accounts for this new Connect integration.

This patch moves connected-account creation to:
POST /v2/core/accounts

Apply this over the previous embedded Stripe patches.

Files replaced:
- lib/payments/stripe-rest.ts
- lib/payments/sync-stripe-account.ts
- app/api/stripe/connect/account-session/route.ts

Added:
- docs/STRIPE_ACCOUNTS_V2_FIX.md

No new package install is required.

After extracting into the project root:

Ctrl+C
npm run dev

Then return to:
/host/payments

Click Connect Stripe again.

Do NOT enable Accounts v1 compatibility in Stripe just to make the older code
work. This patch uses the current API that Stripe is explicitly requiring.
