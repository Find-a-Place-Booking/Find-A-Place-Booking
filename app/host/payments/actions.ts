"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 1000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}
function percentToBps(value: string) {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100);
}
function paymentsRedirect(kind: "saved" | "error", message: string): never {
  redirect(`/host/payments?${kind}=${encodeURIComponent(message)}#property-taxes`);
}
export async function startStripeOnboarding(_formData?: FormData) {
  redirect("/host/payments");
}
export async function saveHostPropertyTaxConfiguration(formData: FormData) {
  const propertyId = field(formData, "propertyId", 100);
  const countyName = field(formData, "countyName", 120);
  const localityName = field(formData, "localityName", 120);
  const localSalesRateBps = percentToBps(field(formData, "localSalesRatePercent", 20));
  const localLodgingRateBps = percentToBps(field(formData, "localLodgingRatePercent", 20));
  const localLodgingLabel = field(formData, "localLodgingLabel", 160);
  const responsibilityAck = formData.get("responsibilityAck") === "on";

  if (!propertyId) paymentsRedirect("error", "Property is required.");
  if (localSalesRateBps == null || localLodgingRateBps == null) {
    paymentsRedirect("error", "Enter valid tax percentages between 0% and 100%.");
  }
  if (!responsibilityAck) {
    paymentsRedirect("error", "Confirm that you are responsible for the tax configuration and remittance.");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/host/sign-in");

  const { error } = await supabase.rpc("host_save_property_tax_configuration", {
    target_property_id: propertyId,
    county_name_value: countyName || null,
    locality_name_value: localityName || null,
    local_sales_rate_bps_value: localSalesRateBps,
    local_lodging_rate_bps_value: localLodgingRateBps,
    local_lodging_label_value: localLodgingLabel || null,
    responsibility_ack_value: true,
  });

  if (error) {
    console.error("[saveHostPropertyTaxConfiguration]", error);
    paymentsRedirect("error", error.message);
  }

  revalidatePath("/host/payments");
  revalidatePath("/checkout");
  paymentsRedirect("saved", "Property tax setup saved and certified.");
}
