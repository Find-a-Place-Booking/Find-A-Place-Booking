import { DashboardShell } from "@/components/DashboardShell";
import { HostOnboardingWizard } from "@/components/HostOnboardingWizard";

export default function OnboardingPage(){
  return <DashboardShell active="Properties" title="List a property" eyebrow="Host setup"><HostOnboardingWizard /></DashboardShell>;
}
