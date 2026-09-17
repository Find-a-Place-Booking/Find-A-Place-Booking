FIND A PLACE — STRIPE STATUS SYNC FIX

What the current screen means:
- the connected Stripe account WAS created
- Find A Place has one payment account row
- the local row is still PENDING / payouts pending

The current embedded component only reloads the page when Stripe onboarding exits.
It does not ask Stripe for the latest account capability state first, so the UI
can stay stale even after the test onboarding was completed.

This patch adds:
POST /api/stripe/connect/sync

On Stripe onboarding exit the browser now:
1. asks the server to retrieve the connected account from Stripe
2. runs syncStripePaymentAccount(...)
3. updates payment_accounts
4. reloads /host/payments

If Stripe says transfers and payouts are active, the page should then show READY.
If Stripe still has requirements, it correctly stays PENDING.

This is an immediate UX/status sync. A Stripe webhook is still needed before live
launch because account requirements/status can change later without the host
being on this page.

Files:
- app/api/stripe/connect/sync/route.ts
- components/payments/EmbeddedStripeOnboarding.tsx

Apply over project root, then:
Ctrl+C
npm run typecheck
npm run build
npm run dev
