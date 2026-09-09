# Milestone 8 — Property Review, Approval & Publication

Start from the accepted Milestone 7 + cleanup tree. **Checkpoint Milestone 7 in Git before applying this package.**

Milestone 8 adds real host submission, internal review, separate approval/publication and safe guest-facing reads for `PUBLISHED` listings only. It does **not** add calendar sync, availability, reservations, checkout, payments, taxes or live-money behavior.

## 1. Preserve the Milestone 7 checkpoint

Before applying Step 8:

```powershell
git status
git add .
git commit -m "feat: complete property CRUD and Step 7 cleanup"
git push origin main
git rev-parse --short HEAD
```

Record the hash in `docs/PROJECT_STATE.md` after it is known.

## 2. Copy Step 8 over the existing repository

Preserve:

- `.git`
- `.env.local`
- the existing `package-lock.json`

There are no new npm dependencies.

## 3. Run the two Supabase migrations in order

PostgreSQL enum additions need to commit before code can safely use the new enum value, so Step 8 intentionally uses two migrations.

Run first:

`supabase/migrations/20260909000900_add_changes_requested_status.sql`

Wait for it to succeed. Then run:

`supabase/migrations/20260909001000_property_review_publication.sql`

Do not rerun migrations 001–008.

## 4. Local verification

```powershell
npm run typecheck
npm run build
npm run dev
```

Health route:

`http://localhost:3000/api/health/supabase`

Expected schema:

`property-review-publication-v1`

## 5. Host review-flow test

Use the existing fake host/property.

1. Open `/host/properties/[slug]`.
2. Confirm the Review readiness card lists missing minimum fields if anything required is incomplete.
3. Minimum submission requirements are:
   - property name;
   - description;
   - property type;
   - public area or city;
   - state/region;
   - active primary rentable unit;
   - maximum guests;
   - weeknight rate;
   - at least one real uploaded property photo.
4. Save any missing information.
5. Click **Submit for review**.
6. Confirm status becomes `PENDING_REVIEW`.
7. Confirm host editing/photo mutation is locked while review is pending.
8. Sign out/in and confirm the pending-review state persists.

## 6. Admin review test

Sign in with a `SUPER_ADMIN` or `OPERATIONS_ADMIN` account.

1. Open `/admin/properties`.
2. Confirm the pending property is visibly highlighted/counts in the review queue.
3. Open the property.
4. Test **Request changes** with a required note.
5. Return to host: status should be `CHANGES_REQUESTED`, review note should be visible, editing should be available again.
6. Save an edit and resubmit.
7. Admin: test **Approve listing**.
8. Confirm status is `APPROVED` but the property is still not public.
9. Click **Publish to marketplace**.
10. Confirm status becomes `PUBLISHED`.
11. Confirm review/publication events appear in the append-only property lifecycle and audit log.

Optional negative tests:

- `SUPPORT`, `FINANCE_ADMIN` or `PARTNER_ADMIN` alone must not be able to approve/publish properties.
- Admin review actions must fail if the property is not in the required lifecycle state.

## 7. Public marketplace test

After publication:

1. Open `/` while signed out/incognito.
2. Confirm the published property can appear in Featured stays.
3. Open `/stays` and confirm the published property appears.
4. Confirm the page explicitly says date availability is **not connected yet**.
5. Open `/stays/[current-slug]` and confirm only guest-safe data is shown.
6. Confirm exact street address is hidden unless `exact_address_public` was explicitly enabled.
7. Confirm property photos load while signed out through time-limited signed URLs.
8. Confirm booking/date controls are visibly disabled and cannot reach live checkout.
9. Change the slug only after the listing has been returned to an editable state, preserve the old slug, publish again, then confirm the old public `/stays/[old-slug]` redirects to the current slug.
10. Confirm DRAFT/PENDING/APPROVED/PAUSED/REJECTED listings do not resolve publicly.

The map remains intentionally non-simulated. Published listings are real, but no arbitrary/fake map pins should appear before the real interactive-map subsystem exists.

## 8. Pause test

From Admin on a `PUBLISHED` property:

1. Click **Pause public listing**.
2. Confirm status becomes `PAUSED`.
3. Confirm it disappears from `/` and `/stays` and `/stays/[slug]` no longer resolves publicly.
4. Confirm Admin can publish the paused listing again without rebuilding the record.

## 9. Regression pass

Recheck:

- host/admin auth separation;
- host onboarding persistence;
- partner verification/5% vs 7%;
- property save/reload before submission;
- property photo upload/removal while editable;
- host avatar;
- mobile host property editor/submission state;
- mobile Admin property review controls;
- public homepage/search/property layout;
- Supabase health route;
- typecheck + production build.

## 10. Checkpoint only after acceptance

```powershell
git add .
git commit -m "feat: add property review and publication foundation"
git push origin main
git rev-parse --short HEAD
```

Do not begin the availability/calendar milestone until Step 8 is accepted and checkpointed.
