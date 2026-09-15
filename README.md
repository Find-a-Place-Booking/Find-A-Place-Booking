# Find A Place Booking — Milestone 10A.1 Reservation / Payment Hardening

Baseline: `ecfca766` — pushed Milestone 10A reservation/payment foundation.

This contained follow-up hardens ownership, processor routing and reservation snapshot integrity before the UI cleanup pass. It still does **not** add Stripe/Square network calls, OAuth, webhooks, tax calculation, payouts or live money.

## Apply

Run only:

`supabase/migrations/20260914001700_reservation_payment_hardening.sql`

Migration 016 must already be applied.

Then run:

```powershell
npm run typecheck
npm run build
npm run dev
```

Expected health schema:

`reservation-payment-hardening-v1`

Local reservation test RPCs now default **off at the database layer**. See `docs/APPLY_MILESTONE_10A_1.md` for the privileged local-only SQL toggle and regression procedure.
