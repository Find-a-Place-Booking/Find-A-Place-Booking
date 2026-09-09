# Find A Place Booking — Production Build State

Last updated: 2026-09-09

This is the authoritative technical handoff for the production conversion. Update it after every verified milestone before beginning the next one. Never record secret values here.

## Current verified checkpoint

**Milestone 5 — real admin operations foundation: VERIFIED / PUSHED**

Known-good Git checkpoint supplied by Jake:

`1aee0bb` — Step 5 accepted after local route testing.

Milestone 6 onboarding is now functionally working in local testing after hotfix migrations 005 and 006, including successful saved onboarding. Jake has not yet supplied the Milestone 6 Git commit hash in this chat. **Checkpoint/push that working Step 6 state before applying Milestone 7.**

Verified earlier checkpoints:

- `d0c4695` — Milestone 1 production baseline.
- Milestone 2 — production/demo-data cleanup, verified by Jake; hash was not supplied in the build chat.
- `43dbf81` — Milestone 3 Supabase application foundation.
- `81346f6` — Milestone 3.5 UI/UX + mobile stabilization.
- `19665ba` — Milestone 4 Supabase authentication foundation.
- `1aee0bb` — Milestone 5 real admin operations foundation.

## Current package

**Milestone 8 — property review, approval & publication foundation: IMPLEMENTED, PENDING LOCAL ACCEPTANCE**

Jake reported the Milestone 7 property CRUD + cleanup UI/flows look good locally. A Milestone 7 Git checkpoint hash has not yet been supplied in this chat. **Checkpoint/push the accepted Step 7 tree before applying Step 8.**

Milestone 8 migrations:

- `supabase/migrations/20260909000900_add_changes_requested_status.sql`
- `supabase/migrations/20260909001000_property_review_publication.sql`

Run migration 009 first and let it commit, then run 010. The split is intentional because PostgreSQL enum values must be committed before later functions can safely use them.

### Milestone 8 implementation

- Host can submit a complete editable property (`DRAFT`, `CHANGES_REQUESTED`, `REJECTED`) for admin review.
- Server-side submission validation requires minimum guest-facing completeness: name, description, type, location/state, active primary unit, guest capacity, weeknight rate and at least one uploaded property photo.
- Submission sets `PENDING_REVIEW` and locks host-side listing/image changes while review is active.
- New explicit `CHANGES_REQUESTED` state lets Admin return a listing with a note without treating it as a final rejection.
- `SUPER_ADMIN` and `OPERATIONS_ADMIN` can request changes, approve or reject. Other internal roles remain read-only for property review decisions.
- Approval is deliberately separate from publication: `APPROVED` is still private until an authorized admin publishes it.
- Admin can publish `APPROVED` / `PAUSED` inventory and pause `PUBLISHED` inventory.
- `property_review_events` creates append-only property review/publication history alongside the existing global audit log.
- Host property editor displays review notes/readiness and prevents silent changes underneath a pending/approved/published record.
- Safe public listing RPCs expose only deliberately guest-facing fields from `PUBLISHED` inventory; exact private addresses, host notification emails and internal fields are not exposed.
- Private property images remain in the private bucket; anonymous/authenticated public viewers can receive signed image URLs only when the underlying property is actually `PUBLISHED`.
- `/`, `/stays` and `/stays/[slug]` now read real published Supabase inventory.
- Historical public slugs resolve to the current published slug.
- Public listing UI explicitly keeps availability, reservation and checkout controls disabled.
- The decorative/fake map pins remain disabled; a real interactive map is still a later subsystem.
- Host sidebar/live-property status can reflect actual `PUBLISHED` count.
- Supabase health schema becomes `property-review-publication-v1`.

Acceptance instructions: `docs/APPLY_MILESTONE_8.md`.

Do not start Milestone 9 until migrations 009/010, host submit/return/resubmit, admin approval/publication, public-safe inventory, signed public photos, old-slug resolution, pause/re-publish, auth/mobile regressions, typecheck and production build all pass and Step 8 is committed as a new known-good checkpoint.

---

## Milestone 6 implementation retained below

Database migration:

`supabase/migrations/20260906000400_host_onboarding.sql`

Adds:

