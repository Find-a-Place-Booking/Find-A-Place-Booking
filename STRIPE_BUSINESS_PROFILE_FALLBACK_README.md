# Stripe Business Profile Fallback

This overlay only changes Stripe connected-account onboarding/profile setup.
It does NOT change booking PaymentIntents, direct-charge routing, application
fees, refunds, or webhook payment handling.

## What changes

- Every new Stripe connected merchant gets a clear product/service description.
- If the host has a PUBLISHED Find A Place property, Stripe receives that
  public `/stays/<slug>` page as the business URL.
- A host does not need to own a separate standalone website.
- If there is no published public listing yet, Stripe still receives a useful
  product/service description and the business URL is omitted.
- Existing connected accounts are repaired when the host reopens Stripe setup:
  the profile is refreshed before the Account Session opens. This is intended
  to replace unrelated/manual URLs such as the Webvidence URL used during the
  first live test.

## Current restricted live test account

After deploying this overlay, return to Host -> Payments & taxes and reopen the
Stripe onboarding/setup flow for the existing account. Find A Place will update
the existing Stripe account profile before Stripe renders the remaining
requirements. Stripe may still require the account holder to confirm/resubmit
the information or wait for review before card payments become active.

## Files

- `app/api/stripe/connect/account-session/route.ts`
- `lib/payments/stripe-rest.ts`

No database migration is required.

Run:

```powershell
npm run typecheck
npm run build
```
