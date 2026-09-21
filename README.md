# Find A Place Booking

Production booking marketplace for Find A Place.

## Current pilot baseline

The repository includes the guest marketplace, host portal, admin workspace, iCal calendar synchronization, Stripe Connect destination charges, guest verification, policy acceptance, transactional email, scheduled payouts, refunds, marketplace lodging-tax accounting, and operational reporting.

Apply Supabase migrations through:

`supabase/migrations/20260920005000_restore_live_safety_hardening.sql`

## Local verification

```bash
npm ci
npm run typecheck
npm run build
```

## Live checkout gates

Live checkout should only be enabled after the production environment is configured with matching Stripe live keys, signed webhooks, Turnstile, transactional email, CRON_SECRET, the guest token secret, a ready host payout account, verified property tax configuration, and the per-property live checkout switch.

The payment architecture uses Stripe destination charges. Find A Place retains the platform commission, configured host processing-fee recovery, and marketplace-collected lodging tax in the application fee; the remaining booking proceeds are routed to the connected host account. Scheduled bank payouts remain controlled separately by the payout policy.

## Operations

Vercel cron routes handle calendar synchronization, notification retries, and scheduled payouts. The protected Supabase health endpoint verifies the current migration markers for operations use.
