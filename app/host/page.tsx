import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { createClient } from "@/lib/supabase/server";

export default async function HostDashboard() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const profileId = claimsData?.claims?.sub;

  let organization: { id: string; name: string; partner_status: string; commission_tier: string } | null = null;
  let draft: { current_step: number; status: string; updated_at: string } | null = null;
  let propertyCount = 0;
  let publishedCount = 0;
  let pendingReviewCount = 0;

  if (profileId) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("profile_id", profileId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membership?.organization_id) {
      const [{ data: organizationData }, { data: draftData }, { count }, { count: liveCount }, { count: reviewCount }] = await Promise.all([
        supabase.from("organizations").select("id,name,partner_status,commission_tier").eq("id", membership.organization_id).maybeSingle(),
        supabase.from("host_onboarding_drafts").select("current_step,status,updated_at").eq("organization_id", membership.organization_id).maybeSingle(),
        supabase.from("properties").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).neq("status", "ARCHIVED"),
        supabase.from("properties").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("status", "PUBLISHED"),
        supabase.from("properties").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id).eq("status", "PENDING_REVIEW"),
      ]);
      organization = organizationData;
      draft = draftData;
      propertyCount = count ?? 0;
      publishedCount = liveCount ?? 0;
      pendingReviewCount = reviewCount ?? 0;
    }
  }

  const progress = draft ? Math.round(((Number(draft.current_step ?? 0) + 1) / 11) * 100) : 0;
  const ready = draft?.status === "READY_FOR_PROPERTY";

  return <DashboardShell active="Overview" title="Host dashboard">
    <div className="host-alert"><div><span>{propertyCount ? "✓" : ready ? "✓" : organization ? Math.max(1, Math.ceil(progress / 25)) : "1"}</span><p><strong>{propertyCount ? `${propertyCount} real property ${propertyCount === 1 ? "record is" : "records are"} connected.` : ready ? "Host setup is saved." : organization ? `Continue ${organization.name} setup.` : "Start with your host organization."}</strong>{propertyCount ? " Draft property data is now stored in Supabase; nothing is public/bookable until later approval and booking milestones." : ready ? " Create the first real draft property from the saved setup next." : organization ? ` Your onboarding draft is ${progress}% through the guided setup.` : " Create the host/business profile first, then we will build its property records."}</p></div><Link href={propertyCount || ready ? "/host/properties" : "/host/onboarding"}>{propertyCount ? "Open properties →" : ready ? "Create property →" : organization ? "Continue setup →" : "Start setup →"}</Link></div>

    <div className="dash-grid metrics"><div><span>Booked revenue</span><strong>$0</strong><small>No bookings yet</small></div><div><span>Upcoming stays</span><strong>0</strong><small>No reservations yet</small></div><div><span>Properties</span><strong>{propertyCount}</strong><small>{publishedCount ? `${publishedCount} live` : pendingReviewCount ? `${pendingReviewCount} in review` : propertyCount ? "Draft / not published" : ready ? "Ready to create first property" : "Complete host setup first"}</small></div><div><span>Commission tier</span><strong>{organization?.commission_tier === "PARTNER_5" ? "5%" : "7%"}</strong><small>{organization?.partner_status === "VERIFIED" ? "Verified partner" : organization?.partner_status === "PARTNER_PENDING" ? "Partner review pending" : "Standard / unverified"}</small></div></div>

    <div className="dash-two"><section className="panel"><div className="panel-head"><div><p className="eyebrow dark">Reservations</p><h2>Upcoming stays</h2></div><Link href="/host/reservations">View reservations</Link></div><div className="panel-empty"><strong>No upcoming reservations.</strong><span>Confirmed Find A Place bookings will appear here after the booking engine is built.</span></div></section><section className="panel occupancy-panel"><div className="panel-head"><div><p className="eyebrow dark">Availability</p><h2>Calendar</h2></div><Link href="/host/calendar">Open calendar</Link></div><div className="panel-empty"><strong>No property calendar connected.</strong><span>Property-specific availability begins after the real property record exists.</span></div></section></div>

    <div className="dash-two"><section className="panel"><div className="panel-head"><div><p className="eyebrow dark">Account checklist</p><h2>Get ready for bookings</h2></div><span className={`status-pill ${ready ? "" : "status-muted"}`}>{ready ? "Host setup saved" : organization ? "In progress" : "Not started"}</span></div><div className="setup-list"><div><b>{organization ? "✓" : "1"}</b><span><strong>Host organization</strong><small>{organization ? organization.name : "Add the person or business managing the stays"}</small></span></div><div><b>{ready ? "✓" : "2"}</b><span><strong>Onboarding draft</strong><small>{ready ? "Saved and ready for property creation" : "Amenities, rates, policies and partner claim"}</small></span></div><div><b>{propertyCount ? "✓" : "3"}</b><span><strong>Property listing</strong><small>{propertyCount ? `${propertyCount} real property record${propertyCount === 1 ? "" : "s"} saved` : "Create from the saved onboarding draft"}</small></span></div><div><b>4</b><span><strong>Calendar + payout account</strong><small>Connected only after the property and payment foundations exist</small></span></div></div></section><section className="panel performance"><p className="eyebrow dark">Network reach</p><h2>Discovery data</h2><div className="panel-empty"><strong>Performance begins after launch.</strong><span>Search impressions, property views and booking sources will appear here after listings are published.</span></div></section></div>
  </DashboardShell>;
}
