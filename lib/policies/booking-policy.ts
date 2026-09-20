import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CANCELLATION_POLICY_VERSION,
  GUEST_TERMS_VERSION,
} from "@/lib/policies/versions";

export type ReservationPolicyAcceptance = {
  reservation_id: string;
  platform_terms_version: string;
  cancellation_policy_version: string;
  property_policy_opened_at: string | null;
  platform_terms_opened_at: string | null;
  accepted_at: string | null;
};

export async function reservationPolicyReadiness(
  admin: SupabaseClient,
  reservationId: string,
) {
  const { data, error } = await admin
    .from("reservation_policy_acceptances")
    .select(
      "reservation_id,platform_terms_version,cancellation_policy_version,property_policy_opened_at,platform_terms_opened_at,accepted_at",
    )
    .eq("reservation_id", reservationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load booking policy acceptance: ${error.message}`);
  }

  const row = (data ?? null) as ReservationPolicyAcceptance | null;
  const currentVersions =
    row?.platform_terms_version === GUEST_TERMS_VERSION &&
    row?.cancellation_policy_version === CANCELLATION_POLICY_VERSION;
  const ready = Boolean(
    currentVersions &&
      row?.property_policy_opened_at &&
      row?.platform_terms_opened_at &&
      row?.accepted_at,
  );

  return {
    ready,
    propertyOpened: Boolean(row?.property_policy_opened_at),
    platformOpened: Boolean(row?.platform_terms_opened_at),
    accepted: Boolean(row?.accepted_at),
    platformTermsVersion: row?.platform_terms_version ?? GUEST_TERMS_VERSION,
    cancellationPolicyVersion:
      row?.cancellation_policy_version ?? CANCELLATION_POLICY_VERSION,
    error: ready
      ? null
      : "Review and accept the property policies and Find A Place terms before payment.",
  };
}

export function propertyPolicyReference(policySnapshot: unknown) {
  const snapshot =
    policySnapshot && typeof policySnapshot === "object" && !Array.isArray(policySnapshot)
      ? (policySnapshot as Record<string, unknown>)
      : {};
  const raw = snapshot.policy_document;
  const document =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;

  return {
    id: typeof document?.id === "string" ? document.id : null,
    version:
      typeof document?.version === "number"
        ? document.version
        : Number.isFinite(Number(document?.version))
          ? Number(document?.version)
          : null,
    originalName:
      typeof document?.original_name === "string"
        ? document.original_name
        : null,
    storagePath:
      typeof document?.storage_path === "string"
        ? document.storage_path
        : null,
  };
}

export function guestPolicySummary(policySnapshot: unknown) {
  const snapshot =
    policySnapshot && typeof policySnapshot === "object" && !Array.isArray(policySnapshot)
      ? (policySnapshot as Record<string, unknown>)
      : {};
  const rawPolicies = Array.isArray(snapshot.policies) ? snapshot.policies : [];

  return {
    checkIn: typeof snapshot.check_in === "string" ? snapshot.check_in : null,
    checkout: typeof snapshot.checkout === "string" ? snapshot.checkout : null,
    cancellationPolicy:
      typeof snapshot.cancellation_policy === "string"
        ? snapshot.cancellation_policy
        : null,
    customPolicies:
      typeof snapshot.custom_policies === "string"
        ? snapshot.custom_policies
        : null,
    policies: rawPolicies.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      if (!label) return [];
      return [label];
    }),
  };
}
