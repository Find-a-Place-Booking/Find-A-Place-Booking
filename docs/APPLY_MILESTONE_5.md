# Apply Milestone 5 — Real Admin Foundation

Baseline: verified Milestone 4 commit `19665ba`.

Milestone 5 turns `/admin` from a protected visual shell into a real Supabase-backed internal operations workspace. It intentionally does **not** add host/property CRUD, booking, payments, calendars or operational email systems.

## 1. Preserve the verified baseline

Before copying these files, confirm the current repository is on the verified Step 4 state:

```powershell
git rev-parse --short HEAD
```

Expected baseline:

```text
19665ba
```

Keep `.git`, `.env.local` and the existing `package-lock.json` when copying the Milestone 5 files over the repository.

## 2. Apply the database migration

Run this file in the dedicated Find A Place Booking Supabase SQL Editor:

```text
supabase/migrations/20260903000300_admin_foundation.sql
```

It adds:

- `admin_has_any_role(...)`
- `admin_search_hosts(...)`
- `admin_dashboard_summary()`
- `review_partner_verification(...)`

Partner verification is an atomic database operation. Only `SUPER_ADMIN` and `PARTNER_ADMIN` can change a pending organization to `PARTNER_5` or keep it at `STANDARD_7`, and each decision writes an append-only audit event.

No service-role key is required by the application for this workflow.

## 3. Build/test locally

Run:

```powershell
npm run typecheck
npm run build
npm run dev
```

Then verify:

- `/api/health/supabase` remains healthy.
- Signed-out `/admin` still redirects to `/admin/sign-in`.
- The verified admin account can still sign in and refresh `/admin` without losing its session.
- A normal host account still cannot enter `/admin`.
- `/admin` shows real counts from Supabase rather than the old fake/zero operational metrics.
- `/admin/hosts` loads real host profiles and searches by name/email/phone.
- Opening a result at `/admin/hosts/[profileId]` shows the real profile and any organization memberships.
- `/admin/partners` loads without error. It is expected to be empty until Step 6 persists organizations/partner claims.
- `/admin/audit` loads real append-only history and its filter works.
- Desktop admin sidebar works.
- Mobile admin menu works at roughly 390–430px width.
- Public marketplace and host portal have no visual/auth regressions.

## 4. Optional partner-decision test

The real partner queue will normally become active in Step 6. If you create a temporary `PARTNER_PENDING` organization manually for testing, verify:

1. A `SUPER_ADMIN` can approve it to `VERIFIED` / `PARTNER_5`.
2. The organization receives `partner_verified_by`, `partner_verified_at` and a new commission effective timestamp.
3. The decision creates a `partner_verification.approved` audit event.
4. A separate test pending organization can be kept at `REJECTED` / `STANDARD_7` and creates `partner_verification.kept_standard`.
5. Do not leave disposable test organizations in the production project after testing unless you intentionally want them preserved.

## 5. Commit only after acceptance

When all Step 5 tests pass:

```powershell
git status
git add .
git commit -m "feat: add real admin operations foundation"
git push origin main
git rev-parse --short HEAD
```

Record that hash in `docs/PROJECT_STATE.md` before starting Step 6.

## Next milestone

Milestone 6 should make **host organizations and onboarding persistence real**, including organization creation, membership ownership, onboarding progress and the persisted partner claim that feeds the Step 5 verification queue. Property CRUD should remain a later contained milestone unless the minimum organization workflow requires a very small placeholder relationship.
