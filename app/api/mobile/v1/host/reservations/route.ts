import { NextRequest } from "next/server";
import { authenticateMobileHost } from "@/lib/mobile/host-access";
import { mobileJson, mobileOptions } from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }
export async function GET(request: NextRequest) {
  const result = await authenticateMobileHost(request);
  if (!result.ok) return mobileJson(request, { error: result.message }, result.status);
  if (!result.access.allowed) return mobileJson(request, { error: "Host app subscription required." }, 402);
  const page = Math.max(0, Math.min(50, Number.parseInt(request.nextUrl.searchParams.get("page") || "0", 10) || 0));
  const { data, error } = await result.admin.from("reservations")
    .select("id,confirmation_code,check_in,check_out,status,payment_status,guest_name,guest_count,guest_total_cents,property_id,created_at")
    .eq("organization_id", result.access.organizationId)
    .order("created_at", { ascending: false }).range(page * 20, page * 20 + 19);
  if (error) return mobileJson(request, { error: "Reservations could not be loaded." }, 503);
  return mobileJson(request, {
    reservations: data ?? [], page, hasMore: (data ?? []).length === 20,
    note: "Gross guest totals include platform service fees and taxes; they are not host net earnings.",
  });
}
