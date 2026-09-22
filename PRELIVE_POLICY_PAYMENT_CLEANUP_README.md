# Pre-Live Policy + Payment Cleanup

This pass closes the remaining policy/payment inconsistencies before enabling
Stripe LIVE on Vercel.

Changes:
- Removes the old 14-day application-fee refund behavior from the Stripe refund
  helper.
- Guest refunds remain connected-account refunds with
  `refund_application_fee: false`.
- Adds DB-level enforcement that `platform_fee_refund_cents` is always zero.
- Help, Property Policies, My Trip cancellation status, and cancellation
  notifications explicitly state:
  - host decides ordinary guest refunds under the accepted property policy;
  - host-approved refunds are funded from the host connected charge;
  - Find A Place commission remains earned/non-refundable.
- Payment confirmation email now states that guest taxes remain in the host
  charge and Find A Place retains no guest tax dollars.

Apply after migrations 062/063:

```powershell
npx supabase db push
npm run typecheck
npm run build
```

Expected new migration:
`20260922006400_enforce_nonrefundable_platform_commission.sql`

LIVE architecture remains:
guest -> host connected Stripe direct charge
      -> Find A Place application fee = assigned commission only
      -> Stripe processing charged to host
      -> guest tax stays in host charge

- `.env.example` now documents the host-tax/direct-charge model correctly and explicitly keeps local Stripe TEST separate from Vercel Production LIVE.
