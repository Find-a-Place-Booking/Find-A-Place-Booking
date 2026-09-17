FIND A PLACE — STRIPE EMBEDDED ONBOARDING LAYOUT FIX

The Stripe integration itself is working. The layout problem came from the
existing provider-card CSS:

.payment-provider-card {
  display: grid;
  grid-template-columns: 1fr auto;
}

That caused the embedded Stripe onboarding component to render inside the narrow
"auto" column, which is why it looked squeezed and misaligned.

This patch:
- keeps Stripe onboarding embedded on /host/payments
- expands the Stripe provider card across the full provider grid while setup is open
- gives the Stripe component the full remaining page width
- adds a clean Find A Place setup header and Close setup button
- keeps the existing Stripe secure component untouched
- adds responsive behavior for tablet/mobile

Files:
- components/payments/EmbeddedStripeOnboarding.tsx
- components/payments/EmbeddedStripeOnboarding.module.css

Apply over the project root, then restart:

Ctrl+C
npm run dev

No Stripe settings or database changes are required for this layout patch.
