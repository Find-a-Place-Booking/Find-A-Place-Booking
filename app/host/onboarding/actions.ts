"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type SaveHostOnboardingPayload = {
  organizationId: string;
  step: number;
  form: Record<string, string>;
  amenities: string[];
  policies: string[];
  photoNames: string[];
  authorityConfirmed: boolean;
};

export type SaveHostOnboardingResult = {
  ok: boolean;
  message: string;
  savedAt?: string;
  partnerStatus?: string;
  commissionTier?: string;
  onboardingStatus?: string;
};

function compactText(value: unknown, max = 5000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function sanitizeForm(form: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(form).map(([key, value]) => [
      key,
      compactText(value),
    ]),
  );
}

function sanitizeSelection(values: string[], limit: number) {
  return [
    ...new Set(
      values
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]
    .slice(0, limit)
    .map((value) => value.slice(0, 160));
}

export async function saveHostOnboarding(
  payload: SaveHostOnboardingPayload,
): Promise<SaveHostOnboardingResult> {
  if (!payload?.organizationId) {
    return {
      ok: false,
      message: "Host organization is missing. Refresh and try again.",
    };
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    return {
      ok: false,
      message: "Your session expired. Sign in again before saving.",
    };
  }

  const { data, error } = await supabase.rpc("save_host_onboarding", {
    target_organization_id: payload.organizationId,
    target_step: Math.max(0, Math.min(Number(payload.step) || 0, 9)),
    draft_form: sanitizeForm(payload.form ?? {}),
    selected_amenities: sanitizeSelection(payload.amenities ?? [], 100),
    selected_policies: sanitizeSelection(payload.policies ?? [], 100),
    selected_photo_names: sanitizeSelection(payload.photoNames ?? [], 24),
    confirmed_authority: Boolean(payload.authorityConfirmed),
  });

  if (error) {
    console.error("[saveHostOnboarding] Supabase RPC failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    const partnerIdentityMissing = error.message?.includes(
      "Partner claim requires identifying information",
    );
    const policyAcceptanceMissing = error.message?.includes(
      "Current host policy acceptance is required",
    );

    return {
      ok: false,
      message: partnerIdentityMissing
        ? "Add at least one membership identifier before submitting a partner claim: business/property name, owner name, email or phone."
        : policyAcceptanceMissing
          ? "Accept the Find A Place Host Agreement and policies before finishing host setup."
          : "We couldn't save your setup. Your current screen is still here; try again before leaving.",
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  revalidatePath("/host");
  revalidatePath("/host/onboarding");
  revalidatePath("/admin");
  revalidatePath("/admin/hosts");
  revalidatePath("/admin/partners");

  return {
    ok: true,
    message: payload.authorityConfirmed
      ? "Host setup saved. You can create the real property from the Properties screen."
      : "Progress saved.",
    savedAt: row?.saved_at,
    partnerStatus: row?.partner_status,
    commissionTier: row?.commission_tier,
    onboardingStatus: row?.onboarding_status,
  };
}
