# Find A Place Booking — Production Build State

Last updated: 2026-09-03

This file is the living technical handoff for the production build. Update it after every verified milestone **before** beginning the next milestone.

## Current state

**Milestone 1 — production repository bootstrap: COMPLETE / PUSHED**

Known-good baseline commit supplied by Jake:

`d0c4695` — `chore: establish production baseline`

**Milestone 2 — production shell / placeholder-data removal: VERIFIED BY JAKE**

Jake reported that Step 2 looks good. The Milestone 2 commit hash was not supplied in-chat when this package was prepared. If it has not already been committed/pushed, preserve it as a known-good checkpoint before applying Milestone 3.

**Milestone 3 — Supabase application foundation: VERIFIED / PUSHED**

Known-good Milestone 3 checkpoint supplied by Jake:

`43dbf81` — Supabase foundation accepted after package install, local typecheck/build, health-check and UI regression testing.

**Milestone 3.5 — UI/UX stabilization: IMPLEMENTED, PENDING JAKE LOCAL ACCEPTANCE**

This pass stabilizes the production interface and mobile behavior before authentication is introduced. It intentionally changes no Supabase schema and adds no real auth, CRUD, booking, payment or calendar-sync behavior. Do not begin Milestone 4 until desktop/mobile regression tests pass and Step 3.5 has its own known-good Git checkpoint.

## Build rules

1. Work one milestone at a time.
2. Do not begin the next milestone until the current milestone works locally and has been regression-checked against all earlier verified functionality.
3. Preserve a known-good Git commit/checkpoint after every completed milestone.
4. Keep the approved original visual language and UX unless a product requirement specifically calls for a change.
5. Local-first development. Do not deploy to Vercel merely because code was committed.
6. Payment integrations stay in test/sandbox mode until all practical end-to-end testing is complete and live-money activation is explicitly approved.
7. Never place secrets, API keys, banking data, SSNs, or live processor credentials in this file or Git.
8. Email is a notification layer, not the source of truth. Operational events, bookings, financial activity and diagnostic state will be persisted in the application database/admin system.
9. Every milestone must be regression-checked so later work does not break previously verified behavior.

## Product rules locked before backend implementation

- Marketplace remains a network-wide booking/search product centered on location, dates and guest requirements.
- Existing Find A Place partner properties: **5% platform commission**.
- Other properties: **7% platform commission**.
- Platform commission is calculated from the **nightly lodging subtotal after host discounts**, not cleaning fees, pet fees, taxes, refundable deposits or legitimate optional add-ons.
- Mandatory/vague fee categories must not be usable to disguise lodging revenue and evade commission.
- Host setup uses curated checkbox/toggle selections where practical, including categorized amenities and common property policies, so hosts select rather than write wherever reasonable.
- Property onboarding now follows the stabilized UI sequence: Host profile → Property → Location & capacity → Amenities → Photos → Rates & fees → Policies → Calendar → Payments → Partner status → Review.
- Exact property address is collected for future map/tax/operational use while the guest-facing experience can present the general area according to the platform privacy rule.
- Policies include configurable common rules plus an optional custom-policy field for uncommon/property-specific rules.
- Only selected policies should render on the public listing, and booked reservations must later retain a policy snapshot from booking time.
- Admin and host experiences are separate. Host portal is for host organizations/staff; internal admin is for platform operations, finance, support, partners and technical administrators according to permissions.
- Important operational events must be searchable and diagnosable in admin without relying on email inbox history.
- Important booking/payment/host events will later be persisted, surfaced in admin, and use email as an alert/communication layer.
- Hosts cannot self-award the 5% partner tier. A claimed current Find A Place partner begins `PARTNER_PENDING` while remaining `STANDARD_7` until authorized staff verification.
- Partner verification will have an internal admin queue, support preloading/importing the existing 50–75+ partner directory, assist with likely matches, and never auto-grant `PARTNER_5`.
- Every commission-tier change must be audit logged with actor/time/reason; reservations must snapshot their commission tier/rate when created so later account changes never rewrite history.
- Replace the decorative Explore-by-area artwork with a legitimate interactive production map tied to real search/property coordinates and availability results. It must support pan/zoom, listing markers/clustering, result synchronization and the existing clean visual language.

## Milestone 2 changes

### Production catalog

- Replaced the old `data/demo.ts` presentation inventory with a zero-data compatibility shim so applying this package over the baseline cannot leave fake inventory behind.
- Added `data/catalog.ts` as the temporary typed catalog boundary and moved production imports to it.
- `properties` is intentionally empty until Supabase supplies approved live listings.
- Regional destinations remain as editorial/search configuration only; they do not claim inventory counts or availability.

### Guest/public experience

- `/` keeps the approved search-led marketplace layout but no longer displays sample cabins.
- Featured-stay area now has an intentional zero-inventory state.
- Removed fixed sample travel dates from homepage destination links and search defaults.
- `/stays` renders a clean no-inventory state while keeping search, filters, sorting and map layout intact.
- `/stays/[slug]` no longer falls back to a sample listing. Unknown/unconnected listings resolve through the polished not-found state.
- `/checkout` no longer falls back to a fake property or simulated card data.
- `/booking/confirmed` no longer generates a fake confirmation/guest/reservation.
- Added `/trip` as the future trip-lookup shell.
- `/trip/[confirmation]` no longer fabricates reservation details.
- Header/footer no longer link to a hard-coded confirmation ID.

