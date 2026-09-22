"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CANCELLATION_POLICY_VERSION,
  HOST_AGREEMENT_VERSION,
  PRIVACY_NOTICE_VERSION,
} from "@/lib/policies/versions";
import { createClient } from "@/lib/supabase/server";

export async function acceptHostPolicies(formData: FormData) {
  const organizationId = String(
    formData.get("organizationId") || "",
  ).trim();
  const accepted = formData.get("acceptPolicies") === "yes";

  if (!organizationId) {
    redirect(
      "/host/onboarding?policyError=Host+organization+is+missing.",
    );
  }

  if (!accepted) {
    redirect(
      "/host/onboarding?policyError=You+must+accept+the+host+agreement+and+policies+to+continue.",
    );
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    redirect("/host/sign-in?next=/host/onboarding");
  }

  const { error } = await supabase.rpc("record_host_policy_acceptance", {
    target_organization_id: organizationId,
    accepted_host_agreement_version: HOST_AGREEMENT_VERSION,
    accepted_cancellation_policy_version: CANCELLATION_POLICY_VERSION,
    accepted_privacy_notice_version: PRIVACY_NOTICE_VERSION,
  });

  if (error) {
    console.error("[acceptHostPolicies]", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    redirect(
      "/host/onboarding?policyError=We+could+not+record+your+policy+acceptance.+Please+try+again.",
    );
  }

  revalidatePath("/host/onboarding");
  revalidatePath("/admin/hosts");

  redirect("/host/onboarding?policies=accepted");
}
