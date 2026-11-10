import { NextRequest } from "next/server";
import { guestCheckoutTokenMatches } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { mobileJson, mobileOptions, readMobileObject } from "@/lib/mobile/http";
export async function OPTIONS(r: NextRequest) {
  return mobileOptions(r);
}
export async function POST(r: NextRequest) {
  const parsed = await readMobileObject(r);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  if (
    typeof b?.reservationId !== "string" ||
    typeof b?.checkoutToken !== "string" ||
    !guestCheckoutTokenMatches(b.reservationId, b.checkoutToken)
  )
    return mobileJson(
      r,
      { error: "Booking access could not be verified." },
      403,
    );
  const admin = createAdminClient();
  const result = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,status,check_in,check_out,guest_count,guest_total_cents,currency,property_id",
    )
    .eq("id", b.reservationId)
    .in("status", ["CONFIRMED", "CANCELLED"])
    .maybeSingle();
  if (result.error || !result.data)
    return mobileJson(r, { error: "Booking not found." }, 404);
  const property = await admin
    .from("properties")
    .select("name")
    .eq("id", result.data.property_id)
    .maybeSingle();
  return mobileJson(r, {
    reservation: {
      ...result.data,
      propertyName: property.data?.name || "Your stay",
    },
  });
}
