# Stripe ready-state slim UI

This is a visual cleanup only.

When Stripe is already READY + charges enabled, the provider section now becomes
a thin, aligned row instead of a second large status panel.

Collapsed:
- Stripe Connect · Connected
- one short status sentence
- small `Manage Stripe` dropdown button

Expanded:
- one short helper sentence
- `Open Stripe`
- `Close`

The existing larger payment-status card above remains the main readiness/status
display, so this section no longer repeats the same message several times.

Hosts who are not ready still see the existing two onboarding buttons.

No payment, webhook, refund, commission, direct-charge, payment-account sync or
Stripe routing logic is changed.

Run:

```powershell
npm run typecheck
npm run build
```
