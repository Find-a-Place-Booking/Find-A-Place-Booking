# Find A Place Booking — October 14 Guest Emails, ThinkReservations & Hospitable Overlay

This overlay targets **Find-a-Place-Booking/Find-A-Place-Booking `main`** as inspected October 14, 2026. It is a source-code patch, not a deployed website update. No booking/payment code or calendar availability records are changed by the patch.

## Scope

1. **Fix cross-rule guest email edits:** replaces `app/host/guest-emails/actions.ts` with the safeguarded action from the preceding Lone Cedar fix. It verifies rule organization, property, and trigger type, rejects cross-rule updates/zero-row saves, and keeps before-check-in and after-checkout templates separate.
2. **Restore original templates:** creates a small client button to reset **only the displayed email** to the original subject/body and send timing. It does not change the database until the host clicks **Save email setup**. This is available independently for the pre-arrival and post-stay forms.
3. **Consistent branded transactional emails:** extends existing responsive Find A Place shell with visible links to Find a stay, Manage a trip, Help, Find A Place Arkansas & Beyond, Facebook, Instagram, TikTok, and Lemon8. Link sources are imported from `lib/brand-links.ts`, so the footer matches the site and is not hardcoded separately. Keeps the booking seal, existing recipient routing, copy, confirmation, payment, and idempotency logic.
4. **Feedback email branding:** on-boarding feedback mail now goes through the same branded HTML shell; no change to internal recipients or feedback content.
5. **Hospitable help in host calendar:** adds a Hospitable choice to the iCal provider menu and descriptive setup instructions. `create_ical_connection` already accepts this provider value, so no Supabase migration is needed for this choice. It is iCal, **not a Hospitable API integration**.
6. **ThinkReservations partial-sync warning:** when reservation details API fails but inventory/blackouts succeed, show a clear warning rather than implying complete booking synchronization. Clarifies that the connection is *read-only* and does not push Find A Place bookings into ThinkReservations.
7. **Publication guidance:** the property editor describes the required iCal connection and healthy sync when the owner cannot publish due to missing calendar setup.

## Applying this code

- This archive includes a deterministic `apply_overlay.py` for the repository coding agent. Place archive contents in a temporary directory and run the patcher from the **correct repo root**, or direct your coding agent to apply it there. It verifies target anchors and aborts before modifying existing files if the underlying source has changed. Running twice is safe on matching source.
- The actual new TSX component, updated server action, and idempotent SQL migration are also included as files in their relative project paths.
- Build/TypeScript-check in the full Next.js repo, review the diff, deploy from the Vercel-connected branch, and smoke-test the live form and the resulting emails. The script itself is syntax-checked and its replacement behavior has been regression-checked against constructed anchors, but no full Next.js build was possible in this isolated environment.
- **Production SQL protection was applied on October 13 and verified.** The included migration is idempotent for other environments / source control. It must not be used to create/override the host's custom email wording.
- The GitHub connector in this chat returned HTTP 403 for writing and Vercel API access returned 403/404. **Do not describe these application edits as deployed until a successful build and live verification.**

## Database findings, October 14, 2026

### Lone Cedar

- Three ThinkReservations calendar connections are active. The latest sync observed during this investigation was ~08:45 AM Central on October 14; recurring runs are present. A healthy import status **only** verifies the availability import job completed.
- The ThinkReservations reservation-details endpoint returns HTTP 500, `Illegal Argument`, recorded under `RESERVATION_ENRICHMENT_DEGRADED` at integration level. Inventory and blackout evidence are still imported. This overlay surfaces the partial state more clearly; it does NOT claim to fix the provider's HTTP 500.
- The current Find A Place connector is explicitly *read-only*. Find A Place bookings are not posted into ThinkReservations; enabling the ThinkReservations write API is an independent, payment-sensitive design task.
- Find A Place has a paid confirmed Oct 18–20 booking for Lone Cedar Cabin, with an internal reservation block. ThinkReservations' overlapping unavailable range October 9–November 3 may represent the same booking or a separate provider block. **Do not delete it without comparing with the host's actual ThinkReservations calendar.**
- Lone Cedar Cabin currently has only a saved pre-arrival rule (3 days before at 10:00 AM); it does **not** have a post-stay rule. The owner must save their desired separate post-stay subject/body/timing after deploying this fix. Copying custom text is supported; use of the original wording is not a requirement.
- Oct 13 reservation generated successful guest booking confirmation, host booking, and host payment emails. Each had the branded wrapper and seal. The existing pre/post stay automation delivery table contained no sent deliveries during the inspected window.

