import { NextRequest } from "next/server";
import { authenticateMobileHost } from "@/lib/mobile/host-access";
import { mobileJson, mobileOptions } from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function OPTIONS(request: NextRequest) {
  return mobileOptions(request);
}
export async function GET(request: NextRequest) {
  const result = await authenticateMobileHost(request);
  if (!result.ok)
    return mobileJson(request, { error: result.message }, result.status);
  if (!result.access.allowed)
    return mobileJson(
      request,
      { error: "Host app subscription required." },
      402,
    );
  const { data: properties, error: propertyError } = await result.admin
    .from("properties")
    .select("id")
    .eq("organization_id", result.access.organizationId)
    .neq("status", "ARCHIVED")
    .limit(100);
  if (propertyError)
    return mobileJson(
      request,
      { error: "Calendar status could not be loaded." },
      503,
    );
  const propertyIds = (properties ?? []).map((row) => row.id);
  if (!propertyIds.length)
    return mobileJson(request, {
      connections: [],
      checkedAt: new Date().toISOString(),
    });
  const { data: units, error: unitsError } = await result.admin
    .from("property_units")
    .select("id,property_id,name")
    .in("property_id", propertyIds)
    .limit(300);
  if (unitsError)
    return mobileJson(
      request,
      { error: "Calendar status could not be loaded." },
      503,
    );
  const unitNames = new Map((units ?? []).map((unit) => [unit.id, unit.name]));
  const unitIds = [...unitNames.keys()];
  if (!unitIds.length)
    return mobileJson(request, {
      connections: [],
      checkedAt: new Date().toISOString(),
    });
  const { data, error } = await result.admin
    .from("calendar_connections")
    .select("id,unit_id,provider,is_active,sync_status,last_success_at")
    .in("unit_id", unitIds)
    .eq("is_active", true)
    .limit(200);
  if (error)
    return mobileJson(
      request,
      { error: "Calendar status could not be loaded." },
      503,
    );
  return mobileJson(request, {
    connections: (data ?? []).map((connection) => ({
      unit: unitNames.get(connection.unit_id) || "Stay",
      provider: connection.provider,
      syncStatus: connection.sync_status,
      lastSuccessAt: connection.last_success_at,
      // Feed URLs and account credentials are never returned to mobile clients.
    })),
    checkedAt: new Date().toISOString(),
  });
}
