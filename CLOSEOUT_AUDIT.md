# Find A Place Booking — Cross-chat closeout audit

**Prepared:** Nov 22, 2026 (America/Chicago). **Audited sources:** live Supabase, Railway production and recent ResNexus logs, GitHub `main` commit `12a64bbf` (Nov 18), prior Find A Place conversations and host feedback, plus the Vercel connection (which does not expose the FAP project).

## Completed this review

- **Production security hardening**: revoked `anon` EXECUTE on three host-only RPCs: `archive_property`, `create_blank_property` and `save_property_listing`. Signed-in host and service roles retain access. Verified post-change permissions and tested Melissa's property-creation RPC as an authenticated user with the created QA record fully rolled back. Production migration `20261123052422` already applied.
- **Verified historical property-creation fix**: the promo-code case-insensitive match that previously stopped Melissa creating a second property is active in production. Both changes are provided as Git migration-history files, not install scripts.
- **Prepared Find a Stay partner-ordering correction**: an overlay for `app/stays/page.tsx` prioritizes all verified partner stays over nonpartners and preserves cabin-first browsing within each band. Existing homepage priority and discovery filters remain available. Requires GitHub push and Vercel deployment; not live yet.
- **Renea editor regression rechecked**: live property editor contains stale-revision and partial-read guards, protected pricing/calendar settings; global old draft persistence is only mounted on `/host/onboarding`, not property editing pages. No further editor patch required from the source inspection.

## Database snapshot

- 71 properties: 58 published, 9 draft, 2 paused, 2 archived. Every published listing checked has a positive base rate, cover photos, map coordinates and a live payment-ready organization.
- 62 active calendar connections report healthy. This does **not** prove two-way PMS synchronization is comprehensive. ResNexus verification has separate unresolved windows.
- Live reservation records: 3 confirmed and paid, 3 cancelled, 43 expired checkout attempts. No overlapping confirmed booking dates or stale active checkout holds in the audited records. The three confirmed live payments have matching payment-success state.
- Last 24 hours sampled: 218 successful availability responses and 55 successful estimates, but also intermittent availability errors, including HTTP 403. Zero new confirmed bookings after Nov 9 observed.
- 3 active property videos have matching storage objects and valid MP4 metadata. Four additional Falling Water video copies are in storage but have no `property_videos` reference; retained pending safe cleanup.

## Remaining items requiring action or further validation

| Priority | Item | Current finding | Safe next action |
| --- | --- | --- | --- |
| Urgent | Availability API 403 responses | Requests sometimes return 403 despite that code path not returning 403; WAF/network cause not confirmed | Grant Vercel project/runtime-log access; inspect request IDs, firewall events and edge rules before changing security settings |
| High | Robertino ResNexus account | `CREDENTIALS_REJECTED`, 37 consecutive failures at last check | Host-authorized credential repair followed by booked/blocked-only sync test |
| High | Fancy Hill ResNexus detail-proof verification | Active account healthy, 10 mapped units; six unresolved windows, four future | Trace worker proof and mappings; retain conservative blocked windows until confirmed safe |
| High | Host tax acknowledgement | 40/58 published properties verified; 8 legacy Fancy Hill RV sites have PENDING profiles; 10 others have no profile | Verify policy, request host acknowledgement, audit affected checkout tax estimates. Do not auto-certify hosts or alter live totals without approval |
| Medium | OwnerRez API / outgoing synchronization | iCal sync is present; full PMS OAuth, guest data, security deposit and agreements not implemented end-to-end | Verify outgoing feed subscriptions per host; plan separately scoped OAuth integration |
| Medium | Refundable security deposits/e-signatures | Disclosure/document upload exists; deposit payment processing gated off by default | Requires legal/Stripe refund/webhook QA before enabling |
| Medium | Guest booking funnel | Intermittent network errors; last 7 days showed 9 distinct 403 attempts without successful follow-through | Trace Vercel logs, instrument request identifier, retest authenticated and anonymous/guest browsers |
| Medium | Melissa Creeks Edge Cabin | Draft with 25 photos, ready Stripe, but no base rates and no active calendar | Ask host to complete rates, attach calendar, verify agreement/taxes before publishing |
| Medium | Video storage cleanup | Four unreferenced uploads, all Falling Water | Confirm none referenced by cache/other workflows before removing |
| Low | Legacy payout status records | Historic `reservation_payouts` rows show SCHEDULED but FAP uses Stripe direct charges and a disabled manual payout cron | Reconcile Stripe history and remove misleading old dashboard labels; never start manual payouts |
| Low | Custom fees | `unit_custom_fees` and UI exist, no production fees configured | QA a sandbox fee, taxable setting and guest total, don't add real host fees automatically |

## Cross-chat features found in code

- Host mobile Add Property, including member-restricted draft creation and full editor link.
- Free host and guest webapps, honoring the newest Nov 11 decision, superseding earlier nonpartner subscription idea. PWA host/guest manifests use different brand-tinted icons.
- Property duplicate setup, deposit and policy PDF attachments, checkout instructions, check-in/check-out weekday restrictions, holiday/nightly rates, Treehouse type, expanded amenities and nearby experiences.
- Buffalo River, luxury, unique, group and budget search controls; original map and expandable bubbles; verified partner homepage featured cabins; direct booking same-stay comparison UI.
- Optional 25% introductory offers, booking recovery emails, Stripe Connect direct charges, 5% verified partner / standard commission policy controls, conditional host payouts via Stripe.
- Host-property videos and guest property gallery, with current active DB records as above.

## Deployment & verification limitations

Railway production worker is online and GitHub commit `12a64bbf` has green Vercel/Railway deployment checks. The linked Vercel tool reports **zero accessible projects**, so runtime logs, edge firewall reasons and production browser behavior **could not be verified**. The Find a Stay overlay has a TypeScript syntax check and source-level review only, not a live browser regression test. No production bookings, payment/refund records, calendar blocks, tax acknowledgements or videos were modified in this review.
