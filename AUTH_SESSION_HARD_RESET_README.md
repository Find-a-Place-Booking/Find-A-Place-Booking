# Supabase Session Hard Reset

This replaces the previous invalid-refresh-token patch.

The previous patch still called `supabase.auth.getUser()` on the public sign-in
routes. That call itself attempts refresh, so a dead refresh token could still
produce `refresh_token_not_found`.

New behavior:
- `/host/sign-in`, `/host/sign-up`, `/host/sign-up/check-email`, and
  `/admin/sign-in` do NOT call Supabase auth in the proxy.
- Any Supabase auth cookies on those login routes are expired locally.
- Host/admin sign-in actions clear prior auth cookies BEFORE calling
  `signInWithPassword`.
- Protected host/admin routes catch invalid auth state, clear local cookies,
  and redirect once.
- Sign-out succeeds locally even if Supabase says the refresh token is gone.

After extracting into the project root:

```powershell
Ctrl+C
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run typecheck
npm run build
npm start
```

Then open a fresh tab at:

http://localhost:3000/host/sign-in

Do not restore the previous invalid-refresh-token overlay after this one.
