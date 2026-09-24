Find A Place Booking password recovery fix

Fixes the SSR/PKCE recovery callback.

What was wrong:
- resetPasswordForEmail sends the user through Supabase /verify.
- Supabase consumes the one-time recovery token and redirects back to the app
  with a PKCE authorization `code`.
- app/auth/confirm/route.ts only handled token_hash + type, so it discarded
  the valid `code` instead of exchanging it for the recovery session.
- The first email click was therefore consumed successfully, but the user was
  never given the session needed by /auth/update-password. Re-clicking the
  same email then correctly failed because the token was one-time-use.

This overlay:
- handles `code` with exchangeCodeForSession()
- preserves token_hash/type support
- sends failed recovery links back to the reset page with a useful error

No database or admin-role changes are included.
