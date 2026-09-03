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
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  partner_status: string;
  commission_tier: string;
  commission_effective_from: string;
  partner_verified_at: string | null;
  partner_verification_note: string | null;
};

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
  if (organizationIds.length) {
    const { data } = await supabase
      .from("organizations")
      .select("id,name,contact_email,contact_phone,status,partner_status,commission_tier,commission_effective_from,partner_verified_at,partner_verification_note")
      .in("id", organizationIds);
    organizations = (data ?? []) as Organization[];
  }

  const organizationMap = new Map(organizations.map((organization) => [organization.id, organization]));
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
            <div><span>Properties</span><strong>Not connected</strong></div>
            <div><span>Bookings</span><strong>Not connected</strong></div>
            <div><span>Payments</span><strong>Not connected</strong></div>
          </div>
          <p className="muted">The account page is deliberately useful now without pretending later systems exist. Future milestones will add linked property, reservation, payment, notification and issue history here.</p>
        </section>
      </div>

      <section className="panel admin-organization-panel">
        <div className="panel-head"><div><p className="eyebrow dark">Organizations</p><h2>Host/operator membership</h2></div><span className="status-pill status-muted">{memberships.length}</span></div>
        {memberships.length ? (
          <div className="admin-organization-list">
            {memberships.map((membership) => {
              const organization = organizationMap.get(membership.organization_id);
              return (
                <details className="admin-organization-card" key={membership.organization_id}>
                  <summary>
                    <span><strong>{organization?.name || "Unknown organization"}</strong><small>{cleanStatus(membership.role)} · {cleanStatus(membership.status)}</small></span>
                    <span><b>{organization ? cleanStatus(organization.commission_tier) : "—"}</b><small>{organization ? cleanStatus(organization.partner_status) : "—"}</small></span>
                  </summary>
                  {organization ? <div className="admin-organization-details">
                    <div><small>Status</small><strong>{cleanStatus(organization.status)}</strong></div>
                    <div><small>Contact email</small><strong>{organization.contact_email || "Not set"}</strong></div>
                    <div><small>Contact phone</small><strong>{organization.contact_phone || "Not set"}</strong></div>
                    <div><small>Commission effective</small><strong>{formatAdminDate(organization.commission_effective_from)}</strong></div>
                    <div><small>Partner verified</small><strong>{formatAdminDate(organization.partner_verified_at)}</strong></div>
                    <div><small>Verification note</small><strong>{organization.partner_verification_note || "None"}</strong></div>
                  </div> : null}
                </details>
              );
            })}
          </div>
        ) : <div className="panel-empty"><strong>No host organization yet.</strong><span>This is expected for Step 4 test accounts. Step 6 will create and persist host organizations through onboarding.</span></div>}
      </section>

      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow dark">Traceability</p><h2>Related audit activity</h2></div><Link href="/admin/audit">Full audit log</Link></div>
        {auditEvents.length ? <div className="admin-audit-list">{auditEvents.map((event) => <div className="admin-audit-row" key={event.id}><span><strong>{event.action}</strong><small>{event.entity_type} · {formatAdminDate(event.created_at)}</small></span><p>{event.reason || "No note recorded."}</p></div>)}</div> : <div className="panel-empty"><strong>No related audit activity.</strong><span>Privileged changes tied to this host or their organization will appear here.</span></div>}
      </section>
    </AdminShell>
  );
}
