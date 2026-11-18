# Find A Place Booking — push-ready combined overlay

**Target repository:** `Find-a-Place-Booking/Find-A-Place-Booking`, based on production `main` inspected November 18, 2026.

## One-time steps

1. **Extract the ZIP at the ROOT of the existing repository**. Merge directories and replace same-named files. **Do not delete or replace entire directories.** In particular, leave your existing `public/webapps/icons/guest-192.png`, `guest-512.png`, `host-192.png`, and `host-512.png` in place: they contain the *real Find A Place branding*. The ZIP intentionally does **not** include substitute artwork for these originals.
2. Commit/push the merged files as usual. Vercel's existing `npm run build` will run `scripts/fap-prepare-build.cjs` automatically and then `next build`. This automatically folds the four source integrations into the checkout and host pages and generates the **same original Find A Place PWA icon** in green for guests and rust-orange for hosts. No manual patch commands or SQL Editor steps are required for the connected production database.
3. Deploy normally and watch Vercel build status. If the source differs from the inspected production branch, the integration will stop with a useful error rather than forcing any patches. Don't promote a failing build.
4. Once deployed, test the existing guest checkout, host signup, property editing, iCal, and video uploader first. Follow `tests/AFTER_PUSH_QA.md` for the rest. Mobile devices may cache installed PWA icons; reinstall the guest/host web app if its old icon persists.

## Database already prepared

The following *additive* changes were applied to the connected Find A Place production Supabase project **before packaging** and verified after application:
- Admin editable drafts storage, with seven guest-paid fee policy drafts awaiting Renea's review (not published).
- Per-property refundable security deposit settings/ledger/disclosures (all deposit policies disabled by default, no deposit records created).
- Guest typed-signature evidence columns, with requirements disabled by default.
- Twenty new amenity catalog entries, previously added.

The SQL in `sql/` is retained **only for reference or other environments**. **Do not run it again in production.** Current host tax, booking totals, payouts, calendars, and prior reservations were not modified by this preparation.

## Existing platform behavior protected

- The current Find A Place fee payer rollout stays as configured; no changes to core Stripe booking totals.
- Host terms drafts remain unpublished until Renea reviews/publishes them in the admin editor.
- Normal checkout and normal policy acceptance are unchanged while `FAP_RENTAL_ESIGN_ENABLED` is unset or false.
- Separate security deposit charges are unavailable while `FAP_SECURITY_DEPOSIT_PAYMENTS_ENABLED` is unset or false. Never enable deposit payments until Stripe **TEST** connected-account deposit/refund/webhook tests pass.
- Existing OwnerRez iCal sync remains enabled; the new status view does not pretend full two-way OwnerRez OAuth is connected.
- Listing copying, Saturday check-in/out restrictions, holiday rates and checkout requirements already exist; no redundant changes to Melissa's published listings.

## Included improvements

- Better host video save/replace, mobile feedback and retry behavior.
- Admin copy drafts and review/confirm/publish pages.
- Guest-paid fee copy updates on signup, host onboarding, pricing, and public Hosts page.
- Host optional-extra fee builder with inactive drafts for unspecified prices.
- 20 additional amenities in the property editor.
- Deposit setup, separate guest payment page and host refund pages, controlled by the feature flag above.
- PDF-linked typed rental signatures and evidence page, controlled by the feature flag above.
- Host OwnerRez connection-health page.
- Guest and host PWA manifests, each pointing to original Find A Place logo assets in a different color.

## Verification and limits

- 34 TS/TSX overlay files passed TypeScript syntax checks.
- The automatic source integrations were run twice on matching source fixtures, including repeat/idempotence checks.
- Recoloring was tested at 192×192 and 512×512 on PNG inputs.
- Supabase tables and draft entries were verified after migration.
- **A complete Next.js production build against your full source and live Stripe payment/refund testing are not verified here.** Deployment is intentionally fail-fast rather than claiming tests that have not been run.
