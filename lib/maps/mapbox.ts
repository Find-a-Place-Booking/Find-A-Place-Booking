import { createHash } from "node:crypto";

export type PropertyMapAddress = {
  streetAddress?: string | null;
  city?: string | null;
  regionCode?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
};

type MapboxFeature = {
  geometry?: {
    type?: string;
    coordinates?: unknown[];
  };
  properties?: {
    full_address?: string;
    name?: string;
  };
};

type MapboxGeocodeResponse = {
  features?: MapboxFeature[];
  message?: string;
};

function clean(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ") || "";
}

function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function hasGeocodableAddress(address: PropertyMapAddress) {
  return Boolean(
    clean(address.streetAddress) &&
      clean(address.city) &&
      clean(address.regionCode),
  );
}

export function formatPropertyMapAddress(address: PropertyMapAddress) {
  return [
    clean(address.streetAddress),
    clean(address.city),
    clean(address.regionCode),
    clean(address.postalCode),
    clean(address.countryCode) || "US",
  ]
    .filter(Boolean)
    .join(", ");
}

export function propertyMapAddressKey(address: PropertyMapAddress) {
  return createHash("sha256")
    .update(formatPropertyMapAddress(address).toLowerCase())
    .digest("hex");
}

function mapboxGeocodingToken() {
  return (
    process.env.MAPBOX_GEOCODING_TOKEN?.trim() ||
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ||
    ""
  );
}

export async function geocodePermanentPropertyAddress(
  address: PropertyMapAddress,
) {
  if (!hasGeocodableAddress(address)) {
    throw new Error("A street address, city and state are required for mapping.");
  }

  const token = mapboxGeocodingToken();
  if (!token) {
    throw new Error("Mapbox geocoding is not configured.");
  }

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", formatPropertyMapAddress(address));
  url.searchParams.set("country", "us");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("limit", "1");
  // We persist the returned coordinates in Supabase, so this must be a
  // permanent geocoding request rather than Mapbox's temporary default.
  url.searchParams.set("permanent", "true");
  url.searchParams.set("access_token", token);

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const payload = (await response.json().catch(() => ({}))) as MapboxGeocodeResponse;

  if (!response.ok) {
    throw new Error(payload.message || "Mapbox could not geocode this address.");
  }

  const feature = payload.features?.find(
    (candidate) =>
      candidate.geometry?.type === "Point" &&
      Array.isArray(candidate.geometry.coordinates) &&
      candidate.geometry.coordinates.length >= 2,
  );

  const longitude = Number(feature?.geometry?.coordinates?.[0]);
  const latitude = Number(feature?.geometry?.coordinates?.[1]);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new Error("Mapbox did not return a usable location for this address.");
  }

  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude),
    label:
      feature?.properties?.full_address ||
      feature?.properties?.name ||
      formatPropertyMapAddress(address),
  };
}

export function publicMapCoordinates(input: {
  propertyId: string;
  latitude: number;
  longitude: number;
  exactAddressPublic: boolean;
}) {
  if (input.exactAddressPublic) {
    return {
      latitude: roundCoordinate(input.latitude),
      longitude: roundCoordinate(input.longitude),
    };
  }

  // Keep private-address listings useful on the marketplace map without
  // exposing the actual driveway. The offset is deterministic per property,
  // so the public pin stays stable instead of moving on every request.
  const digest = createHash("sha256")
    .update(`find-a-place-public-map:${input.propertyId}`)
    .digest();
  const bearing = (digest.readUInt16BE(0) / 65535) * Math.PI * 2;
  const distanceMiles = 1.25 + (digest.readUInt16BE(2) / 65535) * 1.25;
  const latitudeRadians = (input.latitude * Math.PI) / 180;
  const latitudeDelta = (distanceMiles / 69) * Math.cos(bearing);
  const longitudeDelta =
    (distanceMiles / (69.172 * Math.max(0.2, Math.cos(latitudeRadians)))) *
    Math.sin(bearing);

  return {
    latitude: roundCoordinate(input.latitude + latitudeDelta),
    longitude: roundCoordinate(input.longitude + longitudeDelta),
  };
}
