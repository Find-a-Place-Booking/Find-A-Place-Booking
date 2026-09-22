import { redirect } from "next/navigation";

import { getHostProperties } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";

export type HostReservationRow = {
  id: string;
  confirmation_code: string;
  organization_id: string;
  property_id: string;
  unit_id: string;
  status: string;
  check_in: string;
  check_out: string;
  hold_expires_at: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_count: number;
  pet_count: number;
  currency: string;
  guest_total_cents: number;
  platform_commission_cents: number;
  commission_tier: string;
  commission_rate_bps: number;
  payment_provider: "STRIPE" | "SQUARE" | null;
  payment_status: string;
  tax_status: string;
  created_at: string;
  cancelled_at: string | null;
};

async function requireHost() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/host/sign-in");
  return supabase;
}

export async function getHostReservationWorkspace() {
  const [properties, supabase] = await Promise.all([
    getHostProperties(),
    requireHost(),
  ]);
  const unitIds = properties.map((property) => property.unitId);

  if (!unitIds.length) {
    return {
      properties,
      reservations: [] as HostReservationRow[],
      testToolsEnabled: false,
    };
  }

  const [expireResult, testToolsResult] = await Promise.all([
    supabase.rpc("expire_reservation_holds", { target_unit_id: null }),
    supabase.rpc("test_reservation_tools_enabled"),
  ]);

  if (expireResult.error) {
    console.error("[expire_reservation_holds]", {
      code: expireResult.error.code,
      message: expireResult.error.message,
    });
  }

  if (testToolsResult.error) {
    console.error("[test_reservation_tools_enabled]", {
      code: testToolsResult.error.code,
      message: testToolsResult.error.message,
    });
  }

  // Cancellation is reservation history, not deletion. Deliberately do not
  // filter by status here: CANCELLED rows must remain visible to the host.
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id,confirmation_code,organization_id,property_id,unit_id,status,check_in,check_out,hold_expires_at,guest_name,guest_email,guest_count,pet_count,currency,guest_total_cents,platform_commission_cents,commission_tier,commission_rate_bps,payment_provider,payment_status,tax_status,created_at,cancelled_at",
    )
    .in("unit_id", unitIds)
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    throw new Error("Unable to load host reservation history.");
  }

  return {
    properties,
    reservations: (data ?? []) as HostReservationRow[],
    testToolsEnabled: testToolsResult.error
      ? false
      : testToolsResult.data === true,
  };
}
