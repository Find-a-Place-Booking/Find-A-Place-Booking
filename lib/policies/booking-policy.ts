import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentPolicyVersions } from "@/lib/policies/current";
import { rentalSignatureEnabled } from "@/lib/policies/rental-signature-toggle";

export type ReservationPolicyAcceptance = {
  reservation_id: string;
  platform_terms_version: string;
  cancellation_policy_version: string;
  property_policy_opened_at: string | null;
  platform_terms_opened_at: string | null;
  accepted_at: string | null;
  typed_signature_name: string | null;
  typed_signature_at: string | null;
  typed_signature_document_id: string | null;
  typed_signature_document_version: number | null;
  electronic_signature_consent: boolean;
};

export async function reservationPolicyReadiness(admin: SupabaseClient, reservationId: string) {
  const [{ data, error }, { data: reservation, error: reservationError }, currentVersions] = await Promise.all([
    admin.from("reservation_policy_acceptances")
      .select("reservation_id,platform_terms_version,cancellation_policy_version,property_policy_opened_at,platform_terms_opened_at,accepted_at" +
        (rentalSignatureEnabled() ? ",typed_signature_name,typed_signature_at,typed_signature_document_id,typed_signature_document_version,electronic_signature_consent" : ""))
      .eq("reservation_id", reservationId).maybeSingle(),
    admin.from("reservations").select("status,policy_snapshot").eq("id", reservationId).maybeSingle(),
    getCurrentPolicyVersions(admin),
  ]);
  if (error || reservationError) throw new Error("Unable to load current booking agreement state.");
  const row = (data ?? null) as ReservationPolicyAcceptance | null;
  const reference = propertyPolicyReference(reservation?.policy_snapshot);
  // Preserve completed bookings. Only pending checkout with an attached PDF
  // requires a new, document-version-specific electronic signature.
  const signatureRequired = Boolean(rentalSignatureEnabled() && reference.id && reservation?.status !== "CONFIRMED");
  const signatureComplete = !signatureRequired || Boolean(
    row?.electronic_signature_consent && row.typed_signature_at && row.typed_signature_name?.trim() &&
    row.typed_signature_document_id === reference.id &&
    row.typed_signature_document_version === reference.version,
  );
  const versionsAccepted = row?.platform_terms_version === currentVersions.guestTerms.version &&
    row?.cancellation_policy_version === currentVersions.cancellationPolicy.version;
  const ready = Boolean(versionsAccepted && row?.property_policy_opened_at && row?.platform_terms_opened_at && row?.accepted_at && signatureComplete);
  return {
    ready,
    propertyOpened: Boolean(row?.property_policy_opened_at),
    platformOpened: Boolean(row?.platform_terms_opened_at),
    accepted: Boolean(row?.accepted_at) && signatureComplete,
    signatureRequired,
    signatureComplete,
    platformTermsVersion: row?.platform_terms_version ?? currentVersions.guestTerms.version,
    cancellationPolicyVersion: row?.cancellation_policy_version ?? currentVersions.cancellationPolicy.version,
    error: ready ? null : signatureRequired && !signatureComplete
      ? "Review the rental policy PDF and sign electronically before paying."
      : "Review and accept the property policies and Find A Place terms before payment.",
  };
}

export function propertyPolicyReference(policySnapshot: unknown) {
  const snapshot = policySnapshot && typeof policySnapshot === "object" && !Array.isArray(policySnapshot)
    ? policySnapshot as Record<string, unknown> : {};
  const raw = snapshot.policy_document;
  const document = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  return {
    id: typeof document?.id === "string" ? document.id : null,
    version: typeof document?.version === "number" ? document.version : Number.isFinite(Number(document?.version)) ? Number(document?.version) : null,
    originalName: typeof document?.original_name === "string" ? document.original_name : null,
    storagePath: typeof document?.storage_path === "string" ? document.storage_path : null,
  };
}

export function guestPolicySummary(policySnapshot: unknown) {
  const snapshot = policySnapshot && typeof policySnapshot === "object" && !Array.isArray(policySnapshot)
    ? policySnapshot as Record<string, unknown> : {};
  const rawPolicies = Array.isArray(snapshot.policies) ? snapshot.policies : [];
  return {
    checkIn: typeof snapshot.check_in === "string" ? snapshot.check_in : null,
    checkout: typeof snapshot.checkout === "string" ? snapshot.checkout : null,
    cancellationPolicy: typeof snapshot.cancellation_policy === "string" ? snapshot.cancellation_policy : null,
    customPolicies: typeof snapshot.custom_policies === "string" ? snapshot.custom_policies : null,
    policies: rawPolicies.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const label = (item as Record<string, unknown>).label;
      return typeof label === "string" && label.trim() ? [label.trim()] : [];
    }),
  };
}
