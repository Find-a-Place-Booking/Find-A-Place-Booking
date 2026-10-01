# ResNexus login fix

This patch changes only:

`resnexus-worker/src/resnexus.mjs`

It does not touch the booking flow, Stripe, Supabase schema, calendar data, or
host property data.

What it fixes:
- broadens the safe login submit selectors
- falls back to pressing Enter on the password field when ResNexus does not
  expose its visual login control as a normal submit button
- waits for authentication/navigation to settle before evaluating the result
- gives the one-time verification-code form the same safe Enter fallback

Apply:
1. Extract this ZIP into the Find A Place Booking project root.
2. Run `APPLY_RESNEXUS_LOGIN_FIX.cmd`.
3. Commit/push the resulting `resnexus-worker/src/resnexus.mjs`.
4. Let Railway redeploy the `/resnexus-worker` service.
5. Then click Retry on Renea's ResNexus integration.

The patcher fails closed if the source file no longer matches the version this
fix was built against.
