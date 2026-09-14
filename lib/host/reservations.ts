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
};

async function requireHost() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/host/sign-in");
  return supabase;
}

export async function getHostReservationWorkspace() {
  const [properties, supabase] = await Promise.all([getHostProperties(), requireHost()]);
  const unitIds = properties.map((property) => property.unitId);
  if (!unitIds.length) return { properties, reservations: [] as HostReservationRow[] };

  await supabase.rpc("expire_reservation_holds", { target_unit_id: null });
  const { data, error } = await supabase
    .from("reservations")
    .select("id,confirmation_code,organization_id,property_id,unit_id,status,check_in,check_out,hold_expires_at,guest_name,guest_email,guest_count,pet_count,currency,guest_total_cents,platform_commission_cents,commission_tier,commission_rate_bps,payment_provider,payment_status,tax_status,created_at")
    .in("unit_id", unitIds)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Unable to load reservations. Apply Milestone 10A migration 016 and refresh.");

  return { properties, reservations: (data ?? []) as HostReservationRow[] };
}
