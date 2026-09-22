# Auth + Public Partner Cleanup

Fixes two issues:

1. Host dashboard session being wiped while navigating.
   - Public auth routes are now completely passive.
   - They do NOT call Supabase auth.
   - They do NOT clear cookies.
   - This prevents Next.js link prefetches from deleting a valid host session.
   - Stale session cleanup remains in protected-route failure handling and in
     the explicit sign-in action from the previous hard-reset overlay.

2. Public partner advertising removed.
   - `/hosts` now advertises the standard 7% commission only.
   - No 5% partner offer is shown publicly.
   - Partner status remains an internal database/admin assignment.
   - A host account may still show its own partner rate conditionally if the
     organization is explicitly assigned PARTNER_5.

The Header also disables Next.js prefetch on host sign-in/sign-up links as an
extra safeguard around auth endpoints.

Apply AFTER the auth-session-hard-reset overlay.

Then run:

```powershell
Ctrl+C
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run typecheck
npm run build
npm start
```

Sign in once and test several host dashboard links without visiting/signing out.
