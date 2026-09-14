# Apply / Verify Milestone 9A.1 — Pricing & Promotion Hardening

Baseline: remote `main` commit `878b88e` (`Latest 9A+Review`).

## 1. Apply code

Overlay this package onto the current repository while preserving `.git`, `.env.local` and the existing `package-lock.json`.

## 2. Supabase

Run **only**:

`supabase/migrations/20260914001300_pricing_promotion_hardening.sql`

Do not rerun 011/012 if they are already applied.

Health route after 013 should report:

`pricing-promotions-hardening-v1`

## 3. Compiler gate

```powershell
npm run typecheck
npm run build
npm run dev
```

## 4. Onboarding regression

Use a new/fresh test organization when practical.

- Rates & fees onboarding step shows **Guests included in nightly rate** next to the extra-guest fee.
- Enter an extra-guest fee without an included-guest count; final setup should explain what is missing.
- Add the included count, finish setup, create the property from the saved draft.
- Open `/host/rates/[slug]`; included guests and extra-guest fee should match onboarding.
- A quote above the included-guest count should charge the configured extra guest fee; a quote at/below the threshold should not.
- Confirm host setup cannot become READY_FOR_PROPERTY without a first property name.

Existing properties are not guessed/migrated because an old extra-guest fee does not reveal the intended threshold. Set that threshold manually in Rates & fees if needed.

## 5. Promo regression

Create an ordinary promo, e.g. `FANCY25`, and verify the preview discount/commission base.

Create a date rate with **guest-facing special** enabled that overlaps the quote dates:

- with `Allow this code to combine with an advertised special rate` unchecked, applying `FANCY25` should be rejected;
- enable the checkbox and save; the same quote should apply the promo on top of the advertised special;
- a non-advertised seasonal/custom rate may still be combined with a promo.

Verify organization-wide code UI says removal affects all organization properties.

Currency is currently USD-only in host UI, but the quote RPC now also requires the promo currency to match resolved pricing currency.

## 6. Removal/history behavior

Current test codes with zero redemptions may hard-delete normally.

Do not manually fake production redemption history just to test this unless desired. The database behavior is:

- `redemption_count = 0` → remove deletes the unused code;
- `redemption_count > 0` → remove archives/deactivates the code and preserves the row.

Real redemption records/counters are intentionally implemented with reservation/hold infrastructure, not here.

## 7. Regression

Recheck:

- host sign-in/onboarding persistence;
- first property conversion and additional property creation;
- property save/photos;
- review/publish lifecycle;
- partner verification;
- Admin property visibility;
- public published listing safety;
- host avatar;
- mobile navigation/pricing forms.

## 8. Checkpoint

After acceptance:

```powershell
git add .
git commit -m "fix: harden onboarding pricing and promotion rules"
git push origin main
git rev-parse --short HEAD
```

Then Milestone 9B can begin.