- real first host organization creation for an authenticated host;
- real owner membership linking the signed-in profile to that organization;
- persistent `host_onboarding_drafts`;
- persistent `partner_claims` with normalized business/owner/email/phone identifiers;
- organization primary-contact/business-location fields;
- onboarding progress/status (`IN_PROGRESS`, `READY_FOR_PROPERTY`);
- host-owned onboarding RLS reads;
- security-definer RPCs for safe organization initialization and onboarding saves;
- partner claims that can only move a host to `PARTNER_PENDING` while leaving commission at `STANDARD_7`;
- admin partner approval still required for `PARTNER_5`;
- partner-claim submission/withdrawal audit events;
- the existing admin partner-verification RPC updated so normalized claim state follows the admin decision.

Application changes:

- `/host/onboarding` now initializes/loads the real organization and draft from Supabase.
- Every wizard navigation action uses **Save & continue** / saved navigation rather than browser-only state.
- Text inputs, amenities, policies, selected photo filenames and authority confirmation persist across sign-out/sign-in.
- Unsaved edits are visibly marked and browser refresh/close warns when possible.
- Photo files themselves remain local until Supabase property storage is built; only selected filenames are remembered at this milestone.
- `/host` now shows real organization/onboarding progress and the current 5%/7% organization tier.
- `/admin/hosts/[profileId]` now shows real organization contact data, onboarding progress and normalized partner-claim details.
- `/admin/partners` now shows the host-supplied membership identifiers used for manual verification.

Acceptance instructions: `docs/APPLY_MILESTONE_6.md`.

Do not start Milestone 7 until Milestone 6 migration, persistence, partner queue, admin visibility, auth regressions, mobile regressions, typecheck and production build all pass and Milestone 6 is committed as a new known-good checkpoint.

---

## Build rules

1. One milestone at a time.
2. Current milestone must work locally before the next milestone begins.
3. Regression-test earlier verified functionality after every milestone.
4. Create/push a known-good Git checkpoint after every accepted milestone.
5. Preserve the approved demo visual language unless a real product requirement requires a change.
6. Mobile behavior is part of each milestone, not a later cleanup pass.
7. Development stays local-first. Do not deploy to Vercel until hosted behavior is actually required.
8. Payment processors remain test/sandbox-only until every practical end-to-end test is complete and Jake explicitly approves live-money activation.
9. Never commit secrets, API keys, bank details, SSNs or live processor credentials.
10. Email is a notification layer, not the operational source of truth.
11. Important actions/financial changes need durable database state and auditability.
12. Future work must update this handoff with routes, migrations, files changed, environment-variable names, test results, known issues and the next exact milestone.

---

## Product/business rules locked for implementation

### Marketplace

- Standalone Find A Place Booking marketplace, separate from the existing Find A Place AR site.
- Core guest search remains location + dates + guest count, returning only suitable available stays.
- Preserve the clean regional/travel UI; do not turn the product into generic SaaS dashboard design.
- Decorative demo map must be replaced later with a legitimate interactive map tied to real search results, coordinates and availability.

### Commission

- Verified existing Find A Place partners: `PARTNER_5` / 5%.
- Standard/new/unverified hosts: `STANDARD_7` / 7%.
- Hosts cannot self-select 5%.
- Host claim flow: `PARTNER_PENDING` + remains `STANDARD_7` until authorized admin verification.
- Existing partner directory (50–75+ expected) will later support preload/import + likely-match assistance; matching never auto-grants 5%.
- Platform commission base is **nightly lodging subtotal after host discounts only**.
- Cleaning fees, legitimate pet fees, taxes, refundable security deposits and legitimate optional add-ons are excluded from Find A Place commission.
- Prevent hosts from disguising lodging revenue as vague mandatory fees to avoid commission.
- Every booking must later snapshot commission tier, rate and commission base so historical bookings never change when an organization tier changes later.
- Commission changes are audited.

### Host/organization model

- Hosts are organizations, not just loose individual accounts.
- One organization can manage multiple properties.
- Organizations can later contain multiple users/staff with roles.
- Architecture must also support multi-unit properties (for example a cabin resort with several separately rentable units).
- Property/unit-specific notification recipients must be possible later so a multi-property manager can route booking/operations messages appropriately.
- Future payment-account assignment must not assume every managed property/legal owner uses one bank account forever.

