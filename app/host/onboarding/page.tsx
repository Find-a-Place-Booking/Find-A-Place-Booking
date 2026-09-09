import { DashboardShell } from "@/components/DashboardShell";
import { HostOnboardingWizard } from "@/components/HostOnboardingWizard";
import { getHostOnboarding } from "@/lib/host/onboarding";

export default async function OnboardingPage() {
  const onboarding = await getHostOnboarding();

  return (
    <DashboardShell active="Properties" title="Host & property setup" eyebrow="Host setup">
      <HostOnboardingWizard initial={onboarding} />
    </DashboardShell>
  );
}
