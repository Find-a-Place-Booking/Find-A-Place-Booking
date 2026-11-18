# Find A Place Booking — November 18 focused host improvements

## What this overlay contains

Direct **replacement and new source files**, using paths relative to the production GitHub repository `Find-a-Place-Booking/Find-A-Place-Booking`:

- `components/PropertyVideoManagerClient.tsx` — replacement uploader from the earlier repair, with an explicit read-before-update of the current property video, guarded state, preservation of the old file until the replacement is saved, and better error messages. The 75 MB and 60-second constraints remain intact.
- `lib/property/catalog.ts` — 20 additional cabin/treehouse-related amenity labels (retains all existing labels and `Treehouse` type).
- `app/admin/content/page.tsx` and `components/AdminManagedCopyEditor.tsx` — explicit preview and publish confirmation before any public-copy update. The existing server policy versioning and access permissions are retained; this is *not* a persisted drafts feature.
- `app/host/sign-up/page.tsx` — prominent, accurate guest-paid 7% fee explanation and partner-signup clarification. Does not change signup security, captcha, passwords, or authentication code.
- `app/host/rates/page.tsx`, `app/host/rates/[slug]/extra-fees/page.tsx`, `components/HostOptionalFeeBuilder.tsx` — dropdown-driven, blank amount form for **optional** guest extras using the existing `saveAddOn` flow. Mandatory fees and security deposits are **not** added or routed as optional extras.
- `sql/amenity_catalog_additions.sql` — idempotent DML for the matching labels. This was **already applied** to production on November 18; do not need to run again.
- `docs/guest-paid-fee-policy-review.md` — reviewed draft for aligning legal copy; **not published or executed**.

## DB changes already completed

1. Saved `Saturday (6)` as a blocked check-in **and** checkout day for Melissa Barnes' published Barn House Tree Loft. Creeks Edge Cabin was already configured; both were verified as `[6]` for arrival and departure restrictions.
2. Inserted 20 new active amenity records. Existing selections and property data were not modified.

## Before deployment

- Back up/check the current repository revision and place these files at the exact corresponding paths, preserving the rest of the repository. `app/host/rates/page.tsx` gets a small layout wrapper for the extra-fee link; confirm it still looks clean on mobile.
- Do not publish the proposed legal policy wording yet. `app/auth/actions.ts` still checks hardcoded policy version constants. The existing September hardcode does not match the current host agreement revision in production; that requires a paired follow-up code fix before changing more legal copy.
- Verify Next build, typecheck, and a test account upload (new video, replace, delete; Android and iPhone), along with the no-Saturday booking quote behavior. Local TypeScript **syntax** checks passed, but a full application build and real host test were not available with the current disconnected Vercel production project.
- No SQL migration is required for the included source overlay. The optional fee builder reuses the existing add-on DB schema. It does not add a generic mandatory fee and does not charge refundable deposits.

## Melissa's remaining requirements

- **Existing features:** checkout tasks are edited on the property dashboard and visible to confirmed guests under My Trip; holiday date-rate overrides and higher prices are already stored for both listings; `Treehouse` exists in property types; OwnerRez iCal sync on Barn House was healthy when checked.
- **Not implemented in this overlay:** safe draft-listing duplication of amenities/rules without copying booking/calendar/payment data; separate refundable security deposit authorization/return logic; auditable e-signature acceptance for a rental agreement; expanded OwnerRez booking/rate/message API connection. None should be faked via optional add-ons or just text labels.
- **Draft issue:** Creeks Edge remains a draft. It has photos and holiday overrides but no regular nightly rates or calendar connection; do not force-publish.

## Regression checklist

- An existing property's photos, rates, booking rules, calendar connections, payments and status stay unchanged.
- Upload of a 15.8 MiB / 56.77 sec MP4 to an existing video property replaces the correct video record rather than creating a second row; if storage or database write fails, report error without losing the old video.
- Admin content editor requires explicit review + confirmation; role checks still happen on the server.
- Optional fee is selected by guests only, and host is never allowed to pass a security deposit as an optional add-on through this UI.
- Weekday rules block new Saturday arrivals/departures for both Melissa properties.
- Extra amenity labels appear after code rollout, matching the existing database catalog exactly.
