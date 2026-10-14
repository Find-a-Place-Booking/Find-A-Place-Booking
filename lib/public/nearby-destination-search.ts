import { propertyMatchesDestination, type Property } from "@/data/catalog";

export const DEFAULT_SEARCH_RADIUS_MILES = 40;
export const SEARCH_RADIUS_OPTIONS = [15, 25, 40, 60, 100] as const;

type Point = { lat: number; lng: number };
type SearchResult = { properties: Property[]; usedNearby: boolean };

// Curated destination centers keep nearby search usable even if external
// geocoding times out or is not configured. Mapbox handles other towns.
const DESTINATION_CENTERS: Record<string, Point> = {
  "hot springs": { lat: 34.5037, lng: -93.0552 },
  "hot springs national park": { lat: 34.5037, lng: -93.0552 },
  "hot springs village": { lat: 34.6723, lng: -92.9980 },
  "lake ouachita": { lat: 34.6336, lng: -93.2506 },
  "mount ida": { lat: 34.5559, lng: -93.6345 },
  "caddo river": { lat: 34.3269, lng: -93.5493 },
  "glenwood": { lat: 34.3269, lng: -93.5493 },
  "eureka springs": { lat: 36.4012, lng: -93.7379 },
  "branson": { lat: 36.6437, lng: -93.2185 },
  "hollister": { lat: 36.6212, lng: -93.2154 },
  "jasper": { lat: 36.0119, lng: -93.1866 },
  "mountain home": { lat: 36.335345, lng: -92.385159 },
  "calico rock": { lat: 36.1195143, lng: -92.1359867 },
  "norfork": { lat: 36.22925, lng: -92.30672 },
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function cleanedPlace(value: string) {
  return normalize(value)
    .replace(/(?:\s+(?:ar|arkansas|mo|missouri|tx|texas|ok|oklahoma|tn|tennessee))+$/, "")
    .trim();
}

export function normalizeSearchRadiusMiles(value: string | number | undefined) {
  const candidate = Number(value);
  return SEARCH_RADIUS_OPTIONS.some((option) => option === candidate)
    ? candidate
    : DEFAULT_SEARCH_RADIUS_MILES;
}

function validPoint(point: Point) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
    && !(point.lat === 0 && point.lng === 0);
}

function milesBetween(a: Point, b: Point) {
  const deg = Math.PI / 180;
  const lat = (b.lat - a.lat) * deg;
  const lng = (b.lng - a.lng) * deg;
  const sinLat = Math.sin(lat / 2);
  const sinLng = Math.sin(lng / 2);
  const arc = sinLat * sinLat + Math.cos(a.lat * deg) * Math.cos(b.lat * deg) * sinLng * sinLng;
  return 3958.76 * 2 * Math.asin(Math.min(1, Math.sqrt(arc)));
}

async function geocodeTown(search: string): Promise<Point | null> {
  const token = (process.env.MAPBOX_GEOCODING_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
  if (!token) return null;

  const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
  url.searchParams.set("q", search);
  url.searchParams.set("country", "us");
  url.searchParams.set("types", "place,locality");
  url.searchParams.set("autocomplete", "false");
  url.searchParams.set("limit", "1");
  url.searchParams.set("access_token", token);

  try {
    const response = await fetch(url, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as {
      features?: Array<{ geometry?: { coordinates?: unknown[] } }>;
    };
    const coordinates = payload.features?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    const point = { lng: Number(coordinates[0]), lat: Number(coordinates[1]) };
    return validPoint(point) ? point : null;
  } catch (error) {
    console.warn("[nearby search] geocoding unavailable; using textual matching", {
      search,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

async function destinationCenter(destination: string, properties: Property[]) {
  const query = cleanedPlace(destination);
  const preset = DESTINATION_CENTERS[query];
  if (preset) return preset;

  // Smaller towns with listings can use the listings' approximate public map
  // coordinates if Mapbox is unavailable. Never use precise private addresses.
  const exactTownProperties = properties.filter((property) =>
    cleanedPlace(property.city) === query && validPoint(property),
  );
  if (exactTownProperties.length) {
    return {
      lat: exactTownProperties.reduce((sum, property) => sum + property.lat, 0) / exactTownProperties.length,
      lng: exactTownProperties.reduce((sum, property) => sum + property.lng, 0) / exactTownProperties.length,
    };
  }

  if (query === "arkansas" || query === "missouri" || query === "texas" || query === "anywhere") {
    return null;
  }
  return geocodeTown(destination.trim().slice(0, 120));
}

export async function searchPublishedStaysNearby(
  properties: Property[],
  destination: string,
  radiusMiles: number,
): Promise<SearchResult> {
  if (!destination.trim()) return { properties, usedNearby: false };

  const center = await destinationCenter(destination, properties);
  if (!center) {
    return {
      properties: properties.filter((property) => propertyMatchesDestination(property, destination)),
      usedNearby: false,
    };
  }

  const result = properties.flatMap((property) => {
    const directMatch = propertyMatchesDestination(property, destination);
    const distance = validPoint(property) ? milesBetween(center, property) : Infinity;
    return directMatch || distance <= radiusMiles
      ? [{ property, distance, directMatch }]
      : [];
  });

  result.sort((a, b) => a.distance - b.distance || Number(b.directMatch) - Number(a.directMatch));
  return { properties: result.map(({ property }) => property), usedNearby: true };
}
