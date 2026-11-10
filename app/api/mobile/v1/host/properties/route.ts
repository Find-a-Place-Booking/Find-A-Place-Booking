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
  const { data, error } = await result.admin
    .from("properties")
    .select("id,name,status,city,region_code")
    .eq("organization_id", result.access.organizationId)
    .neq("status", "ARCHIVED")
    .order("name", { ascending: true })
    .limit(100);
  if (error)
    return mobileJson(
      request,
      { error: "Properties could not be loaded." },
      503,
    );
  return mobileJson(request, { properties: data ?? [] });
}
