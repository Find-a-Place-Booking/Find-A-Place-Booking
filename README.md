# Find A Place Booking — Advanced Host Feedback (safe Phase 1)

**Status: source overlay, NOT deployed.** Prepared against main as inspected 2026-11-15. GitHub connector was able to read, but branch creation returned HTTP 403, so production is unchanged.

This is deliberately the **first, low-risk batch** of the host feedback request:

- **Treehouse** selectable as a property type in host onboarding, the new-property form, and existing-property edit form through the shared catalog.
- **20 additional, categorized amenities** shown in onboarding and the existing property editor. Each has a matching DB catalog entry, avoiding the old silent-drop problem.
- **Copy setup** button on the Properties list: copies reusable listing information from an owned property to a **new draft**. It never copies addresses, photos, taxes, booking calendars, reservations, payment accounts, seasonal rules, or a public/published status. Every copy gets its own unique booking URL and will require its own photos, address, tax confirmation, calendar, and review before publish.
- **Clearer holiday premium rate guidance** using the existing date-based pricing rules, without altering pricing logic or existing reservations.

## Applying safely

1. Get a fresh copy of the repository's main branch. Use a feature branch for deployment testing. **Do not run from a directory containing an older overlay.**
2. Unzip this bundle anywhere. From the **repository root** run:
   `python /path/to/fap-advanced-host-safe-phase1/patch/apply.py --dry-run`
3. If no anchors fail, run the same command without `--dry-run`. Original files will be saved in a timestamped `.fap-host-phase1-backup-*` folder.
4. Review `git diff`, run `npm ci`, `npm run typecheck`, `npm run qa:webapp`, and `npm run build` (plus other relevant regression tests). Keep this on a preview branch; do not route guests there.
5. Apply `supabase/migrations/20261115170000_safe_host_feedback_phase1.sql` **to staging** first, then deploy the preview build. Use the project's normal migration process, never a blind production paste. SQL is additive and introduces only one new function.
6. In staging, test a non-admin host cloning one draft, and verify: new status DRAFT, separate slug, unchanged source; zero copied photos, calendars, availability blocks, reservations or payment links. Test selected new amenities survive save/reload and treehouse persists.
7. Only after these checks and a production backup, apply the additive migration to production **before** deploying the verified code; then merge/deploy. After release, run the same checks with test accounts. Existing properties should remain unchanged.

## Scope boundary

Not in Phase 1: weekday arrival/departure restrictions (requires enforcement in canonical booking holds and quote path), guest checkout tasks, deposits, rental signatures, full OwnerRez integration, bulk image copy. Those require their own schema + host UI + guest checkout guards + regression suite. Implementing them as decorative settings without server validation would be dangerous.

## Rollback

Restore four original files from `.fap-host-phase1-backup-*`, remove the new migration **from source only if it has not run** and redeploy. If the migration has run, it can remain safely: the new catalog entries/function do not affect existing booking logic, and no existing rows are rewritten. Do not delete a copied draft if it has already been edited by a host.

## Regression tests to perform

- Host cannot clone a property from an organization they do not manage.
- New listing remains DRAFT; source retains its status, slug, policy and price data.
- Copying never creates reservations, availability blocks, calendar connections or photos.
- Fresh listing cannot publish until normal required fields and Stripe checks pass.
- New amenities survive save/reload; existing amenity labels remain unchanged.
- Airbnb/Vrbo/ResNexus calendar sync, guest quote and Stripe checkout behave exactly as before.
- Host rates: date override price calculated on the exact date with no change to historical reservations.
