import { propertyMatchesDestination, type Property } from "@/data/catalog";

// Official NPS campground/access coordinates, not private property locations.
// The river has three districts, and Jasper alone cannot represent all of them.
const ACCESS_POINTS = [
  { lat: 36.0407758042, lng: -93.344048343 }, // Steel Creek / upper
  { lat: 35.9867152274, lng: -92.7639029014 }, // Tyler Bend / middle
  { lat: 36.0853650144, lng: -92.5656548749 }, // Buffalo Point / lower
];

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

export function searchBuffaloRiverStays(properties: Property[], destination: string, radiusMiles: number): Property[] {
  const radius = Number.isFinite(radiusMiles) ? Math.max(0, Math.min(100, radiusMiles)) : 40;
  return properties.flatMap((property) => {
    const direct = propertyMatchesDestination(property, destination);
    const distance = validCoordinate(property.lat, property.lng)
      ? Math.min(...ACCESS_POINTS.map((point) => milesBetween(point, property))) : Infinity;
    return direct || distance <= radius ? [{property,distance,direct}] : [];
  }).sort((a,b) => a.distance - b.distance || Number(b.direct) - Number(a.direct))
    .map(({property}) => property);
}
