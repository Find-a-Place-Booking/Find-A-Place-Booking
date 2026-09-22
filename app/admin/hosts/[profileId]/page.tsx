import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext } from "@/lib/admin/context";
import { cleanStatus, formatAdminDate } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/server";

type Membership = {
  organization_id: string;
  role: string;
  status: string;
  created_at: string;
};

type Organization = {
  id: string;
  name: string;
  primary_contact_name: string | null;
  business_location: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  partner_status: string;
  commission_tier: string;
  commission_effective_from: string;
  partner_verified_at: string | null;
  partner_verification_note: string | null;
  onboarding_ready_at: string | null;
};

type OnboardingDraft = {
  organization_id: string;
  current_step: number;
  status: string;
  amenities: string[];
  policies: string[];
  authority_confirmed: boolean;
  updated_at: string;
};

type PartnerClaim = {
  organization_id: string;
  business_name: string | null;
  owner_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  submitted_at: string;
  updated_at: string;
};

type PropertyRow = { id: string; organization_id: string; name: string; status: string; public_area: string | null; updated_at: string; };

type AuditEvent = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  created_at: string;
};

export default async function AdminHostDetailPage({ params }: { params: Promise<{ profileId: string }> }) {
  const context = await getAdminContext();
  const { profileId } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: membershipData }] = await Promise.all([
    supabase.from("profiles").select("id,email,full_name,phone,created_at,updated_at").eq("id", profileId).maybeSingle(),
    supabase.from("organization_members").select("organization_id,role,status,created_at").eq("profile_id", profileId),
  ]);

  if (!profile) notFound();

  const memberships = (membershipData ?? []) as Membership[];
  const organizationIds = memberships.map((membership) => membership.organization_id);
  let organizations: Organization[] = [];
  let onboardingDrafts: OnboardingDraft[] = [];
  let partnerClaims: PartnerClaim[] = [];
  let properties: PropertyRow[] = [];

  if (organizationIds.length) {
    const [{ data: organizationData }, { data: onboardingData }, { data: claimData }, { data: propertyData }] = await Promise.all([
      supabase
        .from("organizations")
        .select("id,name,primary_contact_name,business_location,contact_email,contact_phone,status,partner_status,commission_tier,commission_effective_from,partner_verified_at,partner_verification_note,onboarding_ready_at")
        .in("id", organizationIds),
      supabase
        .from("host_onboarding_drafts")
        .select("organization_id,current_step,status,amenities,policies,authority_confirmed,updated_at")
        .in("organization_id", organizationIds),
      supabase
        .from("partner_claims")
        .select("organization_id,business_name,owner_name,email,phone,status,submitted_at,updated_at")
        .in("organization_id", organizationIds),
      supabase
        .from("properties")
        .select("id,organization_id,name,status,public_area,updated_at")
        .in("organization_id", organizationIds)
        .neq("status", "ARCHIVED")
        .order("updated_at", { ascending: false }),
    ]);
    organizations = (organizationData ?? []) as Organization[];
    onboardingDrafts = (onboardingData ?? []) as OnboardingDraft[];
    partnerClaims = (claimData ?? []) as PartnerClaim[];
    properties = (propertyData ?? []) as PropertyRow[];
  }

  const organizationMap = new Map(organizations.map((organization) => [organization.id, organization]));
  const onboardingMap = new Map(onboardingDrafts.map((draft) => [draft.organization_id, draft]));
  const claimMap = new Map(partnerClaims.map((claim) => [claim.organization_id, claim]));
  const auditQueries = [
    supabase.from("audit_logs").select("id,action,entity_type,entity_id,reason,created_at").eq("entity_id", profileId).order("created_at", { ascending: false }).limit(20),
  ];
  if (organizationIds.length) {
    auditQueries.push(supabase.from("audit_logs").select("id,action,entity_type,entity_id,reason,created_at").in("entity_id", organizationIds).order("created_at", { ascending: false }).limit(20));
  }
  const auditResults = await Promise.all(auditQueries);
  const auditEvents = auditResults.flatMap((result) => (result.data ?? []) as AuditEvent[])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);

  return (
    <AdminShell active="hosts" eyebrow="Host account" title={profile.full_name || profile.email || "Host profile"} context={context}>
      <div className="admin-detail-back"><Link href="/admin/hosts">← Back to host lookup</Link></div>

      <div className="admin-detail-grid">
        <section className="panel">
          <p className="eyebrow dark">Identity</p><h2>Account details</h2>
          <dl className="admin-detail-list">
            <div><dt>Name</dt><dd>{profile.full_name || "Not provided"}</dd></div>
            <div><dt>Email</dt><dd>{profile.email || "Not provided"}</dd></div>
            <div><dt>Phone</dt><dd>{profile.phone || "Not provided"}</dd></div>
            <div><dt>Created</dt><dd>{formatAdminDate(profile.created_at)}</dd></div>
            <div><dt>Updated</dt><dd>{formatAdminDate(profile.updated_at)}</dd></div>
            <div><dt>Profile ID</dt><dd><code>{profile.id}</code></dd></div>
          </dl>
        </section>

        <section className="panel">
          <p className="eyebrow dark">Operations</p><h2>Current account state</h2>
          <div className="admin-state-stack">
            <div><span>Organizations</span><strong>{memberships.length}</strong></div>
            <div><span>Onboarding</span><strong>{onboardingDrafts.some((draft) => draft.status === "READY_FOR_PROPERTY") ? "Ready for property" : onboardingDrafts.length ? "In progress" : "Not started"}</strong></div>
            <div><span>Properties</span><strong>{properties.length}</strong></div>
            <div><span>Bookings / payments</span><strong><Link href="/admin/reservations">Open reservations</Link></strong></div>
          </div>
          <p className="muted">Open reservations for booking and payment details. Property review and publication history appears below.</p>
        </section>
      </div>

      <section className="panel admin-organization-panel">
        <div className="panel-head"><div><p className="eyebrow dark">Organizations</p><h2>Host/operator membership</h2></div><span className="status-pill status-muted">{memberships.length}</span></div>
        {memberships.length ? (
          <div className="admin-organization-list">
            {memberships.map((membership) => {
              const organization = organizationMap.get(membership.organization_id);
              const onboarding = onboardingMap.get(membership.organization_id);
              const claim = claimMap.get(membership.organization_id);
              const progress = onboarding ? Math.round(((Number(onboarding.current_step ?? 0) + 1) / 11) * 100) : 0;
              return (
                <details className="admin-organization-card" key={membership.organization_id}>
                  <summary>
                    <span><strong>{organization?.name || "Unknown organization"}</strong><small>{cleanStatus(membership.role)} · {cleanStatus(membership.status)}</small></span>
                    <span><b>{organization ? cleanStatus(organization.commission_tier) : "—"}</b><small>{organization ? cleanStatus(organization.partner_status) : "—"}</small></span>
                  </summary>
                  {organization ? <div className="admin-organization-details admin-organization-details-wide">
                    <div><small>Organization status</small><strong>{cleanStatus(organization.status)}</strong></div>
                    <div><small>Primary contact</small><strong>{organization.primary_contact_name || "Not set"}</strong></div>
                    <div><small>Business location</small><strong>{organization.business_location || "Not set"}</strong></div>
                    <div><small>Contact email</small><strong>{organization.contact_email || "Not set"}</strong></div>
                    <div><small>Contact phone</small><strong>{organization.contact_phone || "Not set"}</strong></div>
                    <div><small>Onboarding progress</small><strong>{onboarding ? `${progress}% · ${cleanStatus(onboarding.status)}` : "Not started"}</strong></div>
                    <div><small>Onboarding saved</small><strong>{onboarding ? formatAdminDate(onboarding.updated_at) : "—"}</strong></div>
                    <div><small>Amenities / policies</small><strong>{onboarding ? `${onboarding.amenities?.length ?? 0} / ${onboarding.policies?.length ?? 0}` : "—"}</strong></div>
                    <div><small>Authority confirmed</small><strong>{onboarding?.authority_confirmed ? "Yes" : "No"}</strong></div>
                    <div><small>Commission effective</small><strong>{formatAdminDate(organization.commission_effective_from)}</strong></div>
                    <div><small>Partner verified</small><strong>{formatAdminDate(organization.partner_verified_at)}</strong></div>
                    <div><small>Verification note</small><strong>{organization.partner_verification_note || "None"}</strong></div>
                    {claim ? <>
                      <div><small>Claim business/property</small><strong>{claim.business_name || "Not provided"}</strong></div>
                      <div><small>Claim owner</small><strong>{claim.owner_name || "Not provided"}</strong></div>
                      <div><small>Claim email / phone</small><strong>{claim.email || claim.phone || "Not provided"}</strong></div>
                      <div><small>Claim record</small><strong>{cleanStatus(claim.status)} · {formatAdminDate(claim.submitted_at)}</strong></div>
                    </> : null}
                  </div> : null}
                </details>
              );
            })}
          </div>
        ) : <div className="panel-empty"><strong>No host organization yet.</strong><span>The signed-in host creates the first real organization when they begin `/host/onboarding`.</span></div>}
      </section>


      <section className="panel admin-organization-panel">
        <div className="panel-head"><div><p className="eyebrow dark">Properties</p><h2>Real listing records</h2></div><Link href="/admin/properties">All properties</Link></div>
        {properties.length ? <div className="admin-list">{properties.map((property) => <Link className="admin-list-row" href={`/admin/properties/${property.id}`} key={property.id}><span><strong>{property.name}</strong><small>{property.public_area || "Area not set"} · {cleanStatus(property.status)}</small></span><b>Open →</b></Link>)}</div> : <div className="panel-empty"><strong>No property records yet.</strong><span>Once the host converts onboarding into a real draft property, it will appear here.</span></div>}
      </section>

      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow dark">Traceability</p><h2>Related audit activity</h2></div><Link href="/admin/audit">Full audit log</Link></div>
        {auditEvents.length ? <div className="admin-audit-list">{auditEvents.map((event) => <div className="admin-audit-row" key={event.id}><span><strong>{event.action}</strong><small>{event.entity_type} · {formatAdminDate(event.created_at)}</small></span><p>{event.reason || "No note recorded."}</p></div>)}</div> : <div className="panel-empty"><strong>No related audit activity.</strong><span>Organization creation, partner claims and privileged changes tied to this host will appear here.</span></div>}
      </section>
    </AdminShell>
  );
}
