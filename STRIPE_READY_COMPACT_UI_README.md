# Stripe ready-state compact host UI

This overlay cleans up the host Payments & taxes page once Stripe is already connected and ready.

## Behavior change

When the host has a READY Stripe account with charges enabled:

- the big two-button onboarding chooser no longer stays visible
- it collapses into a compact **Manage Stripe connection** button
- clicking that button reveals a small manager panel
- from there, the host can still open Stripe's secure flow to review/update onboarding or reconnect another Stripe account if needed

When Stripe is **not** ready yet:

- the existing onboarding choices stay visible
- hosts still see:
  - **I already use Stripe**
  - **I'm new to Stripe**

## Why

This removes clutter for already-configured hosts while still keeping a clear way to reopen Stripe Connect if they ever need to refresh requirements or change accounts.

## Files

- `app/host/payments/page.tsx`
- `components/payments/EmbeddedStripeOnboarding.tsx`
- `components/payments/EmbeddedStripeOnboarding.module.css`

## Apply

Extract over the project, then run:

```powershell
npm run typecheck
npm run build
```

This patch is UI-only. It does not change:
- Stripe payment routing
- webhooks
- commission logic
- refunds
- account sync behavior
