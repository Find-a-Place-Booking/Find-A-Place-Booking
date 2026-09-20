Find A Place Booking — Pet Fee Modes

Adds host-selectable pet fee calculation in Host > Rates & fees:
- Per pet, per night (default when no pet fee exists yet)
- Per pet, per stay
- Flat per stay

Important behavior:
- Existing pet fees are NOT silently changed. If a property is already set to
  per pet/per stay, it remains that way until the host saves another mode.
- Existing host onboarding still creates its historical per-pet/per-stay fee.
  Hosts can change the calculation in Rates & fees after the property exists.
- The booking quote multiplies the fee correctly before tax.
- Pet fees stay outside the 5% / 7% lodging commission base.
- No Stripe destination-charge, processor-recovery, payout, calendar, or tax
  architecture was changed.

Migration:
  20260920004800_pet_fee_calculation_modes.sql

Apply:
  npx supabase db push --dry-run

If the transactional-email migration has not been applied yet, dry-run may show
047 and 048. That is expected. Stop if an unexpected older migration appears.

Then:
  npx supabase db push
  npm run typecheck
  npm run build

Test in Host > Rates & fees with a 2-night stay and 2 pets:
- $25 per pet/night = $100 pet fee
- $25 per pet/stay  = $50 pet fee
- $25 flat/stay     = $25 pet fee
