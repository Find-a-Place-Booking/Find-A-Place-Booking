import { createClient } from "@/lib/supabase/server";

export type HostOnboardingFeedbackPrompt = {
  propertyId: string;
  propertyName: string;
};

export async function getHostOnboardingFeedbackPrompt(): Promise<
  HostOnboardingFeedbackPrompt | null
> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const profileId = claimsData?.claims?.sub;

  if (!profileId) return null;

  const { data: existingFeedback } = await supabase
    .from("host_onboarding_feedback")
    .select("id")
    .eq("submitted_by", profileId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingFeedback?.id) return null;

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", profileId)
    .eq("status", "ACTIVE");

  const organizationIds = [
    ...new Set(
      (memberships ?? []).map(
        (membership) => membership.organization_id as string,
      ),
    ),
  ];

  if (!organizationIds.length) return null;

  const { data: properties } = await supabase
    .from("properties")
    .select("id,name,source_onboarding_draft_id,created_at,status")
    .in("organization_id", organizationIds)
    .neq("status", "ARCHIVED")
    .order("created_at", { ascending: true });

  const candidates = properties ?? [];
  if (!candidates.length) return null;

  const property =
    candidates.find((candidate) => candidate.source_onboarding_draft_id) ??
    candidates[0];

  return {
    propertyId: property.id as string,
    propertyName: (property.name as string) || "your first property",
  };
}
