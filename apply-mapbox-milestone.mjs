import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function write(rel, content) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
}

function replaceOnce(rel, before, after) {
  const current = read(rel);
  const first = current.indexOf(before);
  if (first < 0) throw new Error(`${rel}: patch anchor not found`);
  if (current.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${rel}: patch anchor is not unique`);
  }
  write(rel, current.slice(0, first) + after + current.slice(first + before.length));
}

function appendOnce(rel, marker, addition) {
  const current = read(rel);
  if (current.includes(marker)) return;
  write(rel, `${current.trimEnd()}\n\n${addition.trim()}\n`);
}

function copyOverlay(rel) {
  const source = path.join(here, rel);
  if (!fs.existsSync(source)) throw new Error(`Overlay file missing: ${rel}`);
  write(rel, fs.readFileSync(source, "utf8"));
}

for (const required of [
  "package.json",
  ".env.example",
  "app/layout.tsx",
  "app/page.tsx",
  "app/globals.css",
  "app/host/properties/actions.ts",
  "components/PropertyEditor.tsx",
  "components/StayResults.tsx",
  "lib/public/listings.ts",
]) {
  if (!fs.existsSync(path.join(root, required))) {
    throw new Error(`Run this from the Find A Place Booking repository root. Missing ${required}`);
  }
}

for (const rel of [
  "components/StayMap.tsx",
  "lib/maps/mapbox.ts",
  "scripts/backfill-map-locations.mjs",
  "supabase/migrations/20260918004000_mapbox_locations.sql",
]) {
  copyOverlay(rel);
}

replaceOnce(
  "package.json",
  `    "start": "next start",\n    "typecheck": "tsc --noEmit"`,
  `    "start": "next start",\n    "typecheck": "tsc --noEmit",\n    "map:backfill": "node --env-file=.env.local scripts/backfill-map-locations.mjs"`,
);
replaceOnce(
  "package.json",
  `    "@supabase/supabase-js": "2.114.0",\n    "next": "16.2.0",`,
  `    "@supabase/supabase-js": "2.114.0",\n    "mapbox-gl": "^3.30.0",\n    "next": "16.2.0",`,
);

replaceOnce(
  ".env.example",
  `# Tax / monitoring / mapping variables will be added when those milestones begin.\n# Live payment credentials must not be used during local development.`,
  `# Mapbox. NEXT_PUBLIC_MAPBOX_TOKEN is the browser-safe public token used to\n# render maps. MAPBOX_GEOCODING_TOKEN is server-only and may initially be the\n# same token; permanent geocoding must be enabled on the Mapbox account because\n# property coordinates are stored in Supabase.\nNEXT_PUBLIC_MAPBOX_TOKEN=\nMAPBOX_GEOCODING_TOKEN=\n\n# Monitoring variables will be added when that milestone begins.\n# Live payment credentials must not be used during local development.`,
);

replaceOnce(
  "app/layout.tsx",
  `import type { Metadata } from "next";\nimport "./globals.css";`,
  `import type { Metadata } from "next";\nimport "mapbox-gl/dist/mapbox-gl.css";\nimport "./globals.css";`,
);

replaceOnce(
  "app/host/properties/actions.ts",
  `import { createClient } from "@/lib/supabase/server";`,
  `import {\n  geocodePermanentPropertyAddress,\n  hasGeocodableAddress,\n  propertyMapAddressKey,\n  publicMapCoordinates,\n  type PropertyMapAddress,\n} from "@/lib/maps/mapbox";\nimport { createAdminClient } from "@/lib/supabase/admin";\nimport { createClient } from "@/lib/supabase/server";`,
);

replaceOnce(
  "app/host/properties/actions.ts",
  `async function requireHostSession() {`,
  `async function syncStoredPropertyMapLocation(propertyId: string): Promise<string> {\n  const admin = createAdminClient();\n  const { data: property, error } = await admin\n    .from("properties")\n    .select(\n      "id,street_address,city,region_code,postal_code,country_code,latitude,longitude,exact_address_public,geocoded_address_key,public_map_latitude,public_map_longitude",\n    )\n    .eq("id", propertyId)\n    .maybeSingle();\n\n  if (error || !property) {\n    throw new Error("The saved property location could not be loaded.");\n  }\n\n  const address: PropertyMapAddress = {\n    streetAddress: property.street_address,\n    city: property.city,\n    regionCode: property.region_code,\n    postalCode: property.postal_code,\n    countryCode: property.country_code || "US",\n  };\n\n  if (!hasGeocodableAddress(address)) {\n    await admin\n      .from("properties")\n      .update({\n        latitude: null,\n        longitude: null,\n        public_map_latitude: null,\n        public_map_longitude: null,\n        geocoded_address_key: null,\n        geocoded_at: null,\n      })\n      .eq("id", propertyId);\n\n    return "Property saved. Add a full street address, city and state so this stay can appear on the map.";\n  }\n\n  const addressKey = propertyMapAddressKey(address);\n  let latitude = Number(property.latitude);\n  let longitude = Number(property.longitude);\n  const hasStoredExactPoint =\n    property.geocoded_address_key === addressKey &&\n    Number.isFinite(latitude) &&\n    Number.isFinite(longitude);\n  let newlyGeocoded = false;\n\n  if (!hasStoredExactPoint) {\n    try {\n      const result = await geocodePermanentPropertyAddress(address);\n      latitude = result.latitude;\n      longitude = result.longitude;\n      newlyGeocoded = true;\n    } catch (geocodeError) {\n      await admin\n        .from("properties")\n        .update({\n          latitude: null,\n          longitude: null,\n          public_map_latitude: null,\n          public_map_longitude: null,\n          geocoded_address_key: null,\n          geocoded_at: null,\n        })\n        .eq("id", propertyId);\n      throw geocodeError;\n    }\n  }\n\n  const publicPoint = publicMapCoordinates({\n    propertyId,\n    latitude,\n    longitude,\n    exactAddressPublic: Boolean(property.exact_address_public),\n  });\n  const update: Record<string, string | number | null> = {\n    latitude,\n    longitude,\n    public_map_latitude: publicPoint.latitude,\n    public_map_longitude: publicPoint.longitude,\n    geocoded_address_key: addressKey,\n  };\n  if (newlyGeocoded) update.geocoded_at = new Date().toISOString();\n\n  const { error: updateError } = await admin\n    .from("properties")\n    .update(update)\n    .eq("id", propertyId);\n  if (updateError) throw updateError;\n\n  return newlyGeocoded\n    ? "Property saved and its map location was updated."\n    : "Property saved.";\n}\n\nasync function requireHostSession() {`,
);

replaceOnce(
  "app/host/properties/actions.ts",
  `  const row = Array.isArray(data) ? data[0] : data;\n  if (!row?.slug) redirect("/host/properties?error=create-failed");\n  revalidatePath("/host");`,
  `  const row = Array.isArray(data) ? data[0] : data;\n  if (!row?.slug) redirect("/host/properties?error=create-failed");\n  if (row?.property_id) {\n    try {\n      await syncStoredPropertyMapLocation(row.property_id);\n    } catch (mapError) {\n      console.error("[createPropertyFromOnboarding] map geocode failed", mapError);\n    }\n  }\n  revalidatePath("/host");`,
);

replaceOnce(
  "app/host/properties/actions.ts",
  `  const row = Array.isArray(data) ? data[0] : data;\n  revalidatePath("/host");\n  revalidatePath("/host/properties");`,
  `  const row = Array.isArray(data) ? data[0] : data;\n  let mapMessage = "Property saved.";\n  if (row?.property_id) {\n    try {\n      mapMessage = await syncStoredPropertyMapLocation(row.property_id);\n    } catch (mapError) {\n      console.error("[savePropertyListing] map geocode failed", mapError);\n      mapMessage =\n        "Property saved, but the address could not be placed on the map. Check the address and save again.";\n    }\n  }\n\n  revalidatePath("/host");\n  revalidatePath("/host/properties");`,
);

replaceOnce(
  "app/host/properties/actions.ts",
  `  return {\n    ok: true,\n    message: "Property saved.",`,
  `  return {\n    ok: true,\n    message: mapMessage,`,
);

replaceOnce(
  "components/PropertyEditor.tsx",
  `    setSaveTone("saved");\n    setMessage("Property saved.");`,
  `    setSaveTone("saved");\n    setMessage(result.message || "Property saved.");`,
);

replaceOnce(
  "lib/public/listings.ts",
  `type PublicDetailRow = {`,
  `type PublicMapCoordinateRow = {\n  property_id: string;\n  map_latitude: number | string | null;\n  map_longitude: number | string | null;\n};\n\ntype PublicMapListingRow = {\n  property_id: string;\n  slug: string;\n  name: string;\n  public_area: string | null;\n  city: string | null;\n  region_code: string | null;\n  weeknight_cents: number | null;\n  map_latitude: number | string | null;\n  map_longitude: number | string | null;\n};\n\nexport type PublicMapStay = {\n  slug: string;\n  name: string;\n  location: string;\n  price: number;\n  lat: number;\n  lng: number;\n};\n\ntype PublicDetailRow = {`,
);

replaceOnce(
  "lib/public/listings.ts",
  `  const supabase = await createClient();\n  const { data, error } = await supabase.rpc("public_listing_index");\n\n  if (error) {`,
  `  const supabase = await createClient();\n  const [listingResult, coordinateResult] = await Promise.all([\n    supabase.rpc("public_listing_index"),\n    supabase.rpc("public_listing_map_coordinates"),\n  ]);\n  const { data, error } = listingResult;\n\n  if (error) {`,
);

replaceOnce(
  "lib/public/listings.ts",
  `  let allRows = (data ?? []) as PublicIndexRow[];`,
  `  const mapCoordinateByProperty = new Map<string, PublicMapCoordinateRow>();\n  if (coordinateResult.error) {\n    console.error(\n      "[getPublishedProperties] public_listing_map_coordinates failed",\n      coordinateResult.error,\n    );\n  } else {\n    for (const row of (coordinateResult.data ?? []) as PublicMapCoordinateRow[]) {\n      mapCoordinateByProperty.set(row.property_id, row);\n    }\n  }\n\n  let allRows = (data ?? []) as PublicIndexRow[];`,
);

replaceOnce(
  "lib/public/listings.ts",
  `    const propertyReviews = stats.get(row.property_id);\n\n    return {`,
  `    const propertyReviews = stats.get(row.property_id);\n    const mapCoordinates = mapCoordinateByProperty.get(row.property_id);\n    const mapLatitude = Number(mapCoordinates?.map_latitude);\n    const mapLongitude = Number(mapCoordinates?.map_longitude);\n\n    return {`,
);

replaceOnce(
  "lib/public/listings.ts",
  `      lat: 0,\n      lng: 0,`,
  `      lat: Number.isFinite(mapLatitude) ? mapLatitude : 0,\n      lng: Number.isFinite(mapLongitude) ? mapLongitude : 0,`,
);

replaceOnce(
  "lib/public/listings.ts",
  `export async function getPublishedListingBySlug(`,
  `export async function getPublishedMapStays(): Promise<PublicMapStay[]> {\n  const supabase = await createClient();\n  const { data, error } = await supabase.rpc("public_map_listing_index");\n\n  if (error) {\n    console.error("[getPublishedMapStays] public_map_listing_index failed", {\n      code: error.code,\n      message: error.message,\n      details: error.details,\n      hint: error.hint,\n    });\n    return [];\n  }\n\n  return ((data ?? []) as PublicMapListingRow[]).flatMap((row) => {\n    const lat = Number(row.map_latitude);\n    const lng = Number(row.map_longitude);\n    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];\n\n    return [{\n      slug: row.slug,\n      name: row.name,\n      location:\n        row.public_area ||\n        [row.city, row.region_code].filter(Boolean).join(", ") ||\n        "Regional stay",\n      price: Math.round((row.weeknight_cents ?? 0) / 100),\n      lat,\n      lng,\n    } satisfies PublicMapStay];\n  });\n}\n\nexport async function getPublishedListingBySlug(`,
);

replaceOnce(
  "components/StayResults.tsx",
  `import { PropertyCard } from "./PropertyCard";`,
  `import { PropertyCard } from "./PropertyCard";\nimport { StayMap } from "./StayMap";`,
);

replaceOnce(
  "components/StayResults.tsx",
  `        {mapOpen && <aside className="map-shell map-shell-empty" aria-label="Regional search map">\n          <div className="map-label"><strong>Map view</strong><span>{filtered.length} {filtered.length === 1 ? "stay" : "stays"}</span></div>\n          <div className="map-empty-message"><span>⌖</span><strong>Map view is coming soon.</strong><p>Until then, every place in the list is a real published Find A Place stay.</p></div>\n        </aside>}`,
  `        {mapOpen && <aside className="map-shell live-map" aria-label="Regional search map">\n          <div className="map-label"><strong>Map view</strong><span>{filtered.length} {filtered.length === 1 ? "stay" : "stays"}</span></div>\n          <StayMap stays={filtered} emptyMessage="Try a different destination or filter to see mapped stays." />\n        </aside>}`,
);

replaceOnce(
  "app/page.tsx",
  `import { SearchBar } from "@/components/SearchBar";`,
  `import { SearchBar } from "@/components/SearchBar";\nimport { StayMap } from "@/components/StayMap";`,
);
replaceOnce(
  "app/page.tsx",
  `import { getPublishedProperties } from "@/lib/public/listings";`,
  `import { getPublishedMapStays, getPublishedProperties } from "@/lib/public/listings";`,
);
replaceOnce(
  "app/page.tsx",
  `  const [published, content] = await Promise.all([\n    getPublishedProperties(14),\n    getSiteContentBlocks(["home.hero", "home.story", "home.host_cta"]),\n  ]);`,
  `  const [published, mapStays, content] = await Promise.all([\n    getPublishedProperties(14),\n    getPublishedMapStays(),\n    getSiteContentBlocks(["home.hero", "home.story", "home.host_cta"]),\n  ]);`,
);
replaceOnce(
  "app/page.tsx",
  `        <section className="stay-types-section">`,
  `        {mapStays.length > 0 ? (\n          <section className="home-map-section">\n            <div className="shell section-heading marketplace-heading home-map-heading">\n              <div>\n                <p className="eyebrow dark">Explore the map</p>\n                <h2>See where the stays are.</h2>\n                <p>Every pin is a published Find A Place stay. Private-address listings show the general area instead of the exact driveway.</p>\n              </div>\n              <Link className="under-link" href="/stays">Browse all stays →</Link>\n            </div>\n            <div className="shell-wide home-map-frame">\n              <StayMap stays={mapStays} className="home-stay-map" />\n            </div>\n          </section>\n        ) : null}\n\n        <section className="stay-types-section">`,
);

appendOnce(
  "app/globals.css",
  "/* Mapbox marketplace maps */",
  `/* Mapbox marketplace maps */\n.map-shell.live-map{background:#dfe3d8}.map-shell.live-map:before,.map-shell.live-map:after{display:none}.stay-map{width:100%;height:100%;min-height:320px}.stay-map-fallback{width:100%;height:100%;min-height:320px;display:grid;place-items:center;align-content:center;text-align:center;padding:30px;background:#dfe3d8;color:#263a40}.stay-map-fallback strong{font-family:Georgia,serif;font-weight:500;font-size:1.35rem}.stay-map-fallback span{max-width:360px;margin-top:6px;color:#69706b;font-size:.75rem}.mapboxgl-map{font:inherit}.mapboxgl-ctrl-top-right{top:58px}.mapboxgl-ctrl-group{border-radius:8px!important;overflow:hidden;box-shadow:0 6px 18px rgba(20,30,32,.15)!important}.mapboxgl-popup-content{padding:0!important;border-radius:10px!important;overflow:hidden;box-shadow:0 18px 45px rgba(20,30,32,.2)!important}.mapboxgl-popup-close-button{z-index:3;width:28px;height:28px;background:rgba(255,255,255,.94)!important;border-radius:50%;top:7px!important;right:7px!important;font-size:18px}.stay-map-popup{display:grid;min-width:220px;max-width:300px;background:#fff;color:var(--ink)}.stay-map-popup>img{height:118px;width:100%;object-fit:cover}.stay-map-popup-copy{display:grid;gap:3px;padding:13px 15px 15px}.stay-map-popup-copy small{font-size:.64rem;color:#737975}.stay-map-popup-copy strong{font-family:Georgia,serif;font-size:1.05rem;font-weight:600;line-height:1.15}.stay-map-popup-copy>span{font-size:.72rem;font-weight:800;color:#315f4b}.home-map-section{padding:95px 0;background:#e7e5df;border-top:1px solid #d5d2ca;border-bottom:1px solid #d5d2ca}.home-map-heading{align-items:end}.home-map-heading>div>p:last-child{max-width:700px;color:var(--muted);margin:10px 0 0;line-height:1.7}.home-map-frame{height:560px;border:1px solid #c8c9c1;background:#dfe3d8;box-shadow:0 18px 50px rgba(25,32,32,.09);overflow:hidden}.home-map-frame .stay-map,.home-map-frame .stay-map-fallback{min-height:560px}.home-stay-map{height:100%}\n@media(max-width:1000px){.home-map-frame{height:500px}.home-map-frame .stay-map,.home-map-frame .stay-map-fallback{min-height:500px}}\n@media(max-width:700px){.home-map-section{padding:65px 0}.home-map-frame{width:100%;height:430px;border-left:0;border-right:0}.home-map-frame .stay-map,.home-map-frame .stay-map-fallback{min-height:430px}.map-shell.live-map{height:430px}.mapboxgl-ctrl-top-right{top:62px}.stay-map-popup{min-width:190px;max-width:240px}}`,
);

console.log("Mapbox milestone overlay applied.");
console.log("Next: npm install");
console.log("Then apply supabase/migrations/20260918004000_mapbox_locations.sql to Supabase.");
console.log("Add NEXT_PUBLIC_MAPBOX_TOKEN and MAPBOX_GEOCODING_TOKEN to .env.local/Vercel.");
console.log("Then run npm run map:backfill, npm run typecheck, and npm run build.");
