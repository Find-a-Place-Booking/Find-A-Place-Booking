Find A Place Booking — Mapbox TypeScript hotfix

Fixes Mapbox GL v3.30 GeoJSONFeature typing errors in components/StayMap.tsx.
No database, geocoding, privacy, booking, payment, tax, or map behavior changes.

From the repository root:
  1. Copy apply-mapbox-types-hotfix.mjs into the repo root.
  2. Run: node apply-mapbox-types-hotfix.mjs
  3. Run: npm run typecheck
  4. Run: npm run build

Alternatively replace components/StayMap.tsx with the included corrected file.

Do NOT run `npm audit fix --force` just because npm reported vulnerabilities. Review `npm audit` first; --force can introduce breaking dependency upgrades.
