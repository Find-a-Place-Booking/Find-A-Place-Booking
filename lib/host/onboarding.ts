import { redirect } from "next/navigation";

import {
  CANCELLATION_POLICY_VERSION,
  HOST_AGREEMENT_VERSION,
  PRIVACY_NOTICE_VERSION,
} from "@/lib/policies/versions";
import { createClient } from "@/lib/supabase/server";

export type HostOnboardingRecord = {
  organizationId: string;
  organizationName: string;
  organizationStatus: string;
  partnerStatus: string;
  commissionTier: string;
  currentStep: number;
  onboardingStatus: string;
  formData: Record<string, string>;
  amenities: string[];
  policies: string[];
  photoNames: string[];
  authorityConfirmed: boolean;
  policyAccepted: boolean;
  policyAcceptedAt: string | null;
  savedAt: string | null;
};

export async function getHostOnboarding(): Promise<HostOnboardingRecord> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const profileId = claimsData?.claims?.sub;

  if (!profileId) redirect("/host/sign-in?next=/host/onboarding");

  const { data: organizationId, error: ensureError } =
    await supabase.rpc("ensure_host_onboarding");

  if (ensureError || !organizationId) {
    throw new Error("Unable to initialize host onboarding.");
  }

  const [
    { data: organization, error: organizationError },
    { data: draft, error: draftError },
  ] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id,name,status,partner_status,commission_tier,primary_contact_name,business_location,contact_email,contact_phone",
      )
      .eq("id", organizationId)
      .maybeSingle(),
    supabase
      .from("host_onboarding_drafts")
      .select(
        "current_step,status,form_data,amenities,policies,photo_names,authority_confirmed,host_policy_accepted_at,host_agreement_version,cancellation_policy_version,privacy_notice_version,updated_at",
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);

  if (organizationError || !organization || draftError || !draft) {
    throw new Error("Unable to load host onboarding.");
  }

  const storedForm =
    draft.form_data &&
    typeof draft.form_data === "object" &&
    !Array.isArray(draft.form_data)
      ? (draft.form_data as Record<string, string>)
      : {};

  const formData: Record<string, string> = {
    ...storedForm,
    hostName: organization.name ?? storedForm.hostName ?? "",
    contactName:
      organization.primary_contact_name ?? storedForm.contactName ?? "",
    phone: organization.contact_phone ?? storedForm.phone ?? "",
    email: organization.contact_email ?? storedForm.email ?? "",
    businessLocation:
      organization.business_location ?? storedForm.businessLocation ?? "",
  };

  const policyAccepted =
    Boolean(draft.host_policy_accepted_at) &&
    draft.host_agreement_version === HOST_AGREEMENT_VERSION &&
    draft.cancellation_policy_version === CANCELLATION_POLICY_VERSION &&
    draft.privacy_notice_version === PRIVACY_NOTICE_VERSION;

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationStatus: organization.status,
    partnerStatus: organization.partner_status,
    commissionTier: organization.commission_tier,
    currentStep: Number(draft.current_step ?? 0),
    onboardingStatus: draft.status,
    formData,
    amenities: Array.isArray(draft.amenities) ? draft.amenities : [],
    policies: Array.isArray(draft.policies) ? draft.policies : [],
    photoNames: Array.isArray(draft.photo_names) ? draft.photo_names : [],
    authorityConfirmed: Boolean(draft.authority_confirmed),
    policyAccepted,
    policyAcceptedAt: draft.host_policy_accepted_at ?? null,
    savedAt: draft.updated_at ?? null,
  };
}
