# Apply Milestone 7 — real property CRUD foundation

> This package also contains the Step 7 cleanup pass. Complete this base Milestone 7 sequence first, then follow `docs/APPLY_MILESTONE_7_CLEANUP.md` and apply migration 008 before the final Git checkpoint.

Starting point: the working Milestone 6 tree after migrations 004, 005 and 006.

**Before copying Milestone 7 over the repo, checkpoint Milestone 6.** The onboarding flow should save, survive refresh/sign-out/sign-in, and show the host organization in Admin. Then commit/push that known-good state and record the hash.

## 1. Copy the package over the existing repo

Preserve:

- `.git/`
- `.env.local`
- `package-lock.json`

`test-data/` is included only to make local testing easy and is ignored by Git.

## 2. Apply only migration 007

Run in Supabase SQL Editor:

`supabase/migrations/20260909000700_property_crud.sql`

Do not edit or rerun earlier migrations merely because this package contains them.

Migration 007 adds:

- `properties`
- `property_units`
- stable current slugs + `listing_slug_history`
- amenity/policy catalogs and structured joins
- base rate settings and structured host fees
- private `property-images` Supabase Storage bucket
- `property_images`
- host property create/save/archive RPCs
- property RLS/read helpers
- photo storage/member policies
- admin property-count visibility
- `host_onboarding_drafts.created_property_id`

## 3. Verify the schema health route

Start the current project and open:

`http://localhost:3000/api/health/supabase`

Expected schema value:

```json
{
  "ok": true,
  "service": "supabase",
  "configured": true,
  "schema": "property-crud-v1"
}
```

## 4. Test conversion from saved onboarding

Use the Step 6 test host whose onboarding is already `READY_FOR_PROPERTY`.

Open:

`/host/properties`

You should see **Create property from saved setup**.

Click it once.

Expected:

- one real `properties` row is created;
- one primary `property_units` row is created;
- onboarding draft receives `created_property_id`;
- clicking/retrying the conversion must not create duplicates;
- organization becomes `ACTIVE` unless archived;
- browser lands on `/host/properties/[slug]`;
- onboarding data is prefilled into the real property editor.

## 5. Test property save/reload

Change several fields, save, refresh, and confirm they persist:

- listing name
- description
- location/public area
- capacity
- weeknight/weekend rates
- cleaning/pet/extra-guest fees
- amenities
- structured policies
- custom policies/amenities
- check-in/out
- notification emails
- calendar preference

Nothing should become publicly bookable.

## 6. Test stable URL + slug history

Note the starting slug, e.g.:

`/stays/pine-hollow-ridge-cabin`

Change the readable slug in the property editor and save.

Expected:

- host editor redirects to the new current slug;
- old slug is visible under **Old URLs preserved**;
- manually opening the old host editor path `/host/properties/[old-slug]` redirects to the new host editor URL;
- an existing/reserved slug is rejected instead of silently stealing another listing's URL.

The public `/stays/[slug]` route remains intentionally unpublished in Milestone 7. Public redirect/publication behavior is part of the approval/public listing milestone.

## 7. Test real property photos

Use the development images in `test-data/` or your own non-sensitive test images.

Upload at least 2 files.

Expected:

- JPG/PNG/WebP up to 10 MB accepted;
- files go into the private `property-images` Storage bucket;
- `property_images` rows are created;
- refresh keeps images visible through signed URLs;
- remove one image and confirm both Storage + database row are removed;
- a normal host cannot upload into another organization's folder/unit.

## 8. Test additional property creation

Open:

`/host/properties/new`

Create a second fake property.

Expected:

- a new independent property + primary unit are created;
- unique slug is generated;
- it appears in `/host/properties`;
- the organization can therefore manage multiple properties from one account.

## 9. Test Admin visibility

As the internal admin account:

- `/admin` shows a real property count;
- `/admin/properties` lists the fake property;
- `/admin/properties/[propertyId]` shows organization, status, location, rates, fees, amenities, policies, notification routing and photos;
- `/admin/hosts/[profileId]` shows the host's real properties;
- admin still has no Step 8 approval action yet.

## 10. Test archive behavior

Archive the throwaway second property.

Expected:

- it disappears from the active host property list;
- row remains in Supabase as `ARCHIVED` rather than being hard-deleted;
- property/unit history remains auditable.

Do not archive the primary test property if you still need it for later milestones.

## 11. Regression pass

Run:

```powershell
npm run typecheck
npm run build
npm run dev
```

Then verify at desktop and phone width:

- `/`
- `/stays`
- `/host`
- `/host/onboarding`
- `/host/properties`
- `/host/properties/new`
- `/host/properties/[slug]`
- `/admin`
- `/admin/hosts`
- `/admin/partners`
- `/admin/properties`
- `/admin/audit`

Also re-test:

- host sign-out/sign-in
- admin sign-out/sign-in
- normal host cannot access `/admin`
- partner claim cannot self-grant 5%
- existing Step 6 onboarding remains editable and persisted

## 12. Milestone acceptance / Git checkpoint

Only after every relevant test passes:

```powershell
git status
git add .
git commit -m "feat: add real property CRUD foundation"
git push origin main
git rev-parse --short HEAD
```

Send the resulting hash back to the build chat before starting Milestone 8.

## Deliberately still disabled after Step 7

- public listing publication/approval
- property approval actions
- live search inventory
- iCal/PMS connection
- availability engine
- reservations/booking holds
- Stripe/Square payment setup
- taxes/ledger/payouts
- live operational email

Milestone 8 should build **admin host/listing review + approval/publication foundation** on top of the verified Step 7 property records.
