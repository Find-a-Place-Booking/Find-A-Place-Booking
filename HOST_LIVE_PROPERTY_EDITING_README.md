# Host live property editing

This overlay enables hosts to maintain a property after it is published.

## What is now editable for PUBLISHED and PAUSED properties

- listing name/type/description
- public area and address settings
- capacity/bed/bath details
- amenities and custom amenities
- written stay rules/policies
- check-in / checkout / cancellation notes
- calendar preference + notification emails
- property photos
- booking URL / slug (old slugs continue through the existing history system)

PENDING_REVIEW and APPROVED remain locked so an admin review/publication
decision cannot be changed underneath the review workflow.

## Important separation

This patch intentionally does **not** change Stripe, payment routes, webhooks,
refunds, application fees or payment-account logic.

It also stops `save_property_listing()` from writing operational rates/fees.
Rates & fees remain owned by the existing **Rates & fees** dashboard.

The existing Calendar dashboard, Rates & fees dashboard, host public profile
settings and policy-PDF versioning were already editable. The core published
property editor/photos were the missing locked piece.

## Live safety

- A published save must still satisfy the existing minimum publication
  readiness checks.
- A published property cannot delete its final photo. Upload the replacement
  first, then remove the old photo.
- Live edits keep the property `PUBLISHED`; they do not send it back through
  review.
- Every save remains audit logged.
- Existing reservation/policy snapshots are not rewritten by a later listing
  edit.

## Apply

Extract over the project, then run:

```powershell
npx supabase db push
npm run typecheck
npm run build
```

Expected new migration:

`20260922006500_host_live_property_editing.sql`
