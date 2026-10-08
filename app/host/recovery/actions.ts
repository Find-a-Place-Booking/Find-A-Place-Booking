"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { activateRecoveryOpportunity } from "@/lib/bookings/recovery-offers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function text(formData: FormData, key: string, max = 120) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function numberValue(
  formData: FormData,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(text(formData, key, 30));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function recoveryRedirect(result: string, detail?: string): never {
  const params = new URLSearchParams({ result });
  if (detail) params.set("detail", detail.slice(0, 240));
  redirect(`/host/recovery?${params.toString()}`);
}

async function authenticatedHost() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (!profileId) redirect("/host/sign-in");
  return { supabase, profileId };
}

function refreshRecovery() {
  revalidatePath("/host");
  revalidatePath("/host/recovery");
}

export async function saveRecoverySettings(formData: FormData) {
  const propertyId = text(formData, "propertyId", 80);
  const { supabase, profileId } = await authenticatedHost();

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id,organization_id,name")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError || !property) {
    recoveryRedirect("error", "Property access required.");
  }

  const offerModeRaw = text(formData, "offerMode", 10).toUpperCase();
  const offerMode = ["ASK", "AUTO", "OFF"].includes(offerModeRaw)
    ? offerModeRaw
    : "ASK";

  const discountPercent = numberValue(formData, "discountPercent", 10, 1, 50);
  const minimumInterest = numberValue(formData, "minimumInterest", 2, 1, 50);
  const expiryHours = numberValue(formData, "offerExpiryHours", 48, 12, 168);

  const { error } = await supabase
    .from("booking_recovery_settings")
    .upsert(
      {
        property_id: property.id,
        organization_id: property.organization_id,
        is_enabled: formData.get("enabled") === "on",
        day_one_enabled: formData.get("dayOneEnabled") === "on",
        offer_mode: offerMode,
        default_discount_bps: discountPercent * 100,
        minimum_interest: minimumInterest,
        offer_expiry_hours: expiryHours,
        created_by: profileId,
        updated_by: profileId,
      },
      { onConflict: "property_id" },
    );

  if (error) recoveryRedirect("error", error.message);
  refreshRecovery();
  recoveryRedirect("settings-saved");
}

export async function sendRecoveryOffer(formData: FormData) {
  const opportunityId = text(formData, "opportunityId", 80);
  const discountPercent = numberValue(formData, "discountPercent", 10, 1, 50);
  const { supabase, profileId } = await authenticatedHost();

  const { data: opportunity, error } = await supabase
    .from("booking_recovery_opportunities")
    .select("id,status")
    .eq("id", opportunityId)
    .maybeSingle();

  if (error || !opportunity) {
    recoveryRedirect("error", "Recovery opportunity access required.");
  }
  if (opportunity.status !== "OPEN") {
    recoveryRedirect("error", "That recovery opportunity is no longer open.");
  }

  try {
    const result = await activateRecoveryOpportunity({
      admin: createAdminClient(),
      opportunityId,
      discountBps: discountPercent * 100,
      createdBy: profileId,
    });

    refreshRecovery();
    recoveryRedirect(
      "offer-sent",
      result.sent === 1
        ? "Offer sent to 1 guest."
        : `Offers sent to ${result.sent} guests.`,
    );
  } catch (offerError) {
    recoveryRedirect(
      "error",
      offerError instanceof Error ? offerError.message : "Unable to send recovery offer.",
    );
  }
}

export async function declineRecoveryOpportunity(formData: FormData) {
  const opportunityId = text(formData, "opportunityId", 80);
  const { supabase } = await authenticatedHost();

  const { data: opportunity, error } = await supabase
    .from("booking_recovery_opportunities")
    .select("id,status")
    .eq("id", opportunityId)
    .maybeSingle();

  if (error || !opportunity) {
    recoveryRedirect("error", "Recovery opportunity access required.");
  }

  const { error: updateError } = await createAdminClient()
    .from("booking_recovery_opportunities")
    .update({
      status: "DECLINED",
      declined_at: new Date().toISOString(),
    })
    .eq("id", opportunityId)
    .eq("status", "OPEN");

  if (updateError) recoveryRedirect("error", updateError.message);
  refreshRecovery();
  recoveryRedirect("declined");
}
