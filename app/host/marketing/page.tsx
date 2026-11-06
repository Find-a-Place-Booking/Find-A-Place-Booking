import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/DashboardShell";
import { createClient } from "@/lib/supabase/server";
import { saveHostMarketingPreferences } from "./actions";

export const dynamic = "force-dynamic";

type MarketingPreferences = {
  organization_id: string;
  organization_name: string;
  is_partner: boolean;
  commission_tier: string;
  three_discounted_stays_interest: boolean;
  additional_social_advertising_interest: boolean;
  request_notes: string;
};

export default async function HostMarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const [{ data: claims }, params] = await Promise.all([supabase.auth.getClaims(), searchParams]);
  const profileId = claims?.claims?.sub;
  if (!profileId) redirect("/host/sign-in?next=/host/marketing");
  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", profileId)
    .eq("status", "ACTIVE")
    .eq("role", "OWNER")
    .order("created_at", { ascending: true })
    .limit(1).maybeSingle();
  if (!membership || memberError) redirect("/host/onboarding");

  const { data, error } = await supabase.rpc("get_host_marketing_preferences", {
    target_organization_id: membership.organization_id,
  });
  const preferences = data as MarketingPreferences | null;

  return (
    <DashboardShell active="Marketing" title="Marketing & promotions">
      <section className="panel">
        <p className="eyebrow dark">Host marketing preferences</p>
        <h2>Would you like us to help promote your stays?</h2>
        <p className="muted">These are optional expressions of interest. Nothing here changes your nightly rates, creates a promotion or authorizes an advertising charge. We'll follow up before anything goes live.</p>
        {params.saved ? <div className="admin-message success">Saved. The Find A Place team can now see your marketing interests.</div> : null}
        {params.error ? <div className="admin-message error">{params.error}</div> : null}
        {error ? <div className="admin-message error">Marketing preferences unavailable: {error.message}. Please contact support.</div> : null}
        {preferences && !error ? (
          <form className="settings-form" action={saveHostMarketingPreferences}>
            <input type="hidden" name="organization_id" value={preferences.organization_id} />
            <div className="setting-row"><span>Find A Place partner</span><strong>{preferences.is_partner ? "Verified partner" : "Standard host"}</strong></div>
            <p className="muted">Partner status is assigned by the Find A Place team, not self-declared. Your current assigned tier is {preferences.is_partner ? "5% partner" : "7% standard"}.</p>
            <label style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <input type="checkbox" name="three_stays" defaultChecked={preferences.three_discounted_stays_interest} style={{ width: 18, height: 18, marginTop: 4 }} />
              <span><strong>I'm interested in offering three discounted stays.</strong><small style={{ display: "block" }}>We'll discuss which dates and what discount makes sense first. This does not automatically lower your prices.</small></span>
            </label>
            <label style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <input type="checkbox" name="extra_social" defaultChecked={preferences.additional_social_advertising_interest} style={{ width: 18, height: 18, marginTop: 4 }} />
              <span><strong>I'd like to learn about additional social media advertising.</strong><small style={{ display: "block" }}>Optional extra promotion beyond standard marketplace posts. We will discuss the plan and any pricing before starting.</small></span>
            </label>
            <label><span>Anything we should know?</span>
              <textarea name="notes" rows={3} maxLength={1000} defaultValue={preferences.request_notes || ""} placeholder="Possible discount dates, which stays you'd like to feature, advertising goals…" />
            </label>
            <button className="button" type="submit">Save marketing preferences</button>
          </form>
        ) : null}
      </section>
    </DashboardShell>
  );
}
