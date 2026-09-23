# Admin-managed site copy + policy CMS

This expands **Admin → Site content** into a safe wording manager.

Editable public copy now includes the existing Homepage/About blocks plus the
Hosting page, Help, Contact, Stay-search intro, Property Policies explainer,
Booking Terms, Host Agreement, Cancellation Policy and Privacy Notice.

## Intentionally fixed

Buttons and destinations, navigation, Stripe/payment routes, webhooks,
commission calculations, tax calculations, booking states, database IDs,
security checks and operational controls remain code-owned.

The standard 7% host commission display also remains fixed in code so ordinary
copy editing cannot silently change the commercial rule shown by the platform.

## Policy version safety

Editing Booking Terms, Host Agreement, Cancellation Policy or Privacy Notice
publishes the text immediately and automatically advances that policy's version
and effective timestamp. Host onboarding and guest pre-payment policy acceptance
now read the current database-backed versions.

No PaymentIntent, Stripe Connect, webhook, refund or application-fee code is
changed by this overlay.

## Apply

```powershell
npx supabase db push
npm run typecheck
npm run build
```

New migration:

`20260922006700_admin_managed_copy_policy_cms.sql`

Policy edits should be made deliberately: each saved legal section advances the
current version, so finish a legal revision before asking users to accept it.
