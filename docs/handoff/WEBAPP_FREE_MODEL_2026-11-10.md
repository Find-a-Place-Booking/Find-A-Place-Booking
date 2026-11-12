# Find A Place Booking — Free web apps (supersedes the subscription model)

## Distribution and identity

- Guest PWA: `/apps/guest`, manifest `/apps/guest/manifest.webmanifest` (free, no host controls).
- Host PWA: `/host/mobile/workspace`, manifest `/apps/host/manifest.webmanifest` (free, authenticated OWNER or MANAGER membership required).
- `/apps` lets travelers and hosts choose the correct distinct app.
- No new Stripe subscriptions, trials or partner-only access gate required.
- Partner status continues for other platform-specific features; it does not determine web app entitlement.

## Host authorization

The host API verifies the Supabase user, active `organization_members` OWNER/MANAGER role, and the non-archived organization on every request. The optional `X-Fap-Organization` header is treated as a request to select among the user's *actual* memberships and cannot grant access to another organization. Read/write routes still scope reservation, calendar and property data to that organization.

## Guest ↔ host conversation

- Guest uses a confirmed/cancelled reservation and validated booking token obtained from confirmation code + matching booking email.
- Host uses the authenticated owner/manager login and the matching reservation organization ID.
- Guest and host both store messages in `reservation_conversations` and `reservation_messages`, with `sender_type` GUEST/HOST and `reservation_id`.
- Both sides show the same latest 200 messages in chronological order. The existing apps poll periodically and refresh after sending.
- Existing reservation message email notifications are preserved.
- Host read-receipt changes are applied via an authorized narrow server-side update, because current RLS permits authenticated host SELECT/INSERT but not UPDATE on `reservation_messages`.
- Guest and host both retry conversation lookup if the other side won the simultaneous conversation creation race.
- No open public chat, prebooking messaging or external push notifications are added in this change.

## Billing retirement

Host app Stripe product `prod_VbFkoh8nCDjopb` was retired in live Stripe, its default price cleared, and all three former host-app recurring prices archived (inactive). No existing paid subscriptions or open Checkout Sessions were found before retirement. Existing billing administration code is kept for legacy history, but `mobileBillingEnabled()` returns false, so the old subscription create endpoint refuses to open a new checkout. Guest-paid booking fees and host Stripe Connect payouts are separate and unchanged.

## Tests

`node --test tests/fap-free-apps-smoke.test.cjs` covers free/nonpartner access, active owner/manager membership, spoofed organizations, shared guest-host message persistence, read receipts, and booking token denial. A complete repository build and controlled production message exchange still need verification after deployment.
