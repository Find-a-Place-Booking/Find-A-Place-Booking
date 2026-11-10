import type { Property } from "@/data/catalog";

type DiscoveryStay = Pick<Property, "type" | "name" | "tags" | "sleeps">;
type LuxuryStay = Pick<Property, "type" | "name" | "tags" | "price">;

/** This collection is intentionally a higher-priced tier, not "unusual" stays. */
export const LUXURY_MIN_NIGHTLY_PRICE = 300;

export function isLuxuryStay(stay: LuxuryStay): boolean {
  if (!Number.isFinite(stay.price) || stay.price < LUXURY_MIN_NIGHTLY_PRICE) return false;
  const type = normalized(stay.type);
  const name = normalized(stay.name);
  if (/\brv\b|camp|tent|\bsite\b/.test(type) || /\b(rv site|camping site|tent site)\b/.test(name)) {
    return false;
  }
  if (type === "other") {
    // Some luxury homes use "Other" as a property type. Require a clear
    // property label before including them solely for being expensive.
    return (stay.tags || []).some((tag) => ["luxury", "luxury stay", "premium stay", "luxury cabin"].includes(normalized(tag)));
  }
  return true;
}

const DISTINCTIVE_TYPES = new Set([
  "glamping", "tiny home", "tiny house", "treehouse", "yurt", "dome",
  "a-frame", "aframe", "houseboat", "hobbit house", "geodesic dome",
]);
const DISTINCTIVE_TAGS = new Set([
  "unique stay", "unique stays", "treehouse", "yurt", "glamping", "tiny home",
  "a-frame", "aframe", "dome", "houseboat", "hobbit house",
]);

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/[-–—]/g, "-").replace(/\s+/g, " ");
}

/** Only identify a unique stay from explicit type/amenity labels, never guess from a photo or vague name. */
export function isUniqueStay(stay: DiscoveryStay): boolean {
  return DISTINCTIVE_TYPES.has(normalized(stay.type)) ||
    (stay.tags || []).some((tag) => DISTINCTIVE_TAGS.has(normalized(tag)));
}

/** A large group accommodation is not the same thing as an RV/campsite with a high capacity. */
export function isLargeGroupStay(stay: DiscoveryStay): boolean {
  if (!Number.isFinite(stay.sleeps) || stay.sleeps < 8) return false;
  const type = normalized(stay.type);
  if (/\brv\b|camp|tent|\bsite\b/.test(type) || type === "other") return false;
  if (/\b(rv site|camping site|tent site)\b/i.test(stay.name)) return false;
  return true;
}
