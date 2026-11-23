/** Apply partner-first presentation AFTER nearby/distance and Buffalo River
 * matching. This preserves the geographic and availability safety rules. */
export * from "./nearby-destination-search";

import { searchPublishedStaysNearby as originalNearby } from "./nearby-destination-search";
import { partnerFirst } from "./partner-priority";

export async function searchPublishedStaysNearby(
  ...args: Parameters<typeof originalNearby>
): Promise<Awaited<ReturnType<typeof originalNearby>>> {
  const result = await originalNearby(...args);
  return { ...result, properties: partnerFirst(result.properties) };
}
