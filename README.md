# Find A Place Booking — Milestone 9A.1 Pricing & Promotion Hardening

Baseline: `878b88e` — `Latest 9A+Review` on remote `main`.

This is a small hardening pass on top of the pushed Milestone 9A pricing/promotion foundation. It does **not** add calendar availability, reservations, payment-provider calls or live money.

## What this fixes

- Onboarding now captures the **included guest count** required to make an additional-guest fee deterministic when the first property is created from the saved setup.
- Host setup cannot be finalized for saved-first-property creation without a property name.
- First-property conversion persists `unit_rate_settings.included_guests` and validates it against maximum guests.
- Promo codes do not combine with a guest-facing advertised special by default; the host can explicitly opt a code into stacking.
- Promo quote eligibility now requires the promo currency to match resolved stay currency.
- Removing an unused promo still deletes it; once a promo has redemption history, removal archives/deactivates it rather than destroying the configuration record.
- Organization-wide promo removal is labeled clearly in the host UI.
- Admin pricing visibility includes the advertised-special stacking flag.
- Health schema becomes `pricing-promotions-hardening-v1`.

## Supabase

Run **only** the new migration on top of an already-current 9A database:

`supabase/migrations/20260914001300_pricing_promotion_hardening.sql`

Do not rewrite or rerun migrations 011/012 if they are already applied.

## Payment boundary

Promotions remain Find A Place pricing rules, not Stripe/Square coupons. The future reservation/hold transaction will atomically reserve/consume limited promo usage and snapshot the applied discount before the processor adapter is called.

See:

- `docs/PROMOTION_PAYMENT_BOUNDARY.md`
- `docs/FULL_PROJECT_REVIEW_2026-09-13.md`
- `docs/APPLY_MILESTONE_9A_1.md`

## Verify

```powershell
npm run typecheck
npm run build
npm run dev
```

After local acceptance, checkpoint 9A.1 before starting **Milestone 9B canonical availability + owner blocks + iCal/ICS**.
