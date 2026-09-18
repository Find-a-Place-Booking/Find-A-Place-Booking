# Guest availability-picker hotfix

This is a presentation/availability-read hotfix only.

It does NOT modify:
- Stripe
- payment intent creation
- booking hold RPC
- webhook confirmation
- reservation confirmation
- availability block mutation
- calendar import/export mutation

## What changes

The public stay page now reads the canonical `availability_blocks` data for the
published unit and shows a real calendar instead of unrestricted native date
inputs.

Unavailable nights:
- cannot be selected for check-in
- are crossed out / muted
- show `Unavailable` on hover/title
- include an accessible aria label
- prevent a checkout range from crossing a blocked night

Checkout-exclusive semantics are preserved:
- if another reservation begins on October 10, the current guest may still use
  October 10 as their checkout date because the stay occupies nights up to but
  not including checkout.

The authoritative server-side hold check is still left in place. The UI is a
convenience and early guard; the database remains the final double-booking
protection.

## Files

- `app/api/booking/availability/route.ts`
- `components/AvailabilityDatePicker.tsx`
- `components/AvailabilityDatePicker.module.css`
- `components/BookingCard.tsx`
- `app/stays/[slug]/page.tsx`

No SQL migration is required.

## Apply

Extract over the project AFTER the operations/content pass.

Then:

```powershell
Remove-Item -Recurse -Force .next
npm run typecheck
npm run build
npm run dev
```

## Test without another payment

Open the same published test property.

Dates already represented by:
- `OWNER_BLOCK`
- `EXTERNAL_BLOCK`
- active `INTERNAL_HOLD`
- `INTERNAL_RESERVATION`

should be visually unavailable.

The confirmed sandbox booking dates should be disabled immediately from the
canonical Find A Place reservation block.

You do not need to submit another card payment to test this calendar UI.
