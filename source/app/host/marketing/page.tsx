import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/DashboardShell";
import { IntroMarketingForm } from "@/components/IntroMarketingForm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type IntroStatus = {
  organization_id: string;
  organization_name: string;
  is_partner: boolean;
  commission_tier: string;
  intro_enabled: boolean;
  advertising_requested: boolean;
  contact_email: string;
  notes: string;
  participating_properties: number;
};

export default async function HostMarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; emailPending?: string }>;
}) {
  const supabase = await createClient();
  const [{ data: claims }, params] = await Promise.all([supabase.auth.getClaims(), searchParams]);
  const profileId = claims?.claims?.sub;
  if (!profileId) redirect("/host/sign-in?next=/host/marketing");
  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id",profileId)
    .eq("status","ACTIVE")
    .eq("role","OWNER")
    .order("created_at",{ascending:true})
    .limit(1).maybeSingle();
  if (!membership || memberError) redirect("/host/onboarding");

  const { data, error } = await supabase.rpc("fap_host_intro_status", {
    target_organization_id: membership.organization_id,
  });
  const prefs = data as IntroStatus|null;

  return (
    <DashboardShell active="Marketing" title="Marketing & promotions">
      <section className="panel">
        <p className="eyebrow dark">Optional host promotion</p>
        <h2>25% off the first three stays</h2>
        <p className="muted">New Find A Place hosts can choose to offer guests 25% off lodging for the first three eligible reservations on each participating listing. The discount is funded by the host, and cleaning fees and taxes are not discounted.</p>
        <p className="muted">Participating published properties display a special-offer label in search results. The offer automatically stops when its three uses are gone. Existing bookings count toward a listing&apos;s first three stays. No paid advertising is required.</p>
        {params.saved ? <div className="admin-message success">Marketing preferences saved.</div> : null}
        {params.emailPending ? <div className="admin-message error">Your advertising request was saved, but the notification email could not be delivered yet. Save again to retry, or contact our team.</div> : null}
        {params.error ? <div className="admin-message error">{params.error}</div> : null}
        {error ? <div className="admin-message error">Marketing settings unavailable: {error.message}</div> : null}
        {prefs && !error ? (
          <>
            <div className="setting-row"><span>Find A Place partner</span><strong>{prefs.is_partner ? "Verified partner" : "Standard host"}</strong></div>
            <p className="muted">Partner status is assigned by Find A Place. Your current tier is {prefs.is_partner ? "5% partner" : "7% standard"}.</p>
            <IntroMarketingForm preferences={prefs} />
          </>
        ) : null}
      </section>
    </DashboardShell>
  );
}
