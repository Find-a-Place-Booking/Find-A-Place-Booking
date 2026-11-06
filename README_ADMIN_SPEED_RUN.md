# Find A Place Booking — Admin completion & publishing overlay

Prepared November 5, 2026 against GitHub main `cd69a03f669c9b34bf167c5340149355f9bd1078`.

## What this implements

- `/admin/publishing`: one queue for unpublished listings, explicit per-listing publication blockers, unfinished host drafts, and live-calendar warnings.
- `/admin/publishing/[propertyId]`: admin editor for property facts, nightly rates, cancellation terms, photo upload, calendar preference and live checkout toggle; one-step **Approve & publish** only when the authoritative checks pass. The editor does not alter existing published property records.
- `/admin/host-assist/[organizationId]`: rescue unfinished onboarding; edit basic factual draft fields and prepare an unpublished listing record. Never accepts host agreements, claims authority to list, changes tax certifications or connects Stripe/PMS for the host.
- `/host/marketing`: independent opt-ins for interest in three discounted stays and optional additional social advertising. No automatic discount, partner enrollment, financial charge or campaign purchase. Existing 5%/7% commission assignment is displayed read-only.
- Navigation links in host/admin desktop and mobile menus.
- Operations-admin-only photo uploads directly into Supabase's existing private `property-images` bucket (JPG, PNG, WebP, max 10 MB); audited registration and a 25-photo limit. No Next.js server-action upload or expanded request body limit.
- **Admin activity-log cleanup:** routine automatic iCal and PMS sync events are excluded from the *admin-facing activity log* by its database read policy. This is not a deletion. Full history remains in backend Supabase for private monitoring; calendar connections, calendar diagnostics, sync workers, host controls, booking safety and manual calendar actions are unchanged.

## Already live vs. not yet live

- **Live in Supabase:** all the listed backend publishing/host-assist functions, host marketing preferences storage, admin-only photo permissions, and the admin activity-log filter for routine automatic iCal/PMS sync events.
- **Not yet on the live website:** the admin publishing queue, assisted edit/publish forms, host marketing page and added navigation links. Those require applying this ZIP to GitHub and a successful Vercel deployment.
- **No iCal content was deleted:** database logs and all sync/booking protections remain intact. See `docs/BACKEND_ICAL_LOG_MONITORING.md` to inspect iCal history privately.

## Installation

1. Back up the existing repo, then extract this ZIP **over the root** of `Find-a-Place-Booking/Find-A-Place-Booking`.
2. Review the changes; the ZIP contains *only* additive/new app routes, components, and navigation changes plus four migration source files.
3. The ZIP includes four **separate, working source files** in `supabase/migrations/` corresponding to changes already applied to live Supabase on November 5:
   - `20261105190000_admin_publishing_and_host_marketing_core.sql`
   - `20261105190500_admin_host_draft_assistance.sql`
   - `20261105191000_admin_direct_photo_upload.sql`
   - `20261105193000_hide_automatic_calendar_sync_in_admin_logs.sql`
   **All four equivalent migrations are already applied to the production database. Do not run them manually a second time.** If you use Supabase CLI to apply migrations, compare its local migration history to production before `db push`; some remote changes were installed directly through the Supabase service and might need their history reconciled rather than replayed.
4. Locally run `npm ci`, `npm run lint` if available, `npx tsc --noEmit`, and `npm run build`. Verify page permissions with an Operations Admin test login on a nonproduction deployment.
5. Push the changed source files to your GitHub branch and verify the preview Vercel build. After signoff, merge to `main` and verify the actual Vercel production commit matches it.

**Deployment state at packaging:** Supabase helper functions/policies installed and smoke-tested, but GitHub source cannot be pushed by the connected integration (403). No new app routes were deployed. Current website remains on `cd69a03` until you push.

## Safe usage / operator playbook

1. Go to `/admin/publishing` and find a property with zero requirements missing.
2. Open its detail page; review host consent, dates/rates, tax, calendar, Stripe, photo and policy data. Discuss incorrect information with the host before editing.
3. Complete only factual fields with a documented reason; upload missing images received from the host (not arbitrarily sourced images).
4. If checkout is disabled, verify payout/tax/calendar before enabling it; enabling checkout does **not** publish.
5. Use **Approve & publish** after checking host approval, then open the live property page and test the public date-picker. Never fake an external calendar sync to pass readiness.
6. For hosts stuck before a property record exists, use `/admin/host-assist/[organizationId]` and prepare a **DRAFT**, then send the host back to the genuine agreement, Stripe, tax and calendar steps.
7. After publishing, check `/admin/calendars`, Stripe account readiness, email and booking health.

## Booking/ease-of-use assessment (read-only audit)

