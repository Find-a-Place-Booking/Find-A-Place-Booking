import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY?.trim() ||
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const mapboxToken =
  process.env.MAPBOX_GEOCODING_TOKEN?.trim() ||
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim();

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL and Supabase server key.");
}
if (!mapboxToken) {
  throw new Error("Missing MAPBOX_GEOCODING_TOKEN or NEXT_PUBLIC_MAPBOX_TOKEN.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const clean = (value) => value?.trim().replace(/\s+/g, " ") || "";
const round = (value) => Math.round(value * 1_000_000) / 1_000_000;

function addressFor(property) {
  return [
    clean(property.street_address),
    clean(property.city),
    clean(property.region_code),
    clean(property.postal_code),
    clean(property.country_code) || "US",
  ]
    .filter(Boolean)
    .join(", ");
}

function addressKey(property) {
  return createHash("sha256").update(addressFor(property).toLowerCase()).digest("hex");
}

function publicCoordinates(propertyId, latitude, longitude, exactAddressPublic) {
  if (exactAddressPublic) return { latitude: round(latitude), longitude: round(longitude) };
  const digest = createHash("sha256").update(`find-a-place-public-map:${propertyId}`).digest();
  const bearing = (digest.readUInt16BE(0) / 65535) * Math.PI * 2;
  const distanceMiles = 1.25 + (digest.readUInt16BE(2) / 65535) * 1.25;
  const latitudeRadians = (latitude * Math.PI) / 180;
  return {
    latitude: round(latitude + (distanceMiles / 69) * Math.cos(bearing)),
    longitude: round(
      longitude +
        (distanceMiles / (69.172 * Math.max(0.2, Math.cos(latitudeRadians)))) *
          Math.sin(bearing),
    ),
  };
}

async function geocode(property) {
  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", addressFor(property));
  url.searchParams.set("country", "us");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("limit", "1");
  url.searchParams.set("permanent", "true");
  url.searchParams.set("access_token", mapboxToken);

  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `Mapbox ${response.status}`);

  const feature = payload.features?.find(
    (candidate) => candidate.geometry?.type === "Point" && candidate.geometry.coordinates?.length >= 2,
  );
  const longitude = Number(feature?.geometry?.coordinates?.[0]);
  const latitude = Number(feature?.geometry?.coordinates?.[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("No usable coordinate returned");
  }
  return { latitude: round(latitude), longitude: round(longitude) };
}

const { data, error } = await supabase
  .from("properties")
  .select(
    "id,status,street_address,city,region_code,postal_code,country_code,latitude,longitude,exact_address_public,geocoded_address_key,public_map_latitude,public_map_longitude",
  )
  .neq("status", "ARCHIVED")
  .order("created_at", { ascending: true });

if (error) throw error;

let updated = 0;
let skipped = 0;
let failed = 0;

for (const property of data ?? []) {
  if (!clean(property.street_address) || !clean(property.city) || !clean(property.region_code)) {
    console.log(`skip ${property.id}: incomplete address`);
    skipped += 1;
    continue;
  }

  try {
    const key = addressKey(property);
    let latitude = Number(property.latitude);
    let longitude = Number(property.longitude);

    if (
      property.geocoded_address_key !== key ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      const exact = await geocode(property);
      latitude = exact.latitude;
      longitude = exact.longitude;
    }

    const publicPoint = publicCoordinates(
      property.id,
      latitude,
      longitude,
      Boolean(property.exact_address_public),
    );

    const { error: updateError } = await supabase
      .from("properties")
      .update({
        latitude,
        longitude,
        public_map_latitude: publicPoint.latitude,
        public_map_longitude: publicPoint.longitude,
        geocoded_address_key: key,
        geocoded_at: new Date().toISOString(),
      })
      .eq("id", property.id);

    if (updateError) throw updateError;
    console.log(`mapped ${property.id} (${property.status})`);
    updated += 1;
  } catch (backfillError) {
    console.error(`failed ${property.id}:`, backfillError instanceof Error ? backfillError.message : backfillError);
    failed += 1;
  }
}

console.log(`Map backfill complete: ${updated} updated, ${skipped} skipped, ${failed} failed.`);
if (failed) process.exitCode = 1;
