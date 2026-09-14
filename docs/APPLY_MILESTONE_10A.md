# Apply / Test Milestone 10A

Expected baseline: `e710828` (`Milestone 9B.1 calendar hardening`).

## 1. Overlay files

Extract the 10A ZIP into the repository root and allow folders/files to merge.

## 2. Apply Supabase migration

If the database is already current through migration 015, run only:

`supabase/migrations/20260914001600_reservation_payment_foundation.sql`

Do not rerun 001–015.

## 3. Compiler/build gates

```powershell
npm run typecheck
npm run build
npm run dev
```

Open:

`http://localhost:3000/api/health/supabase`

Expected core fields:

```json
{
  "ok": true,
  "schema": "reservation-payment-foundation-v1",
  "calendar_schema": "calendar-availability-hardening-v1",
  "live_money_enabled": false
}
```

## 4. Local reservation hold test

Open **Host -> Reservations** while running `npm run dev`.

The development-only test form should appear.

1. Pick a real test property/unit.
2. Choose available future dates.
3. Enter guest count/pets and optional promo code.
4. Create the 10-minute test hold.
5. Confirm the reservation row appears with:
   - unique confirmation code;
   - `HOLD` status;
   - snapshotted 5% or 7% tier;
   - guest total from 9A pricing;
   - `NOT_CALCULATED` tax state;
   - no live payment status.
6. Open **Host -> Calendar** and confirm the same dates show an internal checkout hold.
7. Attempt an overlapping second hold for the same unit/dates. It must fail as unavailable.
8. Release the first hold from Reservations. The calendar dates must reopen.
9. Create another hold and let it pass the 10-minute expiration, then refresh Reservations. It should become `EXPIRED` and cease blocking availability.

## 5. Promo limit test

Use a promo with a low `max_redemptions` if practical.

- A hold with the promo creates a temporary promo reservation.
- The permanent `promotion_codes.redemption_count` should not increment merely from the hold.
- A released/expired hold releases its temporary promo reservation.
- A limited promo must not be over-reserved by concurrent holds.

## 6. Payment routing test

Open **Host -> Payments**.

With no real provider accounts configured, expected state is:

- 0 payment accounts;
- launch processing policy shows Host pays / `HOST_FULL`;
- Stripe and Square connection actions remain disabled;
- live money remains disabled.

No reservation should invent a processor destination. `payment_account_id` and `payment_provider` remain null until a real READY account is assigned.

## 7. Admin regression

Open **Admin -> Reservations**.

The local test hold should be visible with organization/property ownership, total, commission snapshot, tax state and payment state. The screen is read-only.

Also regress:

- Host auth;
- Admin auth;
- property review/publication;
- public listings;
- rates/special rates/minimum stays;
- promo codes;
- owner calendar blocks;
- iCal calendar screens;
- no checkout/live booking activation;
- no Stripe/Square network request.

## 8. Payment safety checks

Search the code before acceptance:

- no raw bank account fields;
- no SSN fields;
- no hardcoded provider secret;
- no platform commission sent to owner split logic;
- ledger table remains append-only;
- reservation event history remains append-only.

## 9. Checkpoint after local acceptance

```powershell
git status
git add .
git commit -m "feat: add reservation hold and payment foundation"
git push origin main
git rev-parse --short HEAD
```

After 10A is accepted, the next contained payment step is the real processor adapter milestone: Stripe Connect first and Square OAuth/Payments second, using test/sandbox credentials from the actual Find A Place platform accounts.