### Host/public sales experience

- Removed the superseded flat monthly host-subscription/0%-commission messaging.
- Public host pricing now communicates the current 5% partner / 7% standard commission structure and lodging-only commission base.
- Host onboarding fields begin blank rather than prefilled with a sample business/property/person.
- Amenities are curated checkbox selections with an optional other-amenities field.
- Policies are curated checkbox selections plus a custom-policies field.
- Payment/calendar onboarding no longer pretends to connect an account or feed; those controls remain gated until the real backend milestones.
- Review/submission does not pretend to create a property yet.

### Host portal

- Removed sample organization/property names, reservations, messages, rates, bookings, payout activity, taxes, reports and metrics.
- Dashboard, properties, calendar, reservations, rates, payments, messages, reports and settings now use honest zero-data/setup states.
- `/host/properties/[slug]` does not fabricate a property record while no source of truth exists.

### Admin portal

- Removed sample approvals, hosts, bookings, revenue, subscriptions, regional counts, issues and charts.
- Admin is now framed as a separate internal operations workspace.
- Preserved the intended future areas for host search, approvals, reservations, operational issues, activity history and finance/ledger visibility.
- Admin copy explicitly reserves traceability across host/property/booking/payment/notification/event records without using email as the operational database.

## Current routes

### Public / guest

- `/`
- `/stays`
- `/stays/[slug]`
- `/checkout`
- `/booking/confirmed`
- `/trip`
- `/trip/[confirmation]`
- `/hosts`

### Host

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

### Internal admin

- `/admin`

Authentication/authorization is **not connected yet**. The route separation is visual/structural only until the dedicated auth/RLS milestone.

## Infrastructure decisions

- Dedicated Supabase project: created by Jake. Milestone 3 source integration is implemented and awaits Jake applying the migration/configuring local keys.
- Dedicated technical/project Gmail: `FindAPlaceBookingTech@gmail.com`.
- GitHub: `Find-a-Place-Booking` organization; baseline pushed.
- Vercel: use Jake's existing Vercel Pro account only when hosted testing becomes necessary; do not deploy yet.
- Resend during development: Jake's existing Resend account using `hometownwebservicesar.cc`.
- Email sender/domain configuration must be environment-driven; email routes must never hard-code the sender domain.
- Production Resend domain will be swapped through environment configuration before launch.

## Environment variable names reserved

See `.env.example`:

- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferred for new Supabase projects)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy fallback)
- `SUPABASE_SECRET_KEY` (reserved, server-only, later)
- `SUPABASE_SERVICE_ROLE_KEY` (legacy/server-only, later if needed)
- `RESEND_API_KEY`
- `EMAIL_DOMAIN`
- `EMAIL_FROM_BOOKINGS`
- `EMAIL_FROM_SUPPORT`
- `EMAIL_FROM_SYSTEM`
- `EMAIL_PLATFORM_NAME`
- `EMAIL_INTERNAL_ALERT_TO`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

Real secrets belong in local/Vercel environment configuration and must not be committed.

## Milestone 2 verification

Jake reported that Step 2 looks good. Preserve its accepted state as a Git checkpoint before applying Milestone 3 if that commit has not already been made.

## Milestone 3 changes

### Supabase application boundary

- Added `@supabase/supabase-js` and `@supabase/ssr` dependencies.
- Added `lib/supabase/config.ts` with lazy environment validation and support for Supabase's preferred publishable key plus legacy anon-key fallback.
- Added `lib/supabase/client.ts` for browser/client-component usage.
- Added `lib/supabase/server.ts` for user-scoped Server Components, Server Actions and Route Handlers.
- Auth refresh/proxy behavior is intentionally deferred to the dedicated auth milestone; no route protection was introduced yet.
- Added `/api/health/supabase`, which verifies that the application can reach the expected foundation schema without returning secrets or table contents.

### Foundation database migration

Added `supabase/migrations/20260903000100_foundation.sql` creating:

- `profiles`
- `organizations`
- `organization_members`
- `admin_users`
- `admin_role_assignments`
- `audit_logs`

Supporting enums establish organization/member/admin status and the locked partner states `NOT_CLAIMED`, `PARTNER_PENDING`, `VERIFIED`, `REJECTED`, plus `STANDARD_7` and `PARTNER_5`.

The migration also adds UUID/timestamp conventions, updated-at triggers, useful indexes, append-only protection for audit logs, and enables RLS on all foundation tables. No public RLS policies are added yet, so the data remains closed until the auth/RLS milestone.

The organization constraint prevents `PARTNER_5` unless the organization is `VERIFIED`. Claimed/unverified partners therefore remain `STANDARD_7` by schema default. The future admin verification workflow will perform the authorized transition and write the audit entry.

### Documentation

