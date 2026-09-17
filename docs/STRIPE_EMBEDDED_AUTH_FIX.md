# Stripe embedded onboarding authentication fix

This patch fixes the first embedded-onboarding overlay.

## What was wrong

The first version created a legacy typed Express account (`type=express`) and
then mounted the newer Connect embedded Account onboarding component. It also
assumed the local Account Session endpoint always returned JSON.

That combination could surface:

- "Something went wrong. There was an error during authentication."
- "Unexpected end of JSON input"

## What changed

New connected accounts are created using Stripe's fully embedded platform
configuration:

- `controller[stripe_dashboard][type]=none`
- `card_payments` capability requested
- `transfers` capability requested

The account remains Stripe-owned for sensitive onboarding data while the host
interacts with the Account onboarding component inside Find A Place.

If the local payment account already points at the incompatible sandbox account
created by the earlier overlay, this patch automatically creates a replacement
test account and updates the local `provider_account_id`.

The Account Session API route now always returns JSON errors, and the browser
client no longer blindly calls `response.json()` on an empty response.

## Important

This replacement behavior is specifically appropriate for the current sandbox
test phase. Do not use automatic account replacement logic as a migration
strategy for real connected accounts after launch.