### Carol's Cozy Cottage / Hospitable

- Property is DRAFT with availability preference `UNSET` and **no imported calendar connection**. It does have a generated outbound Find A Place iCal export token.
- Other publication prerequisites checked: description, property type and region, nightly price, 8 images, cancellation terms, and live Stripe payout readiness present.
- To complete connection: in Hospitable, **Properties → Carol's Cozy Cottage → Export calendar / Copy iCal link**. In Find A Place **Host → Calendar → Carol's Cozy Cottage**, choose Hospitable (once this patch is deployed; before then use `Other iCal / ICS`), label it, paste the *private property iCal URL*, and press **Test, connect & sync**. When healthy, select iCal as calendar preference in the property editor and publish. Add the **source-specific** Find A Place outbound iCal generated for Hospitable to Hospitable **Properties → Carol's Cozy Cottage → Add External iCal**. Do not paste an API key or the ordinary Find A Place listing webpage URL.
- Hospitable's iCal exports reservation events, not all manual blocks; an Owner Stay or Manual Booking may be needed to propagate owner-blocked dates.

## Required checks after deploying

1. In a Lone Cedar property pre-arrival email: save a unique subject/body/day; reopen and verify values persist.
2. Configure a different post-stay subject/body/day; save/reopen. Assert pre-arrival remains unchanged.
3. Use **Restore original template & timing** for post-stay, inspect the reset values, and confirm **pre-arrival is unaffected**; save only if intended.
4. Check all four social links are visible and correct in a **new** booking email and in a new custom guest email. Inspect Gmail desktop and mobile layout, accessible image alt and link clarity.
5. Confirm automated email cron sends only on the due date, not on setting save; duplicate notifications remain suppressed. No test emails should be sent to real guests without approval.
6. Check one known booked and one known open date on each Lone Cedar property side by side with the source ThinkReservations dashboard. Reconcile the Oct 18–20 overlap manually if necessary.
7. For Carol's Cozy Cottage, confirm a Hospitable import connection record exists, its initial sync is `HEALTHY`, and the source-specific export has been added into the proper Hospitable property. Do not publish based on a pasted-but-unsaved URL.

## Files touched by patcher

- `app/host/guest-emails/[slug]/page.tsx`
- `lib/notifications/transactional-email.ts`
- `lib/notifications/host-onboarding-feedback.ts`
- `app/host/calendar/page.tsx`
- `lib/host/calendar.ts`
- `lib/calendar/diagnostics.ts`
- `components/CalendarIntegrationPanel.tsx`
- `app/host/properties/[slug]/page.tsx`

## Full/new files copied by patcher

- `app/host/guest-emails/actions.ts`
- `components/GuestEmailTemplateResetButton.tsx`
- `supabase/migrations/20261013192000_protect_guest_email_rule_identity.sql`

---

# October 14 Review Addendum — Facebook Share Preview Fix

This **reviewed revision supersedes the earlier October 14 archive**. It includes the previous email, Hospitable, and ThinkReservations UI patch, plus a new Facebook/Open Graph stay-thumbnail correction. It is *not deployed*.

## Facebook failure paths identified