- Added `supabase/README.md`.
- Added `docs/DATABASE_CONVENTIONS.md`.
- Added `docs/APPLY_MILESTONE_3.md`.
- Updated `.env.example` for Supabase's current publishable-key model while preserving legacy anon-key compatibility.

## Milestone 3 packaging verification

- Existing Step 2 application source/UI files were not intentionally redesigned in this milestone.
- New TypeScript/TSX files were syntax checked in the packaging environment.
- Migration source was reviewed for the expected foundation entities, RLS enablement, partner-tier constraint and append-only audit protection.
- Full dependency-backed `npm install`, `npm run typecheck` and `npm run build` remain Jake's local acceptance gate because the packaging environment could not reliably install npm dependencies.
- Live Supabase connectivity cannot be tested here because project keys are intentionally not present in the package. Jake validates it locally through `/api/health/supabase` after applying the migration.

## Jake acceptance checklist for Milestone 3

Follow `docs/APPLY_MILESTONE_3.md`. At minimum:

1. Confirm Milestone 2 has its own committed known-good checkpoint.
2. Copy Milestone 3 over the existing repository while preserving `.git`.
3. Run `npm install` so the existing `package-lock.json` picks up the Supabase dependencies.
4. Configure `.env.local` with the dedicated project URL and publishable/anon public key.
5. Apply `supabase/migrations/20260903000100_foundation.sql` to the dedicated Supabase project.
6. Run `npm run typecheck`, `npm run build`, then `npm run dev`.
7. Open `/api/health/supabase` and verify `ok: true`, `schema: foundation-v1`.
8. Regression-check `/`, `/stays`, `/hosts`, `/host/onboarding`, `/host`, `/admin`, `/checkout`, and `/trip`.
9. Fix any regression before committing.
10. Commit/push Milestone 3 and record the hash.

## Milestone 3.5 changes

### Mobile-first navigation and layout

- Added an actual mobile navigation menu to the public header rather than simply hiding desktop navigation.
- Added mobile Host menu access to every host-dashboard route when the desktop sidebar collapses.
- Added mobile Admin menu access to operational sections when the desktop admin sidebar collapses.
- Tightened mobile spacing, dashboard metrics, toolbar behavior, calendar sizing, filter scrolling, forms and onboarding controls for narrow screens.
- Form controls use mobile-safe sizing to avoid iOS input zoom behavior.

### Stabilized host onboarding UI

The host setup is now an 11-step guided flow:

1. Host profile
2. Property
3. Location & capacity
4. Amenities
5. Photos
6. Rates & fees
7. Policies
8. Calendar
9. Payments
10. Partner status
11. Review

- UI state persists while moving between onboarding steps during the local session so the workflow can be tested realistically before database persistence is added.
- Amenities are grouped into expandable categories with standardized checkbox choices, counts and a custom-amenities field.
- Policies are grouped into expandable categories with conditional detail controls for quiet hours, pets and minimum booking age, plus custom policies.
- Property location now distinguishes exact address information from the general public search area and reserves the exact-address privacy behavior needed for mapping/taxes.
- Rates and legitimate host fees are visually separated; the lodging-only commission rule remains explicit.
- Local photo selection can preview chosen images for UX testing only; nothing is uploaded or persisted in this milestone.
- Calendar and payout setup screens explain the intended production behavior but stay disabled until their backend milestones.
- Existing-partner claim UI implements the locked verification model: a claimed partner is pending and remains at 7% until authorized staff approval.
- Review summarizes entered UI state without pretending submission is live.

### Admin UX

- Added a visible Partner Verification Requests area reserving the future review flow, likely-match assistance, `PARTNER_5` approval / `STANDARD_7` retention and audit requirement.
- Admin remains a zero-data operations shell until the later backend milestones.

### Guest/search UX

- The decorative map shell no longer presents sample geography as if it were live when production inventory is empty. It now clearly reserves the location for the future real interactive map tied to search results.
- The approved guest search-led design remains intact.

### Backend impact

- No new Supabase migration.
- No authentication yet.
- No property CRUD or storage yet.
- No real calendar, payment, booking, email or map integration yet.

## Next exact milestone after acceptance

**Milestone 4 — authentication identity lifecycle + first RLS policies**

Keep it isolated:

1. wire Supabase signup/login/session handling using the existing `profiles` foundation;
2. add the Next.js auth proxy/session-refresh path required by the current Supabase SSR pattern;
3. establish profile creation/synchronization for authenticated users;
4. add the first explicit RLS policies for a user to read/update only their own profile;
5. do not yet combine full host organization onboarding/property CRUD into the same milestone;
6. verify all public Step 2 UI and the Milestone 3 health/database foundation still work;
7. checkpoint before moving into host organization membership/onboarding.

## Git checkpoints

- Milestone 1 baseline: `d0c4695` — `chore: establish production baseline`
- Milestone 2: verified by Jake; commit hash not supplied in chat when Milestone 3 was packaged.
- Milestone 3: `43dbf81` — verified Supabase application foundation.
- Milestone 3.5: pending Jake desktop/mobile acceptance and commit hash.
