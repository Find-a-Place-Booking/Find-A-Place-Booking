Find A Place Booking — Compact Map Layout Hotfix

Purpose
-------
Keeps the working Mapbox implementation exactly as-is, but gives the stay cards
more room and reduces the amount of page occupied by the maps.

Changes
-------
/stays desktop:
- Map height reduced from ~720px to 480px.
- Map column narrowed to roughly 31% of the results row.
- Stay cards remain the primary browsing surface.
- Map remains sticky and fully interactive.

Homepage:
- Map reduced from 560px to 410px on desktop.
- 390px on tablet.
- 360px on mobile.
- Section vertical padding reduced slightly.

Mobile / responsive:
- Existing one-column Show map / Hide map behavior is preserved.
- Search map remains large enough to pan and inspect when opened.

No changes to:
- Mapbox/geocoding
- Coordinates or privacy handling
- Supabase
- Booking/search availability logic
- Payments/tax/calendar
- Map markers, clustering or popups

Apply
-----
From repo root:

  node apply-compact-map-layout.mjs
  npm run typecheck
  npm run build

This hotfix only appends CSS overrides. It does not alter TypeScript.
