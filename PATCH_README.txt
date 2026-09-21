FIND A PLACE BOOKING — PRE-PILOT CLEANUP

Baseline audited commit:
a4518d7fd709e703fb77e3f34aeecdab724f3105

HOW TO APPLY
1. Extract the contents of this ZIP into the Find A Place Booking repository folder.
2. Double-click APPLY_FIXES.cmd.
3. The package safely re-checks/applies the fixes, creates a timestamped backup for anything it changes, then runs npm run typecheck and npm run build.

If you already ran the first package and saw `spawnSync npm.cmd EINVAL`, the source fixes were already applied. This corrected package is safe to run over the same folder; it will not duplicate them.

No PowerShell installer is used.

THIS PASS FIXES
- Shared Contact / Help / host-promotion CSS is actually loaded.
- Heavy stay-type PNGs are delivered through Next image optimization instead of being fetched directly as CSS backgrounds.
- Guests can select host-created, guest-visible add-ons during checkout.
- Guests can enter host promo codes during checkout.
- Checkout shows lodging, promo discounts, host fees, add-ons, taxes and total before payment.
- Public booking APIs stop exposing unexpected internal/database/provider errors.
- The Supabase operations health route is protected in production.
- Guest-to-host and host-to-guest reservation messages trigger transactional email notifications.
- Raw enum/database-style labels are cleaned up in host and guest views.
- The unfinished Square payout card is hidden until the integration is actually ready.
- Admin copy no longer talks about production-shaped Supabase models or migration milestones.
- Root README.md and MANIFEST.json are restored to production-project documentation.

NOT CHANGED
- Stripe destination-charge architecture
- 5% / 7% commission math
- lodging-tax math or remittance accounting
- payout timing policy
- refund/reversal mechanics
- reservation locking
- calendar availability logic
- database schema / migrations
