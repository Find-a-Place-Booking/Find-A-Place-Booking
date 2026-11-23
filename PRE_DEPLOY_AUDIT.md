# Find A Place Booking — Pre-deploy audit (23 November 2026)

## Source and scope

- This archive **supersedes** `FAP_Finish_Host_Features_Search_Visibility_Direct_Overlay_20261122.zip` and contains every file from that earlier overlay plus the verified partner/PWA corrections.
- Audited against GitHub `main` commit `12a64bbf580ef048ca92ece4e17d610bb1b9e4e6` (November 18).
- Nothing in this ZIP has been committed or deployed. It does not contain or require SQL migrations. It does not modify existing booking, Stripe, refund, payout or calendar routes.
- Full live Vercel logs, a complete repo `npm ci && npm run build`, and authenticated browser QA were unavailable to this audit. **A successful syntax/static test is not a successful production deployment.**

## Partner-first discovery: what is now covered

1. Shared `getPublishedProperties` feed used by homepage, standard results, collections, and guest mobile API. Applies limit **after** verified partner ordering so other listings cannot displace partners.
2. Shared `getPublishedMapStays` feed used for the homepage map, with partner-tagged map data ordered ahead of standard properties.
3. Shared `searchPublishedStaysNearby` (destination/radius/Buffalo River) re-groups by verified partner **after** geographic matching, without changing availability/distance safety limits.
4. Find a Stay categories and normal recommended results re-group by verified partner after cabin/RV layout ordering.
5. Six new destination pages now get the partner-sorted shared nearby feed.
6. `/api/public/property-name-search` autocomplete checks verified partner status before name-prefix/alphabetical relevance.
7. All these queries use live `organizations.partner_status='VERIFIED'`, `properties.status='PUBLISHED'` and primary unit slugs; no partner list is hard-coded.

**Deliberate UI exception:** when a visitor explicitly changes a list or map bubble sort to *Price* or *Guest rating*, the selected sort may order all results by that criterion instead. The requirement was implemented as the default discovery priority. Map pins have no positional ranking, and cluster bubble ordering is dependent on Mapbox's leaf order; check the cluster popup after deployment before claiming strictly ranked map bubble cards.

**Production data check:** 58 published primary-unit listings: 56 verified partner listings (46 homepage priority 1 + 10 priority 3) and 2 non-partners (Falling Water Cabin and The Barn House Tree Loft). Live API index returned 58, calendar connection dashboard reported 62 healthy out of 62 active, and confirmed-reservation overlap query returned zero. No data was changed.

## Mobile guest and host icons

The GitHub *source* host and guest PNG files look similar. However, the existing `scripts/fap-prepare-build.cjs` runs before `next build` and regenerates BOTH 192px and 512px icons from the same original Find A Place logo with different colors:

- Guest: forest green `#144f36` with cream logo.
- Host: copper-orange `#ab3f1c` with cream logo.

This overlay updates **both** PWA manifests and both Apple/home-screen icon metadata paths with a new `20261123-dualcolor` cache version. Their theme colors now exactly match the generated assets. **Do not replace the original artwork.** Confirm the icon colors from the actual built URLs on the Vercel preview; older home-screen installations may need to be removed and added again to refresh.

## Additional checks completed

- Prior host Rates & Fees overlay's pre-existing `HostCustomFeeManager` was compared against the automatic Git patch system. The host guest-fee-copy patch applied successfully, followed by a successful reverse-check of the already-mounted custom-fee patch. No duplicate component injection.
- Partner sorting runtime smoke test: verified entries appear before standard ones, stable relative order within each band, original input remains untouched, metadata query failure leaves search usable.
- More-specific `tsconfig` alias resolution test: `@/lib/public/listings` resolves to the new shared wrapper, while relative `./listings` still loads the original service; no circular alias.
- All TypeScript/TSX files in the corrected overlay parsed with **zero** syntax diagnostics; JSON files parse successfully; ZIP archive integrity is checked.
- Base host add-property and guest mobile app routes were located in current GitHub code and remain untouched.

## Final production preview tests — required

1. Extract the ZIP at the project root, overwrite matching paths and commit. Run `npm ci`, `npm run typecheck`, `npm run build` locally or via Vercel preview CI. **Do not promote a failed build.**
2. Browse `/stays` with no filters, then Hot Springs, Buffalo River, luxury, unique stays, under $150, group stays and RV; confirm any verified listing in each result set precedes non-partners. Test dates and guest counts, including empty results.
3. Open the guest web app (`/apps/guest`) and repeat location/date/guest searches; confirm partner-first ordering. Try the property-name autocomplete and the new destination pages.
4. Open map clusters, expand and scroll. Confirm the full list appears, Back to map works, and map popups don't capture page scroll incorrectly. Mapbox supplies cluster leaves and may reorder bubble cards; inspect actual result ordering rather than assuming it matches the feed.
5. Inspect `/apps/guest/manifest.webmanifest` and `/apps/host/manifest.webmanifest`; confirm generated `/webapps/icons/guest-192.png` is dark green and `/webapps/icons/host-192.png` is copper-orange, with the SAME original logo; likewise 512px. On iPhone, confirm touch icons after fresh installation.
6. Test authorized host Add Property on mobile. Check the separate Rates & Fees custom fees against a quote, make no lasting changes to a published host price. Repeat Renea's edit/save/refresh for individual properties, and confirm no other listing's description/amenities/experiences changed.
7. Visit all six `/destinations/<slug>` pages, `/sitemap.xml` and the public IndexNow key. Make sure no new page suggests stays that aren't actually in its area.
8. Check Vercel firewall/runtime logs for intermittent 403s, Railway ResNexus credential failures, and quarantine date windows. **This SEO/partner ordering overlay does not fix those production issues.**
9. Leave `FAP_SECURITY_DEPOSIT_PAYMENTS_ENABLED` and `FAP_RENTAL_ESIGN_ENABLED` off until provider-level tests and legal review are complete. Keep tax acknowledgment, refund and payout decisions host-authorized.

## Do not use the older overlay

The previous November 22 ZIP did not ensure partner-first on guest mobile search and property-name autocomplete, and it did not refresh the distinct PWA icon URLs. Use only this corrected ZIP.
