# Find A Place — Corrected direct-file overlay (Pre-push QA)

**Use this ZIP instead of the earlier November 22 Host Features & Search Visibility ZIP.** It includes all earlier source files plus corrections discovered during the pre-deployment audit. Extract into the GitHub repository root and overwrite identical paths. There are no manual patch/install commands and no SQL to run.

This release adds host custom fees under normal base rates, six indexable Arkansas destination pages, updated sitemap/footer links, a protected IndexNow cron, corrected guest-fee/Host Agreement wording, VERIFIED-partner-first default order across the shared desktop/mobile/map/nearby feeds, verified-partner name autocomplete, and distinct cache-busted guest/host PWA icons. The existing build preparation uses the original Find A Place logo to generate forest-green guest and copper-orange host PNGs.

**Important:** GitHub is still at `12a64bbf` (November 18). This ZIP has not been pushed. Before production, run `npm ci && npm run typecheck && npm run build` and test on a Vercel preview. See `PRE_DEPLOY_AUDIT.md` for specific cases and limitations.

Only UI, search ordering, PWA metadata and SEO files are changed. No booking, Stripe, reservation, tax, or calendar business-logic files are replaced. We did not enable refundable security-deposit collection or enforce electronic signatures. Existing credentials and host-side tax approvals must be handled separately.

If the push fails, do not manually merge the old overlay on top of this one. Inspect the failing file and revert the single failed commit or rollback the Vercel deployment. For old installed home-screen apps, reinstallation may be required to update the icon.
