FIND A PLACE — STRIPE IDEMPOTENCY FIX

The current error is NOT another account-configuration error.

Stripe accepted the idempotency key on an earlier request. We then changed the
request payload but reused the same idempotency key, which Stripe correctly
rejects.

This patch makes the account-creation idempotency key a SHA-256 fingerprint of:
- the host organization ID
- the exact Accounts v2 request payload

Result:
- exact retry => same key
- changed payload => new key
- different host organization => new key

Files replaced:
- lib/payments/stripe-rest.ts
- app/api/stripe/connect/account-session/route.ts

Apply to project root, then:

Ctrl+C
npm run typecheck
npm run build
npm run dev

Then click Connect Stripe again.
