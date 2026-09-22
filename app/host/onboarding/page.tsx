import { DashboardShell } from "@/components/DashboardShell";
import { HostOnboardingWizard } from "@/components/HostOnboardingWizard";
import { HostPolicyAcceptance } from "@/components/HostPolicyAcceptance";
import { getHostOnboarding } from "@/lib/host/onboarding";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    policies?: string;
    policyError?: string;
  }>;
}) {
  const [onboarding, params] = await Promise.all([
    getHostOnboarding(),
    searchParams,
  ]);

  return (
    <DashboardShell
      active="Properties"
      title="Host & property setup"
      eyebrow="Host setup"
    >
      <HostPolicyAcceptance
        organizationId={onboarding.organizationId}
        accepted={onboarding.policyAccepted}
        acceptedAt={onboarding.policyAcceptedAt}
        error={params.policyError || null}
      />

      <HostOnboardingWizard initial={onboarding} />
    </DashboardShell>
  );
}