- The current site has `robots.ts` disallowing `/api/` for all bots, while `app/stays/[slug]/page.tsx` points `og:image` at `/api/public/stay-social-image/[slug]`. A crawler respecting robots.txt may not retrieve that image.
- In the same segment there is a separate `app/stays/[slug]/opengraph-image.tsx` file-based handler in addition to `generateMetadata()`, introducing competing ways to declare the image. That handler is removed by this patch (SHA-protected deletion); the stay page becomes the one source of social metadata.
- The existing metadata mistakenly equates a **temporary signed gallery URL** with existence of a source property photo; failed gallery signing can trigger a Find A Place logo even when the published listing contains real photos. The new metadata checks the underlying stored photo identity, not the gallery's signed link.
- Canonical metadata now normalizes both production apex/www input to `https://www.findaplacebooking.com`. The live site redirects apex to www; avoiding an unnecessary redirect for social images is helpful.

## Facebook changes to source

1. `lib/public/listings.ts` adds a short `socialPhotoRevision` derived from a SHA-256 of the first stored photo path. This does *not* publish private storage paths or credentials. When hosts replace/reorder the primary image, the preview URL changes and can be refreshed by platforms.
2. `app/stays/[slug]/page.tsx` sets *one* photo-based `og:image` and `twitter:image` URL at `/stay-preview/<slug>?v=<revision>` when a published stay has photos. Only a stay with **no** photo gets the Find A Place logo.
3. New `app/stay-preview/[slug]/route.ts` re-exports the existing social-image handler at a public path outside `/api/`, so it uses the same service-role-backed storage proxy, image validation, image bytes, MIME response, and retry behavior. The private `property-images` bucket remains private.
4. Removes `app/stays/[slug]/opengraph-image.tsx` to prevent conflicting file-based image metadata; `generateMetadata` defines the one authoritative preview image.
5. `lib/seo.ts` normalizes the site canonical to www for the live domain.
6. `scripts/check-stay-social-preview.mjs` is a dependency-free read-only script that fetches a stay page using a Facebook crawler User-Agent, verifies social tags and downloads the image endpoint to assert it returns actual image bytes.

## Post-deploy verification (required)

From the deployed repository, run:

`node scripts/check-stay-social-preview.mjs the-40-steps-cabin paradiso lone-cedar-cabin-at-lone-cedar-cabins`

The script must report PASS for all three. It should confirm the `og:image` and `twitter:image` URLs are the *same* correct stay-specific `/stay-preview/...` URL and that a crawler-style image request returns HTTP 200, a real `image/*` content type and substantial nonempty bytes.

Then paste the exact live stay links into **Meta Sharing Debugger** (`https://developers.facebook.com/tools/debug/`) and click **Scrape Again**. Facebook can cache old page previews independently of our deployment. Test one freshly shared post on desktop and mobile. Re-scrape only after the verification script passes; a failing image endpoint cannot be fixed by clearing Facebook's cache.

**Full `npm run typecheck` and `npm run build` in the real repository, live crawler verification and an actual Facebook share remain outstanding.** No access was available to publish GitHub code from this chat. The patched files are prepared for deployment, not live.

## What was double-checked

- Read current `main` source for stay metadata, file-based OG handler, robots, preview-image route, private-storage proxy, canonical base URL, calendar logic and guest-email actions.
- Verified production `public_listing_detail` returns **6** photo paths for The 40 Steps Cabin and **12** for Lone Cedar Cabin, matching database photo counts; these aren't missing-photo listings.
- Verified the original October 14 package contains the safeguarded server action, reset button and source-controlled SQL protection. Its edits were augmented, not replaced with an unrelated implementation.
- The reviewed patch applies **20 exact guarded replacements across 11 files**, repeats without further source changes, and aborts on mismatched source; this was tested in a synthetic matching-source fixture.
- TypeScript syntax parsing passed for the modified standalone guest-email action, restore button and new stay preview route. The live full project build is not available in this environment.
- The ThinkReservations nightly data importer includes a potentially unsafe seven-day merge of separated blackout fragments. **This review does not silently change that algorithm or live availability**; compare the source calendar and suspected false gaps before adjusting it.

## No destructive operations

No hosts, payments, reservations, notification histories, images, Stripe configuration, calendar connections, existing active blocks, or website content were changed by the code archive. The production DB guard added in the earlier investigation remains the only applied database change.
