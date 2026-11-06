# Find A Place — Clean Checkout & Single Guest-Paid 7% Fee

Prepared against GitHub main `b94b80ff723417e178a2649565aa2fb69c06e57e` (November 5, 2026 local time).

## Already completed on the LIVE database

- 31 host organizations now have `STANDARD_7`. Future bookings snapshot the 7% lodging-based fee from each organization.
- `fap_guest_fee_rollout.live_enabled=true` was already enabled and remains enabled. The guest pays the service fee.
- The retired `admin_set_partner_commission` RPC can no longer be executed by public or signed-in users. A database trigger prevents the old 5% tier being assigned again to organizations.
- Managed host marketing copy and payment policy now describe the guest-paid 7% fee.
- Host Agreement was versioned as **2026-11-05-v7**. Hosts who accepted v6 should review and reaccept the updated policy through their normal host portal.
- Historical booking snapshots, prior charges, calendar availability, refunds and payout processing were **not** changed.

The matching migration source is included at `supabase/migrations/20261106090000_single_7_percent_guest_fee.sql` for source control. **Do not run it manually again on the connected production database.** It is forward-only and intentionally keeps the historic `PARTNER_5` enum because old reservations may reference it.

## UI changes in this overlay

- Compact, branded booking comparison using the existing Find A Place seal. Airbnb is a plain-text label to avoid suggesting an endorsement.
- Savings/estimated difference is the focus; before-tax amounts in two clean rows; full fee assumptions under a single disclosure.
- Estimated comparisons are clearly labeled hypothetical rather than real Airbnb quotes.
- Checkout total uses warmer neutrals and consistent border radii; no price calculation is changed here.
- Light sitewide polish: less aggressive letter spacing, balanced headings, consistent background surfaces, softer shadows, and focus outlines; no major layout changes.
- Retired the old 5% / 7% admin rate screen, action and desktop/mobile navigation entry; simplified host payment/marketing copy, host admin rows and in-house comparison model to 7%.
- Updated the source fallback text for the Host Agreement (database managed copy is already updated).

## REQUIRED installation (extracting alone is not enough)

1. Back up your repository, then **extract the entire ZIP into the ROOT of the Find-A-Place-Booking Git repository**. Keep the `app/`, `components/`, `supabase/` and other directory structure and overwrite matching files.
2. **Double-click `APPLY_OVERLAY.bat` once** on Windows, or run `bash APPLY_OVERLAY.sh` on macOS/Linux. This updates the other existing source files without rewriting them wholesale. The script validates all expected source anchors before modifying any existing files, and is safe to rerun.
3. Run **`npm run typecheck`**, then **`npm run build`** in the same repository. If either fails, don't push; share the error.
4. `git add . && git commit -m "Polish booking comparison and standardize guest fee UI" && git push origin main`.
5. Verify Vercel production deploys to READY, then test a real checkout with a host previously on 5% and one formerly on 7%. Confirm **7% of discounted lodging** is shown as a guest fee and the same amount flows to Stripe application fee. Test tax and cancellation snapshots as well.
6. Ask current hosts to review and accept the updated Host Agreement v7 on Host → Onboarding / Host policies. Existing reservations keep original terms.

**Do not execute SQL in the browser or turn off Turnstile, Stripe webhooks, or calendar safety checks to verify these changes.**

## Validation completed

- Checked every installer anchor against GitHub main: one match each.
- Component TypeScript (strict stubbed isolated test) passed.
- CSS parsed with PostCSS.
- Guarded installer regression ran twice and passed; idempotent and fails without writing original files if a source anchor changed.
- Static fee-scope checks passed.
- Database tier, agreement revision, saved content and RPC permissions verified after migration.

**Not verified:** Full Next.js production build, end-to-end Stripe guest checkout with the new 7% host tiers, authenticated host re-acceptance, and production visuals after the pending GitHub push. GitHub integration remains read-only (writes rejected), so the frontend ZIP is not deployed just by being generated.

## Rollback / important cautions

The UI patch is reversible through Git. The database fee change is intentionally forward-only; changing booked financial snapshots retroactively is not a rollback option. If a new-booking issue arises, use the established checkout maintenance controls and investigate transaction snapshots before applying any fee rollback. Avoid turning off guest fees while payment and checkout are processing.

Hosted property partner badges/statuses are preserved as marketing labels; they no longer confer a discounted commission. Historical migrations still mention the legacy model for audit integrity, and should not be deleted.
