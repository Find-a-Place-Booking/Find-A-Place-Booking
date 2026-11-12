import type { Property } from "@/data/catalog";

type DiscoveryStay = Pick<Property, "type" | "name" | "tags" | "sleeps">;
type LuxuryStay = Pick<Property, "type" | "name" | "tags" | "price">;

/** Luxury is price-led; unique stays are based on unusual accommodations. */
export const LUXURY_MIN_NIGHTLY_PRICE = 300;

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/[-–—]/g, "-").replace(/\s+/g, " ");
}

export function isLuxuryStay(stay: LuxuryStay): boolean {
  if (!Number.isFinite(stay.price) || stay.price < LUXURY_MIN_NIGHTLY_PRICE) return false;
  const type = normalized(stay.type);
  const name = normalized(stay.name);
  if (/\brv\b|camp|tent|\bsite\b/.test(type) || /\b(rv site|camping site|tent site)\b/.test(name)) return false;
  if (type === "other") {
    return (stay.tags || []).some(tag => ["luxury", "luxury stay", "premium stay", "luxury cabin"].includes(normalized(tag)));
  }
  return true;
}

const DISTINCTIVE_TYPES = new Set([
  "glamping", "tiny home", "tiny house", "treehouse", "yurt", "dome",
  "a-frame", "aframe", "houseboat", "hobbit house", "geodesic dome",
  "caboose", "train car", "railcar", "converted railcar", "converted bus", "shipping container",
]);
const DISTINCTIVE_TAGS = new Set([
  "unique stay", "unique stays", "treehouse", "yurt", "glamping", "tiny home",
  "a-frame", "aframe", "dome", "houseboat", "hobbit house", "caboose",
  "train car", "railcar", "shipping container",
]);

/** Explicit unusual structures, never premium price alone. */
export function isUniqueStay(stay: DiscoveryStay): boolean {
  const type = normalized(stay.type);
  const name = normalized(stay.name);
  if (DISTINCTIVE_TYPES.has(type)) return true;
  if ((stay.tags || []).some(tag => DISTINCTIVE_TAGS.has(normalized(tag)))) return true;
  // Explicit names allow historic cabooses listed as "Other" to qualify.
  if (/\b(caboose|railcar|train car|treehouse|yurt|geodesic dome|hobbit house)\b/.test(name)) return true;
  return false;
}

/** A large group accommodation is not a campground with many tent spaces. */
export function isLargeGroupStay(stay: DiscoveryStay): boolean {
  if (!Number.isFinite(stay.sleeps) || stay.sleeps < 8) return false;
  const type = normalized(stay.type);
  if (/\brv\b|camp|tent|\bsite\b/.test(type) || type === "other") return false;
  if (/\b(rv site|camping site|tent site)\b/i.test(stay.name)) return false;
  return true;
}
