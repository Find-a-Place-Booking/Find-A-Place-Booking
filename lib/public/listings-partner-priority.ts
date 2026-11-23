/**
 * Shared, server-only marketplace ordering layer.
 * The more-specific tsconfig path maps existing @/lib/public/listings
 * imports here. Relative imports below deliberately use the original module.
 * All other public listing functions and types are forwarded untouched.
 */
export * from "./listings";

import {
  getPublishedProperties as getOriginalProperties,
  getPublishedMapStays as getOriginalMapStays,
} from "./listings";
import { annotateAndSortPartnerFirst } from "./partner-priority";

export async function getPublishedProperties(
  input?: Parameters<typeof getOriginalProperties>[0],
): Promise<Awaited<ReturnType<typeof getOriginalProperties>>> {
  // Apply limits only AFTER partner ordering, otherwise an unverified listing
  // could consume a position that should go to a verified partner.
  const limit = typeof input === "number" ? input : input?.limit;
  const options = typeof input === "number"
    ? { featuredPriority: true }
    : { ...input, featuredPriority: true, limit: undefined };

  // The original availability and publishing guards remain authoritative.
  const published = await getOriginalProperties(options);
  const ordered = await annotateAndSortPartnerFirst(published);
  return typeof limit === "number" && limit >= 0
    ? ordered.slice(0, limit)
    : ordered;
}

export async function getPublishedMapStays(): Promise<Awaited<ReturnType<typeof getOriginalMapStays>>> {
  const mapStays = await getOriginalMapStays();
  return annotateAndSortPartnerFirst(mapStays);
}
