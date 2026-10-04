Find A Place Booking — Host Discovery Upgrade

Built from the current repo state on 2026-10-04.

What this overlay adds

1) Host property photo drag/drop sorting
- Replaces the old primary-photo picker with a full photo-order tool.
- Desktop: drag cards into order.
- Phone/tablet/keyboard fallback: move earlier/later + Make primary.
- The first image is automatically the public primary/hero photo.
- Reordering saves atomically through reorder_property_images().
- Photos are not deleted or re-uploaded when reordered.

2) Host-managed Nearby Experiences / trip draws
- New panel on each host property editor.
- Up to 12 host-curated nearby places/activities in the UI.
- Fields: name, category, description, driving miles, drive minutes,
  optional website, optional host-uploaded image, public on/off, display order.
- Host can search a place with Mapbox.
- Search is biased to the property's exact stored coordinates server-side.
- Selecting a result calls Mapbox Directions and auto-fills actual driving
  miles and estimated drive time.
- Exact property coordinates never go to the browser.
- Mapbox POI coordinates are used only for that search/routing session and are
  not persisted in Supabase.
- Nearby images are manual host uploads to avoid third-party image licensing
  and attribution problems.

3) Public “Near this stay” cards
- Active nearby entries appear on the public property page.
- Host-uploaded images are shown when present.
- Category-styled fallback card appears when no image was uploaded.
- Displays miles + approximate drive time and optional information link.

4) More interactive Mapbox stay clusters
- Desktop: hover a numbered cluster to browse the stays inside it.
- Mobile/tablet: tap the numbered cluster.
- Cluster panel includes property photo, name, location, price and rating when
  available.
- Sort inside the popup: Recommended, price low/high, guest rating.
- “Zoom into this area” expands the cluster.
- Cluster cards use the existing stay-cover route as an image fallback, so the
  homepage map can still show property photos even when its lightweight map
  payload does not include signed image URLs.

5) Gez request
- Homepage “ATV access” collection card is now labeled “ATV-friendly stays”.
- Underlying filter value remains “ATV access”, so filtering behavior is not
  changed.

Apply order
1. Apply supabase/migrations/20261004191820_property_nearby_experiences.sql
2. Copy the remaining overlay files into the repo, preserving folders.
3. Deploy normally.

Environment
- Uses the existing MAPBOX_GEOCODING_TOKEN when present, otherwise the existing
  NEXT_PUBLIC_MAPBOX_TOKEN.
- No new environment variable is required.

Safety / scope
- Does not change booking, checkout, Stripe, taxes, calendar sync, reservation
  holds or payment routing.
- Nearby data is separate from property booking readiness and never blocks
  publishing.
