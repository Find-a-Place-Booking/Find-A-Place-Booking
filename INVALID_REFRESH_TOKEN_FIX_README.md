# Invalid Supabase Refresh Token Fix

Fixes repeated server logs like:

`Invalid Refresh Token: Refresh Token Not Found`

Root cause:
- `/host/sign-in` and `/admin/sign-in` were excluded from proxy auth checks.
- Those Server Components still called `supabase.auth.getClaims()`.
- A revoked/stale Supabase auth cookie therefore stayed in the browser and was
  retried on every render/request.

Changes:
- Proxy now validates sessions for host/admin routes, including auth screens.
- Invalid/revoked refresh-token cookies are explicitly expired.
- Protected pages redirect to the correct sign-in screen once.
- Host/admin sign-in pages no longer call `getClaims()` before sign-in.

Apply this overlay, then:

```powershell
npm run typecheck
npm run build
npm start
```

When you first reload the browser, the stale auth cookie should be cleared
automatically. Sign in again normally.

Important database follow-up:
After using `supabase migration repair`, still run:

```powershell
npx supabase db push
```

so migrations 062 and 063 actually execute.
