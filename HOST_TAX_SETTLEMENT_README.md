# Host Tax Settlement Overlay

This overlay changes Find A Place direct-charge settlement so:

- The guest is still charged the calculated lodging taxes at checkout.
- The full guest charge is created on the host's connected Stripe account.
- Find A Place's `application_fee_amount` contains **only** the 5%/7% platform commission.
- Guest tax dollars remain in the host's connected-account proceeds.
- Stripe processing fees remain the host connected account's expense.
- Find A Place does not create new platform `COLLECTED` tax-ledger entries.
- Full guest refunds refund the host-owned guest charge, including its tax portion.
- The Find A Place commission is separately refunded only when the 14-day commission rule says it is refundable.

After copying this overlay into the project root:

```powershell
npx supabase db push
npm run typecheck
npm run build
```

Then create a **new** test reservation. Do not reuse a PaymentIntent created under the previous tax-retention model.

For a reservation where the commission is $69.86 and guest tax is $97.58, the Stripe application fee should now be **$69.86**, not $167.44 or $203.86.
