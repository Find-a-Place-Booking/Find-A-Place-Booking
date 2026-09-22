# Cancellation Calendar + Host History Fix

This overlay fixes the cancellation state transition.

## Behavior after this overlay

When a host approves a cancellation with a refund:

1. The reservation is immediately set to `CANCELLED`.
2. `cancelled_at` is recorded.
3. Any active `INTERNAL_HOLD` or `INTERNAL_RESERVATION` availability block is immediately changed to `CANCELLED`.
4. The host calendar therefore releases the dates immediately.
5. The reservation remains in the host Reservations page as cancellation history.
6. The Stripe refund runs/reconciles separately.
7. If the refund is still pending or needs reconciliation, the reservation remains cancelled and the dates remain available.

Migration 061 also repairs existing cancellation requests already in `APPROVED` or `COMPLETED` state that were incorrectly left as confirmed reservations with active calendar blocks.

Run:

```powershell
npx supabase db push
npm run typecheck
npm run build
```

Then refresh the host Reservations and Calendar pages.
