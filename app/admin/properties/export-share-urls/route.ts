import { getAdminContext } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";
import { csvLine } from "@/lib/reports/common";
import { CANONICAL_SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PropertyRow = {
  id: string;
  organization_id: string;
  name: string;
  public_area: string | null;
  city: string | null;
  region_code: string | null;
  homepage_feature_priority: number;
};

export async function GET() {
  await getAdminContext();

  const supabase = await createClient();
  const { data: propertyData, error: propertyError } = await supabase
    .from("properties")
    .select(
      "id,organization_id,name,public_area,city,region_code,homepage_feature_priority",
    )
    .eq("status", "PUBLISHED")
    .in("homepage_feature_priority", [1, 2])
    .order("homepage_feature_priority", { ascending: true })
    .order("name", { ascending: true });

  if (propertyError) {
    return new Response("Unable to export stay URLs.", { status: 500 });
  }

  const properties = (propertyData ?? []) as PropertyRow[];
  const propertyIds = properties.map((property) => property.id);
  const organizationIds = [
    ...new Set(properties.map((property) => property.organization_id)),
  ];

  const [{ data: unitData }, { data: organizationData }] = await Promise.all([
    propertyIds.length
      ? supabase
          .from("property_units")
          .select("property_id,slug")
          .in("property_id", propertyIds)
          .eq("is_primary", true)
          .eq("is_active", true)
      : Promise.resolve({ data: [] }),
    organizationIds.length
      ? supabase
          .from("organizations")
          .select("id,name")
          .in("id", organizationIds)
      : Promise.resolve({ data: [] }),
  ]);

  const unitMap = new Map(
    (unitData ?? []).map((unit) => [
      unit.property_id as string,
      unit.slug as string,
    ]),
  );
  const organizationMap = new Map(
    (organizationData ?? []).map((organization) => [
      organization.id as string,
      organization.name as string,
    ]),
  );

  const rows = properties
    .map((property) => {
      const slug = unitMap.get(property.id);
      if (!slug) return null;

      return [
        property.homepage_feature_priority === 1 ? "#1" : "#2",
        property.name,
        organizationMap.get(property.organization_id) || "",
        property.public_area ||
          [property.city, property.region_code].filter(Boolean).join(", "),
        `${CANONICAL_SITE_URL}/stays/${slug}`,
      ];
    })
    .filter((row): row is string[] => Boolean(row));

  const lines = [
    csvLine(["Priority", "Property", "Host / organization", "Area", "Share URL"]),
    ...rows.map((row) => csvLine(row)),
  ];

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="find-a-place-priority-1-2-stay-urls.csv"',
      "Cache-Control": "no-store",
    },
  });
}