### Onboarding UX

Stabilized sequence:

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

Use selection/checkmark systems before free text wherever practical.

Amenities: standardized categories + custom amenities.

Policies: standardized common policy library + configurable values + custom policies. Historical reservations later retain the policy version/snapshot accepted at booking time.

### Property/listing architecture

- Real property CRUD begins in Milestone 7 and is now implemented in the current package.
- Each listing/unit must have an immutable internal ID.
- Each rentable listing must have its own shareable booking URL.
- Host can customize the readable slug subject to uniqueness/reserved-word rules.
- Slug history/redirects must preserve old advertising links after property renames.
- Property address is stored internally for tax jurisdiction, geocoding, mapping and operations; exact-address public visibility is controlled separately.
- Real property image upload/storage begins with property CRUD/storage.


### Step 7 cleanup findings / locked UI requirements

Before Milestone 8, the Step 7 cleanup pass addresses issues found in local property testing:

- Host property cards show the actual first/cover image thumbnail from the private `property-images` bucket when a photo exists.
- Host profiles can store a private avatar/profile image in a dedicated `host-avatars` bucket; guest-facing display remains intentionally deferred.
- Host avatar uploads use a 5 MB application limit; Next.js Server Actions are configured with a 6 MB request-body ceiling so multipart uploads can reach the validator without tripping the framework default 1 MB limit.
- Calendar content below the month grid uses explicit inner padding so connection/status/availability content never sits flush against the board edge.
- Payments UI reserves a persistent current/connected provider area plus clear Stripe Connect and Square management choices. Real provider connection remains disabled until the payment milestone.
- Final reporting requirements are explicitly preserved in the host Reports UI: stay activity, occupancy/ADR, booked revenue, host proceeds, payout states, refunds/refund exposure, platform commission/tier, processor fees, taxes, disputes/chargebacks/adjustments, property performance, discovery/views and booking sources, with future date/property/status/jurisdiction filters and accounting exports.

### Calendar/availability

- Find A Place needs its own canonical availability model.
- Universal baseline: iCal/ICS import/export.
- Direct PMS/channel-manager integrations based on real host demand; OwnerRez is a likely early priority.
- If a PMS is the host source of truth, connect to the PMS rather than building contradictory OTA sync loops.
- Search may use briefly cached availability; checkout must revalidate authoritative availability.
- Future booking flow includes a temporary hold (roughly 10 minutes), final recheck, atomic reservation confirmation, immediate internal block, then external update.

### Payments

- Preferred marketplace processor: Stripe Connect.
- Square is the planned second supported processor.
- Reservation code should use a provider abstraction (`PaymentProvider` → Stripe / Square / future adapters).
- Hosts can continue using a different processor on their own direct website.
- Find A Place platform commission goes to the platform business, not split six ways inside every guest transaction.
- Owner distributions happen separately after business expenses/reserves/tax-distribution policy.
- Raw bank data/SSNs are never stored in Supabase.
- **Open decision before payment implementation:** whether host proceeds follow normal connected-account payout timing or Find A Place deliberately controls delayed release until stay completion/refund exposure clears. Do not promise/build a fund-hold model until the Connect/legal/accounting implications are confirmed.
- Reservation, payment, refund exposure, payout eligibility, payout status and settlement status must be modeled separately.

### Financial ledger/reporting

Before live payments, every booking needs immutable/auditable financial history for:

- guest charge;
- lodging subtotal;
- host fees;
- taxes;
- commission tier/rate/base/application fee;
- processor + processor fee;
- host proceeds;
- refunds;
- chargebacks;
- adjustments.

Corrections use reversals/adjusting entries rather than silently rewriting history.

Admin reporting should eventually support completed stays, upcoming stays, cancellations, refunds/refund exposure, host proceeds, platform commission, processor fees, taxes collected/remitted/pending, payout eligibility/status, chargebacks and accounting date-range/property/host filters.

### Tax/compliance

- Never hard-code “taxes are always the host's responsibility.”
- Tax liability/remittance must be configurable by jurisdiction and liable party (host/platform/provider) according to actual law.
- Arkansas paid-booking obligations require professional confirmation before going live.
- Tax calculations are snapshotted per reservation.
- Tax layer stays provider-neutral; Stripe Tax can be evaluated first, with Avalara/lodging-specialist options if needed.
- National rollout requires jurisdiction/compliance readiness tracking. Paid bookings in a state/region should remain disabled until tax, marketplace/intermediary, seller-of-travel or similar applicable requirements have been reviewed/cleared.

