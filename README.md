# Admin environment null-narrowing build fix

Fixes Vercel TypeScript errors in `app/admin/reservations/actions.ts`:

- TS18047 reservation is possibly null

The environment guard is unchanged. The code now exits the failure branches
before reading `reservation.payment_environment`.

No Stripe/webhook/payment calculation behavior is changed.

Run:

```powershell
npm run typecheck
npm run build
```
