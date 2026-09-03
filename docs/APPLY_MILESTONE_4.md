# Milestone 4 — Authentication Foundation

Baseline: verified Milestone 3.5 commit `81346f6`.

This milestone adds real Supabase Auth, cookie/session refresh, host sign-up/sign-in/sign-out, admin sign-in with explicit internal authorization, profile creation from `auth.users`, and the first usable RLS policies. It intentionally does **not** add property CRUD, organizations/onboarding persistence, bookings, payments, calendars, operational email, or public guest accounts.

## 1. Apply the package

Copy the Milestone 4 files over the existing repository. Preserve:

- `.git`
- `.env.local`
- the existing `package-lock.json`

No new npm dependency is required beyond the Supabase packages already installed in Milestone 3.

Add this to `.env.local` if it is not already present:

```text
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Do not commit `.env.local`.

## 2. Run the new SQL migration

In the Supabase SQL Editor, run:

```text
supabase/migrations/20260903000200_auth_foundation.sql
```

The migration:

- creates/updates `profiles` automatically from `auth.users`;
- backfills profiles for any Auth users that already exist;
- adds RLS-safe admin and organization authorization helpers;
- lets authenticated users read their own profile;
- lets active internal admins read profiles and audit history;
- lets users read only their own `admin_users` / role-assignment records;
- keeps organization mutations closed until the host-organization milestone.

## 3. Configure the Supabase confirmation link for local SSR auth

In Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `http://localhost:3000`
- Add `http://localhost:3000/**` as an allowed redirect URL if needed by the dashboard configuration.

In Authentication → Email Templates → Confirm signup, change the confirmation link to use the server-side token-hash endpoint:

```html
<a href="{{ .RedirectTo }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/host/onboarding">
  Confirm email address
</a>
```

This follows the Supabase SSR pattern: the app receives the token hash, verifies it server-side, writes the session cookie, then opens host onboarding.

Keep email confirmation enabled for this test. Production auth email styling/custom SMTP is a later launch-hardening task.

## 4. Create the first internal admin account

There is intentionally **no public admin registration**.

Use Supabase Dashboard → Authentication → Users to create the internal user you want to test with. You can use a project technical/admin email, but do not hard-code any email in source code.

Then run this in SQL Editor, replacing the email:

```sql
insert into public.admin_users (profile_id, status)
select id, 'ACTIVE'::public.admin_account_status
from auth.users
where lower(email) = lower('YOUR_ADMIN_EMAIL@example.com')
on conflict (profile_id) do update
set status = excluded.status,
    updated_at = now();

insert into public.admin_role_assignments (admin_profile_id, role)
select id, 'SUPER_ADMIN'::public.admin_role
from auth.users
where lower(email) = lower('YOUR_ADMIN_EMAIL@example.com')
on conflict (admin_profile_id, role) do nothing;
```

The auth migration backfill/trigger ensures the matching `profiles` row exists.

## 5. Local acceptance tests

Run:

```powershell
npm run typecheck
npm run build
npm run dev
```

Also re-check:

```text
http://localhost:3000/api/health/supabase
```

### Host auth

1. Open `/host` while signed out.
   - Must redirect to `/host/sign-in?next=/host`.
2. Open `/host/onboarding` while signed out.
   - Must redirect to host sign-in and preserve the intended return path.
3. From the public header or `/hosts`, choose to list a property.
   - Must open host account creation, not the protected dashboard.
4. Create a test host account.
   - Weak or mismatched passwords must be rejected cleanly.
   - With email confirmation enabled, the app must show the check-email state.
5. Use the confirmation email.
   - It must create a cookie-backed session and open `/host/onboarding`.
6. Check Supabase:
   - `auth.users` has the user.
   - `public.profiles` has the matching UUID/email/name.
   - No `admin_users` row was created for the host.
7. Sign out from the host portal.
   - Protected host routes must become inaccessible again.
8. Sign back in.
   - The host portal must reopen and session refresh must survive page reloads.

### Admin auth

1. Open `/admin` while signed out.
   - Must redirect to `/admin/sign-in`.
2. Attempt admin sign-in with a normal host account.
   - Access must be denied and the session cleared by the admin sign-in action.
3. Sign in with the explicitly bootstrapped admin account.
   - `/admin` must open.
4. Remove/suspend that `admin_users` record in Supabase and reload `/admin`.
   - Access must be denied.
5. Restore the admin record and verify access again.
6. Sign out from admin.
   - `/admin` must be protected again.

### Regression

Re-check the public marketplace, `/stays`, `/hosts`, the 11-step onboarding UI after authentication, host mobile navigation, admin mobile navigation, and the Supabase health route. Authentication must not alter the verified visual design.

## 6. Do not commit until all tests pass

When accepted:

```powershell
git status
git add .
git commit -m "feat: add Supabase authentication foundation"
git push origin main
git rev-parse --short HEAD
```

Record that hash in `docs/PROJECT_STATE.md` as the known-good Milestone 4 checkpoint before beginning the minimal admin foundation milestone.
