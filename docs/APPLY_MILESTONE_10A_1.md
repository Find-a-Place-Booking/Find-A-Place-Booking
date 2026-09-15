# Apply / Test Milestone 10A.1

Baseline expected: `ecfca766` with migrations through 016 already applied.

## 1. Overlay

Extract this package into the repository root and merge folders.

## 2. Apply only migration 017

`supabase/migrations/20260914001700_reservation_payment_hardening.sql`

Do not rerun migrations 001–016.

## 3. Compile/build gate

```powershell
npm run typecheck
npm run build
npm run dev
```

Open `/api/health/supabase` and expect:

```json
{
  "ok": true,
  "schema": "reservation-payment-hardening-v1",
  "reservation_schema": "reservation-payment-foundation-v1",
  "calendar_schema": "calendar-availability-hardening-v1",
  "live_money_enabled": false
}
```

## 4. Normal behavior with test tools disabled

After migration 017, Host → Reservations should show the database-gated development notice locally instead of the test-hold form.

This is intentional. Direct authenticated calls to the test RPCs should fail with `Local reservation test tools are disabled`.

## 5. Temporarily enable local test holds

Only in the **local/development Supabase project**, use the privileged SQL editor:

```sql
update public.platform_runtime_flags
set allow_test_reservation_tools = true,
    updated_at = now()
where singleton = 1;
```

Refresh Host → Reservations. The test form should appear.

Create a 10-minute hold and verify:

1. the reservation appears in Host → Reservations;
2. its dates block Host → Calendar;
3. overlapping second hold is rejected;
4. commission snapshot is 5% or 7% according to the organization tier;
5. payment route remains null if no READY processor account exists;
6. Release test hold removes the active canonical hold;
7. an ordinary/non-test reservation row cannot be released by the test helper.

Then turn the database gate back off:

```sql
update public.platform_runtime_flags
set allow_test_reservation_tools = false,
    updated_at = now()
where singleton = 1;
```

Leave this `false` before Vercel staging.

## 6. Ownership/integrity acceptance

Migration 017 itself validates existing processor assignments/reservation routing before it commits. Also verify normal host/admin reads still work:

- Host properties and rates;
- Calendar owner blocks;
- Admin properties/review/publication;
- Admin calendars;
- Admin reservations;
- Host payments page;
- public homepage/stays/detail.

Do not add a fake processor account simply to satisfy payment routing. Null routing is the correct state until the real Find A Place Stripe/Square platform setup exists.

## 7. Checkpoint

After local acceptance:

```powershell
git status
git add .
git commit -m "fix: harden reservation ownership and payment routing"
git push origin main
git rev-parse --short HEAD
```

That commit becomes the baseline for the final UI cleanup pass.
