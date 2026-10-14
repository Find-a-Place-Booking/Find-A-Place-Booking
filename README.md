# Find A Place Booking: Home partner map + nearby destination search

Prepared October 14, 2026 against inspected repository `Find-a-Place-Booking/Find-A-Place-Booking` (`main`). **Source-code overlay only, not deployed.** GitHub connector does not have write permission (`403 Resource not accessible by integration`). No database, booking, payment, or calendar records are modified.

## Requested behavior

- Preserve the **existing Mapbox booking/stay map in its current homepage location** between Featured Stays and Browse by Stay Type.
- Copy **the original Google My Maps partner network map** from the About page to the very bottom of Home **before the footer**, including the existing link to the full partner map. The About page keeps it too. A shared server component reuses the same map ID and styles; it does not create a second Mapbox map.
- A search for a city or recognized regional destination now includes nearby smaller communities. Use the existing approximate public listing coordinates, without exposing precise private addresses. A **Nearby area** control offers 15/25/40/60/100 miles, defaulting to 40. Nearby matches are sorted by distance. Stay-name search remains separate.
- Preserve filters, guest count, date-based availability checks, and booking/checkout behavior. No inventory query or booking route is changed.
- Generic town searches first use known destination coordinates, then approximate public coordinates for an exact matching listed town, then a Mapbox geocode request if configured. If geocoding fails/unavailable, fall back to the existing textual matching. No new API key is required when the existing Mapbox token is configured.
- Mapbox pin popups remain **inside the map**. No forced new browser tabs or windows. The existing card contains image, location, name, nightly price and View stay; clusters support sort, zoom and mobile-scrollable lists.
- Reliability fix from popup review: use the existing `/api/public/stay-cover/[slug]` route for popup images instead of expiring signed gallery links. All popup links still navigate to the same property details route.

## Apply

Copy/unzip this archive outside the repository, then run `python /path/to/overlay/apply_overlay.py /path/to/Find-A-Place-Booking` from a development workspace. The patcher checks expected source anchors and stages all edits before writing. It is safe to repeat and refuses to overwrite modified overlay-owned files.

Then review the diff, run `npm run typecheck` and `npm run build` in the actual repository, commit and deploy the Vercel-connected branch. These final steps **were not possible from this chat** because GitHub write access was denied.

## Files patched by overlay

- `app/page.tsx`: insert shared partner map at bottom; existing Mapbox section remains untouched
- `app/about/page.tsx`: reuse the shared map component with existing managed content
- `components/SearchBar.tsx`: nearby radius control on both Home and Find a Stay
- `app/stays/page.tsx`: nearby filtering ahead of guest-count filter; radius preserved in results form
- `app/layout.tsx`: responsive search grid stylesheet
- `components/StayMap.tsx`: stable stay-cover URL for map popup images only

## Files supplied

- `components/FindAPlacePartnerMap.tsx`
- `lib/public/nearby-destination-search.ts`
- `app/nearby-search-controls.css`
- `apply_overlay.py`

## Checks performed

- Parsed both added TypeScript/TSX files using TypeScript 5.8.3.
- Unit-tested 40-mile Hot Springs search including Pearcy and Royal, exclusion of distant Branson, 15-mile filtering, Branson/Hollister, Lake Ouachita/Mount Ida, tiny-town searches, anywhere, and invalid radius fallback.
- Ran guarded patcher twice in a representative source-anchor fixture. Verified Home retains one Mapbox section, partner map is appended after it, About reuses component, radius is wired through to search, and second run makes no changes.
- The **full** Next.js build, browser/mobile UI screenshots, live Mapbox/geocoding checks, and real production deployment remain outstanding.

## Smoke-test after deployment

1. Home: confirm the current Mapbox stay map is still at its original position, retains pin/cluster interactions and stay links.
2. Home: scroll to the bottom just above footer: original Google My Maps partner network iframe should load, and Open full partner map should work. About page must still show the same partner map.
3. Search Hot Springs at 40 miles: show stays in Pearcy/Royal/Mountain Pine and other nearby communities with published mapped listings, if available for the dates and guests.
4. Search Branson at 40 miles: include any Hollister listings; Lake Ouachita should find mapped Mount Ida stays.
5. Switch to 15 miles; confirm more distant listings drop out. Confirm changing radius doesn't drop check-in/check-out/guests.
6. Try a smaller town not listed in editorial destination cards, including a typed `, AR` suffix. If geocoding is unavailable, explicitly expect fallback text matching only.
7. Click a Mapbox point, review image/name/price/CTA on desktop and phone, and open its listing. Open a cluster, sort, zoom, scroll its listing choices; check no forced new window.
8. Check browser console for geocoding/popup errors, and revisit the homepage after an hour to ensure popup images still work.
