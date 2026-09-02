# Find A Place Booking — Production Build State

Last updated: 2026-09-02

This file is the living technical handoff for the production conversion. Update it after every verified milestone **before** beginning the next milestone.

## Current verified state

**Milestone 1 — production repository bootstrap: COMPLETE**

The supplied `find-a-place-booking-demo-v2-main` source has been preserved visually and functionally as the baseline front end. This milestone intentionally does **not** remove demo listings or wire Supabase/backend systems yet.

The repository is ready to be pushed into the dedicated **Find-a-Place-Booking** GitHub organization. Local development remains the source of truth until a later milestone explicitly requires Vercel testing.

## Build rules

1. Work one milestone at a time.
2. Do not begin the next milestone until the current milestone works locally and has been regression-checked against all earlier verified functionality.
3. Preserve a known-good Git commit/checkpoint after every completed milestone.
4. Keep the existing demo's visual language and UX unless a product requirement specifically calls for a change.
5. Local-first development. Do not deploy to Vercel merely because code was committed.
6. Payment integrations stay in test/sandbox mode until all practical end-to-end testing is complete and live-money activation is explicitly approved.
7. Never place secrets, API keys, banking data, SSNs, or live processor credentials in this file or Git.
8. Email is a notification layer, not the source of truth. Operational events, bookings, financial activity and diagnostic state will be persisted in the application database/admin system as later milestones are implemented.

## Product rules already locked

- Marketplace remains a network-wide booking/search product centered on destination/location, dates and guest requirements.
- Existing Find A Place partner properties: **5% platform commission**.
- Other properties: **7% platform commission**.
- Platform commission is calculated from the **nightly lodging subtotal after host discounts**, not cleaning fees, pet fees, taxes, refundable deposits or legitimate optional add-ons.
- Mandatory/vague fee categories must not be usable to disguise lodging revenue and evade commission.
- Host setup should use curated checkbox/toggle selections where practical, including policies and amenities, with custom policy support for uncommon rules.
- Admin and host experiences are separate. Host portal is for host organizations/staff; internal admin is for platform operations, finance, support, partners and technical administrators according to permissions.
- Important operational events must be searchable and diagnosable in admin without relying on email inbox history.

## Current codebase

### Public / guest routes

- `/`
- `/stays`
- `/stays/[slug]`
- `/checkout`
- `/booking/confirmed`
- `/trip/[confirmation]`
- `/hosts`

### Host routes

- `/host`
- `/host/onboarding`
- `/host/properties`
- `/host/properties/[slug]`
- `/host/calendar`
- `/host/reservations`
- `/host/rates`
- `/host/payments`
- `/host/messages`
- `/host/reports`
- `/host/settings`

### Admin route

- `/admin`

### Current demo data

`data/demo.ts` currently supplies presentation listings, reservations, destinations and host dashboard data. It remains in place for Milestone 1 so the baseline can be regression-tested. Removing/replacing this data is **Milestone 2**, not part of this checkpoint.

## Infrastructure decisions

- Dedicated Supabase project: created by Jake; not wired into source yet.
- Dedicated technical/project Gmail: `FindAPlaceBookingTech@gmail.com`.
- GitHub destination: dedicated `Find-a-Place-Booking` organization/repository.
- Vercel: use Jake's existing Vercel Pro account when hosted testing becomes necessary; do not deploy yet merely for repository setup.
- Resend during development: Jake's existing Resend account using `hometownwebservicesar.cc`.
- Email sender/domain configuration must be environment-driven; routes must never hard-code the sender domain.
- Production Resend domain will be swapped through environment configuration before launch.

## Environment variable names reserved

See `.env.example`. Names currently reserved include:

- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `EMAIL_DOMAIN`
- `EMAIL_FROM_BOOKINGS`
- `EMAIL_FROM_SUPPORT`
- `EMAIL_FROM_SYSTEM`
- `EMAIL_PLATFORM_NAME`
- `EMAIL_INTERNAL_ALERT_TO`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

These are names only. Real secrets belong in local/Vercel environment configuration and must not be committed.

## Validation for this milestone

Packaging verification completed:

- application/component/data source files were left unchanged from the supplied demo baseline;
- no backend/payment behavior was introduced;
- no live credentials were added;
- `.env.example` contains names/placeholders only;
- repository/bootstrap documentation was added.

Dependency installation in the packaging environment timed out before `node_modules` could be installed, so the Next.js build could not be re-run here. Because Milestone 1 does not alter application source, the final acceptance gate is to run `npm install`, `npm run typecheck`, and `npm run build` on Jake's local checkout after pushing/cloning the new GitHub repository. **Do not begin Milestone 2 until those checks pass.**

## Known demo-era items intentionally left for the next milestone

The front end still contains presentation-only content, including demo properties, sample reservations/messages, sample confirmation IDs and old subscription-era host/admin copy. These are intentionally retained in Milestone 1 to avoid combining repository bootstrap with product-data cleanup.

They must be removed or converted into real empty/configurable states in Milestone 2 while preserving the approved UI design.

## Next exact milestone

**Milestone 2 — production shell / demo-data removal**

Do not begin until Milestone 1 has been pushed to the new GitHub repository and Jake confirms the repository/local checkout is functioning correctly.

Milestone 2 should:

1. inventory every hard-coded/demo-only data source and stale subscription-era statement;
2. remove presentation cabins, bookings, messages, financial figures, host/company identities and fake operational counts from the production-facing state;
3. replace them with intentional empty/loading/setup states that preserve layout and visual integrity;
4. preserve development-only test/seed data separately if useful for local component testing;
5. update the old subscription/0%-commission language to the current 5%/7% commission model where public-facing copy must remain;
6. regression-test every existing route before moving on to Supabase integration.

## Git checkpoint

After pushing this package to the new repository, create the first known-good checkpoint commit/tag and record its commit hash here in the next update.
