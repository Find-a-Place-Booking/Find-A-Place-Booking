import { NextRequest } from "next/server";
import { authenticateMobileHost } from "@/lib/mobile/host-access";
import { mobileJson, mobileOptions } from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function OPTIONS(request: NextRequest) { return mobileOptions(request); }
export async function GET(request: NextRequest) {
  const result = await authenticateMobileHost(request);
  if (!result.ok) return mobileJson(request, { error: result.message }, result.status);
  if (!result.access.allowed) return mobileJson(request, { error: "Host mobile access requires an active trial or subscription.", access: result.access }, 402);
  const admin = result.admin;
  const org = result.access.organizationId;
  const today = new Date().toISOString().slice(0, 10);
  const [properties, published, bookings, recent, payment] = await Promise.all([
    admin.from("properties").select("id", { count: "exact", head: true }).eq("organization_id", org).neq("status", "ARCHIVED"),
    admin.from("properties").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "PUBLISHED"),
    admin.from("reservations").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "CONFIRMED").gte("check_out", today),
    admin.from("reservations").select("id,check_in,check_out,guest_name,guest_count,status,guest_total_cents,property_id").eq("organization_id", org).eq("status", "CONFIRMED").gte("check_out", today).order("check_in", { ascending: true }).limit(8),
    admin.from("payment_accounts").select("id").eq("organization_id", org).eq("provider", "STRIPE").eq("status", "READY").eq("charges_enabled", true).limit(1).maybeSingle(),
  ]);
  if (properties.error || published.error || bookings.error || recent.error || payment.error) {
    return mobileJson(request, { error: "Host dashboard is temporarily unavailable." }, 503);
  }
  return mobileJson(request, {
    organization: result.access.organizationName,
    access: result.access,
    propertyCount: properties.count ?? 0,
    publishedCount: published.count ?? 0,
    upcomingReservationCount: bookings.count ?? 0,
    stripeReady: Boolean(payment.data),
    upcoming: recent.data ?? [],
  });
}