### Admin/operations

- Host portal and internal Admin are separate experiences even though they share Supabase Auth infrastructure.
- Internal roles currently: `SUPER_ADMIN`, `FINANCE_ADMIN`, `OPERATIONS_ADMIN`, `PARTNER_ADMIN`, `SUPPORT`.
- Partners such as Renea can later receive appropriate limited internal roles without unnecessary finance/security access.
- Admin must eventually search host/property/booking/payment IDs, diagnose operational problems, see event/email history and generate financial/accounting reports without digging through email inboxes.

### Email/events

- Development Resend can use `hometownwebservicesar.cc`; sender domain must come from environment variables, never hard-coded in application routes.
- Supabase Auth SMTP is separate from app-level Resend booking/operations email.
- Important operational events later create persistent platform events and email-delivery records.
- Admin should be able to see whether relevant guest/host/internal emails were created/delivered/failed/retried.

---

## Current infrastructure

- Dedicated Supabase project: created and connected.
- Project technical email: `FindAPlaceBookingTech@gmail.com`.
- GitHub organization/repository: Find-a-Place-Booking; last supplied verified checkpoint remains `1aee0bb` (Step 5). Steps 6–7 are currently being tested locally and must receive a new Git checkpoint before Step 8.
- Vercel: Jake's existing Pro account, intentionally not used for normal development yet.
- Resend development sender/domain: Jake's existing account + `hometownwebservicesar.cc`.
- Supabase Auth custom SMTP configured through Resend during Step 4 testing.

Environment-variable names currently reserved/used include:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (legacy fallback)
- `RESEND_API_KEY`
- `EMAIL_DOMAIN`
- `EMAIL_FROM_BOOKINGS`
- `EMAIL_FROM_SUPPORT`
- `EMAIL_FROM_SYSTEM`
- `EMAIL_PLATFORM_NAME`
- `EMAIL_INTERNAL_ALERT_TO`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`

Never record their secret values in Git/handoffs.

---

## Current routes

Public/guest:

- `/`
- `/stays`
- `/stays/[slug]`
- `/checkout`
- `/booking/confirmed`
- `/trip`
- `/trip/[confirmation]`
- `/hosts`

Host:

- `/host/sign-in`
- `/host/sign-up`
- `/host/sign-up/check-email`
- `/host`
- `/host/onboarding`
- `/host/properties`
- `/host/properties/new`
- `/host/properties/[slug]`
- `/host/calendar`
- `/host/reservations`
- `/host/rates`
- `/host/payments`
- `/host/messages`
- `/host/reports`
- `/host/settings`

Auth/admin:

- `/auth/confirm`
- `/admin/sign-in`
- `/admin`
- `/admin/hosts`
- `/admin/hosts/[profileId]`
- `/admin/properties`
- `/admin/properties/[propertyId]`
- `/admin/partners`
- `/admin/audit`

Host routes require a valid Supabase session. Admin routes additionally require an active internal admin grant + role. Normal host authentication does not grant Admin access.

---

## Next exact milestone after Milestone 8 acceptance

**Milestone 9 — availability/calendar foundation**

Expected scope (final slice only after Step 8 passes):

1. canonical internal property/unit availability model;
2. owner/manual availability blocks;
3. property-specific calendar connection records and sync-health state;
4. iCal/ICS import/export baseline;
5. safe conflict detection and source-of-truth rules;
6. no real payment processing;
7. booking holds/reservation engine only after the availability foundation is verified, unless Step 9 is intentionally split into smaller sub-milestones;
8. preserve all Step 8 publication behavior and public/private boundaries.

## Step 6 save hotfixes — 2026-09-09

- Migration `20260909000500_fix_host_onboarding_save.sql` removes contact-field ambiguity.
- Migration `20260909000600_fix_host_onboarding_organization_id.sql` removes the remaining `organization_id` ambiguity.
- Local testing after migration 006 showed onboarding saving correctly and reaching READY_FOR_PROPERTY.
