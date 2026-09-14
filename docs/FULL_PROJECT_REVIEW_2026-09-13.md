# Find A Place Booking — Full Project Review — 2026-09-13

Reviewed remote baseline: `878b88e` (`Latest 9A+Review`) plus the complete production build from auth through Milestone 9A.

## Result

The project is still pointed in the intended direction. No redesign or foundational rollback is indicated. The major subsystem boundaries remain clean enough to continue into 9B after the 9A.1 hardening pass.

## Confirmed alignment

### Account / organization / property flow

- Supabase Auth protects host/admin routes while public marketplace routes remain outside the auth proxy.
- Hosts operate through organizations; one organization can manage multiple properties and the schema already supports multiple rentable units.
- The first property can be created exactly once from the persisted onboarding draft; later properties use normal property CRUD.
- Property identity, slug history, private photos, amenities/policies, review/approval/publication and Admin visibility remain separate from booking/payment state.

### Onboarding

The 11-step flow remains appropriate:

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

Onboarding persists across sessions. Actual property photos remain a property-storage action rather than pretending local preview files were uploaded. Calendar preference persists but connections remain disabled. Payment onboarding remains disabled. Partner claims remain 7% until authorized verification.

Two flow mismatches were found and are fixed in 9A.1:

- an onboarding extra-guest fee previously had no included-guest threshold to determine when the fee starts;
- host setup could be marked ready without a property name even though first-property creation requires one.

### Pricing ownership

- `/host/rates/[slug]` is the operational pricing owner.
- Property identity saves no longer overwrite rates in a stale-tab scenario.
- Base weekday/weekend rates, date overrides, minimum-stay rules, fees, add-ons and promotions are all platform-owned Supabase data.
- Calendar/PMS availability remains a separate future subsystem.
- Stripe/Square are future payment adapters, not pricing engines.

### Promotions

The current promo foundation already supports percentage/fixed discounts, property/org scope, check-in eligibility, minimum nights, minimum lodging, maximum-use configuration, active/inactive state, audit logging and quote preview.

9A.1 hardens three payment-facing edges before reservations exist:

- advertised public specials do not double-stack with promo codes unless explicitly enabled;
- promo currency must match the quote currency;
- promotions with redemption history are archived instead of hard-deleted.

Atomic redemption is intentionally deferred until the reservation/hold transaction exists. A standalone counter now would create race conditions and make payment failures/refunds harder to reconcile.

### Review / publication / public marketplace

- Host listing identity/photos remain locked while under review/approved/published.
- Operational pricing can change on a published property without reopening the identity/photo review workflow.
- Only published inventory is exposed through guest-safe public listing RPCs.
- Exact private addresses and internal host contact/routing fields are not exposed by the public listing layer.
- Current public price display is still base-price presentation; date/availability quote exposure belongs after 9B.

### Calendar / availability boundary

- Current calendar page is correctly still a shell.
- 9B should own canonical open/blocked state, owner blocks, iCal import/export, external source health and conflict prevention.
- Calendar/PMS imports must not silently overwrite Find A Place pricing/promotions unless an explicit provider-owned-pricing mode is designed later.

### Payments / taxes / ledger

- Payment UI correctly reserves Stripe Connect as preferred and Square as supported alternative while live connection remains disabled.
- Raw banking/identity data is not intended for Supabase.
- Commission remains 5%/7% of lodging after legitimate host discounts, excluding legitimate host fees/add-ons/tax.
- Tax remains a separate jurisdiction/provider-neutral layer.
- Immutable reservation/financial snapshots are still required before live payments.

## Deferred by design, not missing

- canonical availability + owner blocks + iCal/PMS sync — Milestone 9B;
- public authoritative date quote — after 9B availability exists;
- temporary holds, reservation records and atomic promo redemption — reservation milestone;
- tax jurisdiction calculation/remittance — tax/compliance milestone;
- Stripe Connect/Square adapter calls, processor fees and payout state — payment milestone;
- real financial ledger/report calculations — before live money;
- Vercel staging — after 9B passes locally;
- direct PMS integrations — based on real host demand after iCal baseline.

## Open business decision before live bookings

A 100% host promo is currently mathematically possible. Because commission is based on discounted lodging, a true 100% comp would also produce a $0 commission base. Do not invent a hidden cap in code. Before live bookings, decide whether to allow true comps, impose a host discount ceiling, or require admin approval above a threshold.

## Next sequence

1. Accept 9A.1 locally and checkpoint it.
2. Build 9B canonical availability + owner blocks + iCal/ICS foundation.
3. Establish Vercel staging and real HTTPS integration testing.
4. Build temporary holds/reservations + immutable booking snapshots + atomic promo redemption.
5. Add tax/compliance calculation boundary.
6. Wire Stripe Connect test mode through the provider abstraction, then Square.
7. Complete ledger/reporting/reconciliation and only then consider live-money activation.
