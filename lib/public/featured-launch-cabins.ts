import type { Property } from "@/data/catalog";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Home featured inventory is strictly launch-priority (1), verified-partner,
 * published cabins. Never fill the homepage with non-cabins or regular hosts.
 * The public inventory is already filtered to published, active units by the
 * guest-safe listing RPC; the database lookup only determines eligibility.
 */
export async function selectLaunchPartnerCabins(published: Property[]): Promise<Property[]> {
  if (!published.length) return [];

  try {
    const admin = createAdminClient();
    const { data: cabins, error: cabinsError } = await admin
      .from("properties")
      .select("id,organization_id")
      .eq("status", "PUBLISHED")
      .eq("homepage_feature_priority", 1)
      .eq("property_type", "Cabin");

    if (cabinsError) throw cabinsError;
    if (!cabins?.length) return [];

    const organizationIds = [...new Set(cabins.map((cabin) => cabin.organization_id))];
    const { data: partners, error: partnerError } = await admin
      .from("organizations")
      .select("id")
      .in("id", organizationIds)
      .eq("partner_status", "VERIFIED");
    if (partnerError) throw partnerError;

    const verified = new Set((partners ?? []).map((partner) => partner.id));
    const eligibleIds = cabins
      .filter((cabin) => verified.has(cabin.organization_id))
      .map((cabin) => cabin.id);
    if (!eligibleIds.length) return [];

    const { data: units, error: unitsError } = await admin
      .from("property_units")
      .select("slug")
      .in("property_id", eligibleIds)
      .eq("is_primary", true)
      .eq("is_active", true);
    if (unitsError) throw unitsError;

    const eligibleSlugs = new Set((units ?? []).map((unit) => unit.slug));
    return published.filter((stay) => stay.type === "Cabin" && eligibleSlugs.has(stay.slug));
  } catch (error) {
    // A failed eligibility query must never silently feature all inventory.
    console.error("[home featured] unable to verify launch-partner cabins", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}
