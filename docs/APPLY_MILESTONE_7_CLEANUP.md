# Apply Step 7 cleanup pass

Starting point: the working Step 7 property CRUD tree after migrations 004–007.

This is a **cleanup/UX pass**, not Milestone 8. It intentionally fixes issues found during Step 7 testing before the property-review workflow is added.

## What changes now

- Host property list shows the actual first/cover property photo thumbnail from private Supabase Storage when available.
- Calendar content below the grid receives proper inner padding/alignment.
- Host profile/account can now store a private profile/avatar photo.
- Next.js Server Action request size is raised to 6 MB so the intended 5 MB avatar upload limit can actually reach the server-side validator.
- Host dashboard header uses the saved avatar when present.
- Settings shows real host/business profile information instead of generic `Not set` placeholders where data already exists.
- Payments page now reserves a clear connected-provider area and visible Stripe/Square management choices for the later payment milestone.
- Reports page now documents the complete reporting library planned for the finished platform instead of implying only four metrics will exist.

## 1. Copy the cleanup package

Copy over the current repo while preserving:

- `.git/`
- `.env.local`
- `package-lock.json`

No npm dependencies are added.

## 2. Apply migration 008

Run only:

`supabase/migrations/20260909000800_step7_cleanup_host_avatar.sql`

Do not rerun 004–007.

Migration 008 adds:

- `profiles.avatar_storage_path`
- private `host-avatars` Storage bucket
- self-only host avatar Storage policies (+ active-admin read)
- `set_my_avatar_path(text)` RPC

## 3. Verify health

Open:

`http://localhost:3000/api/health/supabase`

Expected schema:

```json
{
  "ok": true,
  "service": "supabase",
  "configured": true,
  "schema": "property-crud-v1-cleanup"
}
```

## 4. Test property thumbnail

Open `/host/properties`.

For a property that already has one or more uploaded photos:

- the card should show the actual first/cover image;
- the image should be cropped cleanly into the existing thumbnail area;
- if signing the private URL fails, the count placeholder remains a safe fallback.

## 5. Test host profile photo

Open `/host/settings`.

Upload a JPG, PNG or WebP up to 5 MB. The Next.js Server Action request limit is configured to 6 MB to allow multipart overhead while the application-level avatar limit remains 5 MB.

Expected:

- preview appears in Settings;
- dashboard/header avatar changes from initials to the image;
- refresh/sign-out/sign-in preserves it;
- replacing the image removes the old object after the new path is saved;
- remove-photo returns the UI to initials.

The avatar remains host-portal-only for now. Guest-facing host identity is a later explicit product decision.

## 6. Test calendar spacing

Open `/host/calendar` at desktop and mobile widths.

The `No property calendar connected` content under the calendar should have visible left/right/bottom padding and should no longer sit flush against the container edge.

## 7. Review payment/report scaffolding

`/host/payments` should make the intended final behavior obvious without pretending providers are live:

- current/connected payout method area;
- Stripe Connect option;
- Square option;
- both real connection actions remain disabled until the payment milestone.

`/host/reports` should visibly reserve the final report categories:

- completed/upcoming/cancelled stays + occupancy;
- booked revenue/host proceeds/payout states/refunds;
- platform commission/commission tier/processor fees/adjustments;
- tax collected/remitted/pending;
- disputes/chargebacks/refund exposure;
- property performance, ADR, views/discovery and booking sources.

Exports/filters remain intentionally disabled until ledger/reporting data exists.

## 8. Regression pass

Run:

```powershell
npm run typecheck
npm run build
npm run dev
```

Recheck at minimum:

- `/host`
- `/host/properties`
- `/host/properties/[slug]`
- `/host/calendar`
- `/host/payments`
- `/host/reports`
- `/host/settings`
- `/admin/properties`
- auth sign-out/sign-in
- mobile host navigation

## 9. Git checkpoint

If Step 7 itself has not yet been committed, this cleanup can be included in the same Step 7 acceptance commit after all tests pass:

```powershell
git status
git add .
git commit -m "feat: complete property CRUD and Step 7 cleanup"
git push origin main
git rev-parse --short HEAD
```

If Step 7 was already committed separately, use:

```powershell
git add .
git commit -m "fix: complete Step 7 host UI cleanup"
git push origin main
git rev-parse --short HEAD
```

Send the resulting hash back before starting Step 8.

## Still intentionally deferred

- property review/approval/publication
- live public inventory/search
- real iCal/PMS sync
- real Stripe/Square connection
- booking/reservation engine
- taxes/ledger/payout execution
- report calculations/exports
- guest-facing host profile/avatar
