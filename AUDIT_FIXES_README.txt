Find A Place audit fixes (based on fcaa4ef6387051ce02be8b9f5a330ac217254aab)

Copy the included paths over matching paths in your existing repository. Preserve .git, .env.local and package-lock.json.

Changes: host-owned guest tax reporting and rate configuration; timezone-safe iCal import with fail-closed malformed events; reconciliation cron for existing pending Stripe refunds; webhook error detail; current schema checks. Migration 064 history has already been repaired in the connected Supabase project.

After copying: npm ci, npm run typecheck, npm run build, node --experimental-strip-types tests/calendar-ical.mjs. Commit and push. The /api/cron/refunds job needs CRON_SECRET and the test environment's Stripe keys to reconcile four existing TEST refunds. It never creates a refund. Examine the results in Stripe and the admin reservation records. Set up a representative iCal feed and test occupied dates and a booking conflict before relying on sync.

No production charges, refunds, or booking records were changed. GitHub rejected automated write access (403), so remote main remains unchanged.
