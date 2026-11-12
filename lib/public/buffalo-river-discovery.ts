import type { Property } from "@/data/catalog";

// Reference coordinates are public NPS access/campground locations, not private addresses.
// A focused 12-mile access-point corridor avoids misleading White River/Norfork
// stays while retaining nearby Buffalo River area properties.
// https://www.nps.gov/buff/planyourvisit/getting-around.htm
export const BUFFALO_RIVER_MAX_DISTANCE_MILES = 12;
const ACCESS_POINTS = [
  { lat: 36.0215842559, lng: -93.3543809402 }, // Ponca trail / upper
  { lat: 36.0407758042, lng: -93.344048343 }, // Steel Creek
  { lat: 36.0557562676, lng: -93.2812997285 }, // Kyles Landing
  { lat: 36.0734393674, lng: -93.2177325784 }, // Erbie
  { lat: 36.0621316711, lng: -93.1597244134 }, // Ozark
  { lat: 36.0576658302, lng: -93.1350316289 }, // Pruitt launch
  { lat: 35.9851823163, lng: -93.0381867299 }, // Carver
  { lat: 35.972112684, lng: -92.8819327253 }, // Woolum
  { lat: 35.9867152274, lng: -92.7639029014 }, // Tyler Bend
  { lat: 35.9877379907, lng: -92.7155625076 }, // Gilbert trail
  { lat: 36.0394107175, lng: -92.6299021406 }, // South Maumee
  { lat: 36.028528897, lng: -92.5800834506 }, // Spring Creek
  { lat: 36.0853650144, lng: -92.5656548749 }, // Buffalo Point
  { lat: 36.1228757113, lng: -92.5507485263 }, // Rush / lower
];

// Fallback only for properties lacking a usable public map coordinate.
// Text-only matches must be exact communities, not generic marketing copy.
const BUFFALO_RIVER_COMMUNITIES = new Set([
  "ponca", "boxley", "compton", "jasper", "hasty", "pruitt", "carver",
  "mt judea", "mount judea", "gilbert", "st joe", "saint joe", "marshall",
  "harriet", "woolum", "yellville", "western grove", "pindall",
  "erbie", "ozark", "bass", "maumee", "tyler bend",
]);

function nearRiverByNamedCommunity(property: Property) {
  const state = normalize(property.state);
  if (state && state !== "ar" && state !== "arkansas") return false;
  const city = normalize(property.city).replace(/\s+(ar|ark|arkansas)$/, "");
  if (BUFFALO_RIVER_COMMUNITIES.has(city)) return true;
  const location = normalize(property.location);
  return location === "buffalo river" || location === "buffalo national river"
    || location === "buffalo river country";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function isBuffaloRiverSearch(destination: string) {
  return ["buffalo national river", "buffalo river", "buffalo river area", "buffalo river country"].includes(
    normalize(destination).replace(/\s+(ar|arkansas)$/, ""),
  );
}

function validCoordinate(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

function milesBetween(a: {lat:number;lng:number}, b: {lat:number;lng:number}) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat*r) * Math.cos(b.lat*r) * Math.sin(dLng / 2) ** 2;
  return 3958.76 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function searchBuffaloRiverStays(properties: Property[], _destination: string, radiusMiles: number): Property[] {
  // The specific Buffalo collection has a fixed maximum distance. General search
  // still uses the normal user-defined radius.
  const radius = Number.isFinite(radiusMiles)
    ? Math.max(0, Math.min(BUFFALO_RIVER_MAX_DISTANCE_MILES, radiusMiles))
    : BUFFALO_RIVER_MAX_DISTANCE_MILES;

  return properties.flatMap((property) => {
    const mapped = validCoordinate(property.lat, property.lng);
    if (!mapped && !nearRiverByNamedCommunity(property)) return [];
    const distance = mapped
      ? Math.min(...ACCESS_POINTS.map((point) => milesBetween(point, property)))
      : Infinity;
    return distance <= radius || (!mapped && nearRiverByNamedCommunity(property))
      ? [{ property, distance }]
      : [];
  }).sort((a, b) => a.distance - b.distance)
    .map(({ property }) => property);
}
