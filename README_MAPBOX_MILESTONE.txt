FIND A PLACE BOOKING — MAPBOX MAP MILESTONE
============================================

What this overlay implements
----------------------------
1. Host address -> Mapbox permanent geocoding on property save.
2. Exact coordinates stored privately on public.properties.latitude/longitude.
3. Separate guest-safe public_map_latitude/public_map_longitude.
   - If exact_address_public=true, the public pin is exact.
   - Otherwise, the public pin is deterministically shifted about 1.25–2.5 miles.
4. Real Mapbox map in /stays replacing the placeholder.
   - Uses the already-filtered search result set.
   - Date-filtered/unavailable stays therefore disappear from the map too.
   - Price markers, clusters, zoom/pan, property popups.
5. Homepage map showing every published stay with a mapped location.
   - Uses a lightweight public RPC instead of loading every listing's full data.
   - Auto-fits around all published stays.
6. One-time backfill script for properties that were already created/published before mapping existed.
7. Mapbox token placeholders in .env.example.

Mapbox configuration
--------------------
You already have a Mapbox token.

Add to .env.local for local testing:

NEXT_PUBLIC_MAPBOX_TOKEN=pk_your_token_here
MAPBOX_GEOCODING_TOKEN=pk_your_token_here

The browser token is intentionally public; it renders the map.
MAPBOX_GEOCODING_TOKEN is used only by server-side geocoding. It can initially be the same token. You can later give server geocoding its own restricted token if desired.

IMPORTANT: coordinates are stored in Supabase. Mapbox requires permanent geocoding for stored results. This implementation sends permanent=true. Your Mapbox account needs permanent-geocoding eligibility (Mapbox currently requires a valid credit card on file or an enterprise contract).

Also add both variables to the Vercel project environment before deployment and redeploy after saving them.

Apply
-----
From the Find A Place Booking repository root, place this overlay folder's files there and run:

node apply-mapbox-milestone.mjs
npm install

The npm install step installs mapbox-gl and updates package-lock.json.

Database
--------
Apply this migration to the same Supabase project used by the app BEFORE deploying the new application code:

supabase/migrations/20260918004000_mapbox_locations.sql

The migration does NOT expose exact coordinates. It creates guest-safe map RPCs that return only public_map_* fields.

Existing properties
-------------------
After the migration and local env variables are in place, geocode properties that already existed before this feature:

npm run map:backfill

That script:
- ignores archived properties
- skips incomplete addresses
- permanently geocodes complete addresses
- creates approximate public pins for private-address listings
- keeps exact public pins only where exact_address_public=true

Future host saves geocode automatically, so the backfill is only needed for existing rows or emergency repair.

Verification
------------
Run:

npm run typecheck
npm run build

Then test:
1. Open a draft host property.
2. Enter a real street address, city, state and ZIP.
3. Save.
4. Confirm the save message says the map location updated.
5. Submit/publish as normal.
6. Open /stays and confirm the price pin appears.
7. Change filters/dates and confirm the map updates with the result set.
8. Open the homepage and confirm the map auto-fits around all mapped published stays.
9. For exact_address_public=false, verify the public pin is only in the general area rather than at the exact property.
10. For exact_address_public=true, verify the public pin matches the property location.

Files added
-----------
components/StayMap.tsx
lib/maps/mapbox.ts
scripts/backfill-map-locations.mjs
supabase/migrations/20260918004000_mapbox_locations.sql

Files patched
-------------
package.json
.env.example
app/layout.tsx
app/page.tsx
app/globals.css
app/host/properties/actions.ts
components/PropertyEditor.tsx
components/StayResults.tsx
lib/public/listings.ts

Scope safety
------------
This does not change booking, availability, Stripe, tax calculations, calendar blocking, reservations, or payment flow. The map consumes the public listing result set; it does not become a new source of booking truth.
