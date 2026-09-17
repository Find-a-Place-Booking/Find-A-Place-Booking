FIND A PLACE — SANDBOX BOOKING V5.1 COMPILE FIX

Why the V5 recovery patch appeared not to work:
The V5 source did not type-check, so the recovery build was not actually clean.

Fixes:
1. `loadStripe` still comes from `@stripe/stripe-js/pure` to avoid SSR side effects.
2. The `Stripe` TypeScript type comes from `@stripe/stripe-js`, because the
   `/pure` entrypoint does not export that type.
3. `initialReservationId` is narrowed once into a stable `reservationId` string
   before the async recovery closure, fixing both `string | null | undefined`
   errors.

No Stripe charge logic changed.
No SQL changed.
No new payment is created by this patch.

After extracting into the project root:

npm run typecheck
npm run build
npm run dev

Both typecheck and build should complete before testing recovery.

Then recover the already-paid sandbox reservation with:

http://localhost:3000/checkout?stay=pine-hollow-ridge-cabin&checkIn=2026-09-21&checkOut=2026-09-30&guests=2&reservationId=190b71f5-a9aa-481f-b7bc-560a9a392d4d

Do NOT submit the card again.

If that URL returns "Sandbox reservation not found", run this in Supabase to
confirm whether the reservation/payment rows still exist:

select
  r.id as reservation_id,
  r.confirmation_code,
  r.status as reservation_status,
  r.payment_status,
  r.hold_expires_at,
  p.id as payment_id,
  p.status as payment_status_row,
  p.provider_payment_id,
  p.provider_charge_id,
  p.amount_cents
from public.reservations r
left join public.payments p on p.reservation_id = r.id
where r.id = '190b71f5-a9aa-481f-b7bc-560a9a392d4d'::uuid;
