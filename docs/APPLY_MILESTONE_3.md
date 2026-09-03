# Apply / Verify Milestone 3 — Supabase Foundation

Milestone 3 must be applied only after Milestone 2 is committed as a known-good checkpoint.

## 1. Preserve Milestone 2 first

If Milestone 2 has not already been committed/pushed after Jake's acceptance:

```powershell
git status
git add .
git commit -m "chore: complete production shell cleanup"
git push origin main
git rev-parse --short HEAD
```

Record that hash in `docs/PROJECT_STATE.md` after applying this package if it was not already known when the ZIP was created.

## 2. Copy Milestone 3 over the existing repo

Do not create a new Git repository. Copy this package over the existing project directory while preserving its `.git` directory.

Milestone 3 adds dependencies, so run:

```powershell
npm install
```

This will update the existing `package-lock.json`. Keep that updated lockfile when Milestone 3 is committed.

## 3. Create local Supabase environment variables

Copy `.env.example` to `.env.local` if needed.

From the Supabase project Connect/API settings, set:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

For projects/dashboard views that still present a legacy anon key, this build also accepts:

```text
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Prefer the publishable key for a new project. Do not commit `.env.local`.

No service-role/secret key is required for this milestone's app smoke test.

## 4. Apply the database migration

Apply the contents of:

`supabase/migrations/20260903000100_foundation.sql`

to the dedicated Find A Place Booking Supabase project.

For this milestone, using the Supabase Dashboard SQL Editor is acceptable. Keep the migration file in Git as the authoritative source-controlled record of what was applied.

The migration should create:

- `profiles`
- `organizations`
- `organization_members`
- `admin_users`
- `admin_role_assignments`
- `audit_logs`

It also creates supporting enum types, indexes, updated-at triggers, append-only audit protection and enables RLS with no public policies yet.

## 5. Verify the application connection

Run:

```powershell
npm run typecheck
npm run build
npm run dev
```

Open:

`http://localhost:3000/api/health/supabase`

Expected response after the migration and env configuration:

```json
{
  "ok": true,
  "service": "supabase",
  "configured": true,
  "schema": "foundation-v1"
}
```

This endpoint intentionally does not return database records or secrets.

## 6. Regression check Milestone 2

Because Milestone 3 is infrastructure-only, the visible application should remain effectively unchanged. Recheck at least:

- `/`
- `/stays`
- `/hosts`
- `/host/onboarding`
- `/host`
- `/admin`
- `/checkout`
- `/trip`

Confirm there are still no demo cabins/fake operational records and no visual regressions.

## 7. Checkpoint only after verification

When the health check, typecheck/build and UI regression checks all pass:

```powershell
git status
git add .
git commit -m "feat: add Supabase application foundation"
git push origin main
git rev-parse --short HEAD
```

Send the new commit hash and test results before beginning the next milestone.
