import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { HostOnboardingWizard } from "@/components/HostOnboardingWizard";
import { IntroMarketingForm } from "@/components/IntroMarketingForm";
import { HostPolicyAcceptance } from "@/components/HostPolicyAcceptance";
import { OnboardingPublicHostProfile } from "@/components/onboarding/OnboardingPublicHostProfile";
import { getHostOnboarding } from "@/lib/host/onboarding";
import { getHostAccountProfile } from "@/lib/host/profile";
import { createClient } from "@/lib/supabase/server";

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
    saved?: string;
    emailPending?: string;
  }>;
}) {
  const [onboarding, profile, params] = await Promise.all([
    getHostOnboarding(),
    getHostAccountProfile(),
    searchParams,
  ]);

  const supabase = await createClient();
  const { data: introPrefs } = await supabase.rpc("fap_host_intro_status", {
    target_organization_id: onboarding.organizationId,
  });
  return (
    <DashboardShell active="Properties" title="Host & property setup" eyebrow="Host setup">
      {params.profileSaved ? <div className="admin-message success">Public host profile saved.</div> : null}
      {params.avatarSaved ? <div className="admin-message success">Public host profile photo updated.</div> : null}
      {params.avatarRemoved ? <div className="admin-message success">Public host profile photo removed.</div> : null}
      {params.profileError ? <div className="admin-message error">{decodeURIComponent(params.profileError)}</div> : null}
      {params.saved ? <div className="admin-message success">Introductory offer preferences saved.</div> : null}
      {params.emailPending ? <div className="admin-message error">Advertising request saved, but email delivery is pending. Please save again to retry.</div> : null}
      <OnboardingPublicHostProfile profile={profile} />
      <HostPolicyAcceptance
        organizationId={onboarding.organizationId}
        accepted={onboarding.policyAccepted}
        acceptedAt={onboarding.policyAcceptedAt}
        versions={onboarding.currentPolicyVersions}
        error={params.policyError || null}
      />
      <HostOnboardingWizard initial={onboarding} />
      <section className="panel">
        <p className="eyebrow dark">Optional after your listing setup</p>
        <h2>Welcome discount for your first three stays</h2>
        <p>Optional: offer guests 25% off lodging on the first three bookings of each eligible property. Guests will see the offer in search results and it will be applied automatically at checkout.</p>
        {introPrefs ? <IntroMarketingForm preferences={introPrefs} returnTo="onboarding" /> : (
          <Link href="/host/marketing" className="button button-small button-quiet">Open marketing settings →</Link>
        )}
      </section>
    </DashboardShell>
  );
}