- On Nov 5 there were 54 published properties, 9 drafts and 2 paused (plus 2 archived duplicates). Admin queue should surface actionable drafts rather than treating every draft as an error.
- Seven-day booking-event sample: 4,510 events across 596 unique attempt identifiers, including 478 failure events and 45 canceled/superseded requests. A booking event is *not* a distinct failed payment. Many recent substantive failures were ResNexus-unverifiable availability; short aborted date-picker requests also occur.
- Existing checkout has guest email + phone validation, Turnstile, policy/email verification, authoritative calendar checks before both hold/payment, Stripe direct charges, idempotency and webhook-confirmation guards. **Those workflows have not been modified in this overlay.**
- A rollback-only live-mode Cypress Cabin 2-night quote and reservation test matched **$211.50 total**, with $34 tax and $7.50 guest-paid platform fee. No charge or reservation was left behind. Not a substitute for a real-device end-to-end card payment regression.
- Some guests will still receive calendar unavailable messages until hosts repair their PMS credentials. Preserve fail-closed safety; improve wording and host notifications rather than removing the check.
- Host onboarding remains 11 steps; incompletely configured host listings now have focused admin rescue controls. Host must personally accept agreement/authority and provide any required tax/Stripe approvals.

## Fancy Hill / Renea notes

- Organization `Fancy Hill Cabins and RV Park` has verified `PARTNER_5` (5%), 10 published properties and 2 archived duplicates.
- All 10 published properties have an active **3% local tax line**. Eight use a legacy tax checkout allowance; two have completed host tax certification. The overlay does not modify any tax amount or tax status.
- All 10 live properties' ResNexus browser-worker connections reported `CREDENTIALS_REJECTED` and last success October 30. Have the host **update/reconnect saved ResNexus credentials inside Find A Place** and verify success for every mapped unit before considering the calendars reliable. Do not remove this safety block to admit bookings.

## Production database changes already installed

Production Supabase additive DDL was applied and tested via separate migrations:

- `admin_publishing_and_host_marketing_core_20261105`
- `admin_host_draft_assistance_v2_20261105`
- `admin_direct_photo_upload_20261105`
- `hide_automatic_calendar_sync_in_admin_logs_20261105`

Functions installed: `get_host_marketing_preferences`, `set_host_marketing_preferences`, `admin_property_publication_issues`, `admin_save_listing_prep`, `admin_finish_and_publish_listing`, `admin_patch_host_onboarding_draft`, `admin_prepare_host_property_draft`, `admin_register_listing_photo`.

Audit policy: admin read permission still requires `is_active_admin()`, but automatically generated `calendar.ical.auto_synced` and `calendar.pms.auto_synced` rows are hidden from authenticated admin read queries. Backend service-role audit access is unchanged, including historical events. **This only affects routine sync entries in logs**, not calendar status screens or booking checks.

Security: privileged admin actions check signed-in identity + operations/super-admin role; marketing preferences are host-owned and private; photo storage restricted to unpublished organization/property paths; no admin-side signature/acceptance of host contracts. Photo DB inserts audited. Existing payment, calendar and taxes unchanged.

## Verified database smoke tests

- White River Serenity readiness returned zero blockers. Rollback-only **Approve & Publish** succeeded; row remained a DRAFT after rollback.
- Dar El Kasba produced seven publication blockers and a publish attempt correctly refused.
- Admin patch + create-a-draft for a test account succeeded in rollback, leaving no property or changes.
- Host marketing preference update succeeded in rollback, leaving no saved opt-ins.
- Direct table reads for marketing preferences disabled for `anon`/`authenticated`; service role has access. Only authorized RPCs expose host-owned preferences.
- Authenticated admin activity query returned zero routine iCal/PMS auto-sync events while preserving 52 manual calendar connection creation events; the backend still retained approximately 59,302 historical iCal auto-sync entries. No audit rows were deleted.
- No test bookings, no test properties and no test opt-ins remained.
- TypeScript/TSX source files passed parsing checks (full Next.js build not run yet).

## Open release tasks

1. **GitHub deployment:** write access was denied with 403. User must overlay + push or grant writable GitHub connection.
2. Full `npm ci`, `tsc`, Next.js build and browser/device regression tests on preview.
3. Review the newly exposed admin editor with Operations Admin and Support role accounts.
4. Finish ResNexus credential reconnect; continue improving guest messaging for feed outages.
5. Future: richer host support messaging, photo cropping/reordering, and direct admin calendar diagnostic actions can be added separately. Do not bypass existing host account credentials or payment system.

## Recovery / rollback

- **UI:** revert the overlay commit in GitHub and redeploy. No booking-related frontend files were replaced.
- **DB:** the additive table/functions and storage policies are inert without the new pages; do **not** drop them blindly because host preferences might have been saved once live. To restore routine automated sync entries to the admin activity log, restore the former policy with `ALTER POLICY audit_logs_select_admin ON public.audit_logs TO authenticated USING (public.is_active_admin());` (only after confirming the current live policy has not changed again). To disable admin photo upload quickly, remove the two storage policies `property_storage_insert_ops_admin` and `property_storage_delete_ops_admin` (existing host policies remain intact), after reviewing operational impact.
- Recheck `public.properties` and `public.audit_logs` after any admin publish. Restoring a paused property should always be deliberate and should preserve existing reservations.

No database credentials or secret keys are included.
