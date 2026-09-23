import type { SupabaseClient } from "@supabase/supabase-js";

import {
  CANCELLATION_POLICY_VERSION,
  GUEST_TERMS_VERSION,
  HOST_AGREEMENT_VERSION,
  PRIVACY_NOTICE_VERSION,
} from "@/lib/policies/versions";
import { createClient } from "@/lib/supabase/server";

export type CurrentPolicyVersion = {
  version: string;
  effectiveAt: string;
};

export type CurrentPolicyVersions = {
  guestTerms: CurrentPolicyVersion;
  hostAgreement: CurrentPolicyVersion;
  cancellationPolicy: CurrentPolicyVersion;
  privacyNotice: CurrentPolicyVersion;
};

const FALLBACK_EFFECTIVE_AT = "2026-09-19T00:00:00-05:00";

const fallback: CurrentPolicyVersions = {
  guestTerms: { version: GUEST_TERMS_VERSION, effectiveAt: FALLBACK_EFFECTIVE_AT },
  hostAgreement: { version: HOST_AGREEMENT_VERSION, effectiveAt: FALLBACK_EFFECTIVE_AT },
  cancellationPolicy: { version: CANCELLATION_POLICY_VERSION, effectiveAt: FALLBACK_EFFECTIVE_AT },
  privacyNotice: { version: PRIVACY_NOTICE_VERSION, effectiveAt: FALLBACK_EFFECTIVE_AT },
};

export async function getCurrentPolicyVersions(
  suppliedClient?: SupabaseClient,
): Promise<CurrentPolicyVersions> {
  const client = suppliedClient ?? (await createClient());
  const { data, error } = await client
    .from("platform_policy_versions")
    .select("policy_key,version_label,effective_at")
    .in("policy_key", [
      "guest_terms",
      "host_agreement",
      "cancellation_policy",
      "privacy_notice",
    ]);

  if (error) {
    console.error("[current policy versions]", error);
    return fallback;
  }

  const byKey = new Map((data ?? []).map((row) => [row.policy_key as string, row]));
  const current = (key: string, fb: CurrentPolicyVersion): CurrentPolicyVersion => {
    const row = byKey.get(key);
    return {
      version: typeof row?.version_label === "string" && row.version_label ? row.version_label : fb.version,
      effectiveAt: typeof row?.effective_at === "string" && row.effective_at ? row.effective_at : fb.effectiveAt,
    };
  };

  return {
    guestTerms: current("guest_terms", fallback.guestTerms),
    hostAgreement: current("host_agreement", fallback.hostAgreement),
    cancellationPolicy: current("cancellation_policy", fallback.cancellationPolicy),
    privacyNotice: current("privacy_notice", fallback.privacyNotice),
  };
}
