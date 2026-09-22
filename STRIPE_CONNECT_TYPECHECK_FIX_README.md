# Stripe Connect + TypeScript Fix

Fixes the two reported TypeScript errors without restoring platform-fee refunds.

## TypeScript
- `createConnectedRefund()` now exposes a stable union return type so existing
  admin code compiles even though the current policy always returns
  `NOT_REQUIRED`.
- `reconcileApplicationFeeRefund()` keeps a compatible `{ id }` return type for
  legacy callers, but always throws because Find A Place commission is
  non-refundable.

The database migration 064 still enforces `platform_fee_refund_cents = 0`, so
the legacy application-fee-refund branch cannot become a valid payment path.

## Stripe host connection
The existing embedded Connect flow is retained. Stripe user authentication is
explicitly enabled for account onboarding.

The host now sees:
- **I already use Stripe** — sign in with Stripe. Stripe's networked onboarding
  can reuse eligible verified business information and avoid repeat
  verification.
- **I'm new to Stripe** — create and complete the Stripe account through the
  same embedded onboarding flow.

Stripe, not Find A Place, decides whether any outstanding compliance or
verification information still has to be confirmed.

This does NOT add a second payment architecture or OAuth branch. Both choices
end in the same Accounts v2 merchant / DIRECT-charge model already tested by
Find A Place.

After extracting:

```powershell
npm run typecheck
npm run build
```

No new Supabase migration is included in this overlay.
