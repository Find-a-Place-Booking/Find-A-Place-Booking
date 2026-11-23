import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Verified partners appear before ordinary inventory in default discovery.
 * No listing is hidden; dates, capacity and distance filters remain unchanged.
 * Explicit guest-selected price/rating ordering may take precedence in the UI.
 */
export type PartnerTagged = { slug: string; verifiedPartner?: boolean };

export function partnerFirst<T>(items: readonly T[]): T[] {
  // ES2019+ Array#sort is stable; original listing/featured/nearby order is
  // preserved inside each group, including the existing weekly rotation.
  return [...items].sort(
    (a, b) => Number(Boolean((b as PartnerTagged).verifiedPartner)) - Number(Boolean((a as PartnerTagged).verifiedPartner)),
  );
}

export async function getVerifiedPartnerSlugs(): Promise<Set<string> | null> {
  try {
  const admin = createAdminClient();
  // Only the already-public PUBLISHED primary units can ever be prioritized.
  const [organizations, properties] = await Promise.all([
    admin.from("organizations").select("id").eq("partner_status", "VERIFIED"),
    admin.from("properties")
      .select("organization_id,property_units!inner(slug,is_primary)")
      .eq("status", "PUBLISHED")
      .eq("property_units.is_primary", true),
  ]);

  if (organizations.error || properties.error) {
    console.error("[partner-priority] Could not load verified host data", {
      organizations: organizations.error?.code,
      properties: properties.error?.code,
    });
    return null; // Fail open: do not hide listings when metadata is unavailable.
  }

  const verifiedOrganizations = new Set((organizations.data ?? []).map((row) => row.id));
  const verifiedSlugs = new Set<string>();
  for (const property of properties.data ?? []) {
    if (!verifiedOrganizations.has(property.organization_id)) continue;
    const units = Array.isArray(property.property_units) ? property.property_units : [];
    for (const unit of units) {
      if (typeof unit.slug === "string" && unit.slug) verifiedSlugs.add(unit.slug);
    }
  }
  return verifiedSlugs;
  } catch (error) {
    console.error("[partner-priority] Unable to read public partner metadata", error);
    return null;
  }
}

export async function annotateAndSortPartnerFirst<T extends { slug: string }>(
  items: readonly T[],
): Promise<Array<T & { verifiedPartner?: boolean }>> {
  if (items.length <= 0) return [];
  const verified = await getVerifiedPartnerSlugs();
  if (!verified) return [...items];
  return partnerFirst(items.map((item) => ({ ...item, verifiedPartner: verified.has(item.slug) })));
}
