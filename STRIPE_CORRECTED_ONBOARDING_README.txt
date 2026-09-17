FIND A PLACE — CORRECTED STRIPE ONBOARDING PATCH

This is the host onboarding correction after reviewing the actual Stripe errors.

It fixes:
- Accounts v2 recipient account creation
- fees_collector = application
- losses_collector = application
- embedded onboarding remains on Find A Place
- sandbox replacement marker for earlier broken test-account references
- v2 readiness based on transfer/payout status

Extract into the project root and replace matching files.

Then run:

Ctrl+C
npm run typecheck
npm run build
npm run dev

Go to:
/host/payments

Click Connect Stripe.

No Stripe Dashboard setting needs to be changed for the responsibility error you
were seeing. That error came from our account-creation payload.

See docs/STRIPE_CORRECTED_PAYMENT_MODEL.md for the fee model.
