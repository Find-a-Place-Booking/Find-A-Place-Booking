import { DashboardShell } from "@/components/DashboardShell";
import { HostOnboardingWizard } from "@/components/HostOnboardingWizard";
import { HostPolicyAcceptance } from "@/components/HostPolicyAcceptance";
import { OnboardingPublicHostProfile } from "@/components/onboarding/OnboardingPublicHostProfile";
import { getHostOnboarding } from "@/lib/host/onboarding";
import { getHostAccountProfile } from "@/lib/host/profile";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    policies?: string;
    policyError?: string;
    profileSaved?: string;
    profileError?: string;
    avatarSaved?: string;
    avatarRemoved?: string;
  }>;
}) {
  const [onboarding, profile, params] = await Promise.all([
    getHostOnboarding(),
    getHostAccountProfile(),
    searchParams,
  ]);

  return (
    <DashboardShell
      active="Properties"
      title="Host & property setup"
      eyebrow="Host setup"
    >
      {params.profileSaved ? (
        <div className="admin-message success">
          Public host profile saved.
        </div>
      ) : null}
      {params.avatarSaved ? (
        <div className="admin-message success">
          Public host profile photo updated.
        </div>
      ) : null}
      {params.avatarRemoved ? (
        <div className="admin-message success">
          Public host profile photo removed.
        </div>
      ) : null}
      {params.profileError ? (
        <div className="admin-message error">
          {decodeURIComponent(params.profileError)}
        </div>
      ) : null}

      <OnboardingPublicHostProfile profile={profile} />

      <HostPolicyAcceptance
        organizationId={onboarding.organizationId}
        accepted={onboarding.policyAccepted}
        acceptedAt={onboarding.policyAcceptedAt}
        versions={onboarding.currentPolicyVersions}
        error={params.policyError || null}
      />

      <HostOnboardingWizard initial={onboarding} />
    </DashboardShell>
  );
}
