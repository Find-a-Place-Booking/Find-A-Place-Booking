import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { cleanStatus, formatAdminDate } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/server";

type DashboardSummary = {
  host_profiles?: number;
  organizations?: number;
  properties?: number;
  property_pending_review?: number;
  property_published?: number;
  partner_pending?: number;
  audit_events?: number;
};

export default async function AdminPage() {
  const context = await getAdminContext();
  const supabase = await createClient();
  const canManagePartners = hasAnyAdminRole(context, ["SUPER_ADMIN", "PARTNER_ADMIN"]);

  const [{ data: summaryData }, { data: pendingPartners }, { data: recentAudit }] = await Promise.all([
    supabase.rpc("admin_dashboard_summary"),
    supabase
      .from("organizations")
      .select("id,name,partner_status,commission_tier,updated_at")
      .eq("partner_status", "PARTNER_PENDING")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("audit_logs")
      .select("id,action,entity_type,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const summary = (summaryData ?? {}) as DashboardSummary;

  return (
    <AdminShell active="overview" eyebrow="Platform operations" title="Admin workspace" context={context}>
      <div className="admin-launch-banner">
        <div><span>Connected workspace</span><p><strong>Authentication, organizations, property review and published listing records are live.</strong> This workspace now reads actual host/listing data from Supabase. Booking, payment and calendar-sync systems are not enabled yet.</p></div>
        <span className="status-pill status-inverse">Supabase</span>
      </div>

      <div className="dash-grid metrics admin-metrics admin-real-metrics">
        <Link className="admin-metric-card" href="/admin/hosts" aria-label="Open host profiles"><span>Host profiles</span><strong>{summary.host_profiles ?? 0}</strong><small>Non-admin host identities</small></Link>
        <Link className="admin-metric-card" href="/admin/hosts" aria-label="Open host and organization lookup"><span>Organizations</span><strong>{summary.organizations ?? 0}</strong><small>Host/operator accounts</small></Link>
        <Link className="admin-metric-card" href="/admin/properties" aria-label="Open properties"><span>Properties</span><strong>{summary.properties ?? 0}</strong><small>Active property records</small></Link>
        <Link className="admin-metric-card" href="/admin/properties?status=PENDING_REVIEW" aria-label="Open listings waiting for review"><span>Listing reviews</span><strong>{summary.property_pending_review ?? 0}</strong><small>Waiting for property review</small></Link>
        <Link className="admin-metric-card" href="/admin/properties?status=PUBLISHED" aria-label="Open published listings"><span>Published</span><strong>{summary.property_published ?? 0}</strong><small>Guest-visible listings</small></Link>
        {canManagePartners ? <Link className="admin-metric-card" href="/admin/partners" aria-label="Open partner verification requests"><span>Partner requests</span><strong>{summary.partner_pending ?? 0}</strong><small>Waiting for verification</small></Link> : <div className="admin-metric-card admin-metric-card-static"><span>Partner requests</span><strong>{summary.partner_pending ?? 0}</strong><small>Partner-admin access required</small></div>}
        <Link className="admin-metric-card" href="/admin/audit" aria-label="Open audit log"><span>Audit events</span><strong>{summary.audit_events ?? 0}</strong><small>Append-only history</small></Link>
      </div>

      <section className="panel admin-global-search">
        <div className="panel-head"><div><p className="eyebrow dark">Account lookup</p><h2>Find a host or organization</h2></div><Link href="/admin/hosts">Browse hosts</Link></div>
        <form className="admin-search-shell" action="/admin/hosts" method="get">
          <input name="q" aria-label="Search hosts" placeholder="Owner name, organization, email or phone…" />
          <button className="button button-small" type="submit">Search</button>
        </form>
      </section>

      <div className="dash-two admin-home-grid">
        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow dark">Commission access</p><h2>Partner verification</h2></div>{canManagePartners ? <Link href="/admin/partners">Open queue</Link> : <span className="status-pill status-muted">Role limited</span>}</div>
          {pendingPartners?.length ? (
            <div className="admin-list">
              {pendingPartners.map((organization) => (
                canManagePartners ? <Link className="admin-list-row" href="/admin/partners" key={organization.id}>
                  <span><strong>{organization.name}</strong><small>{cleanStatus(organization.partner_status)} · {cleanStatus(organization.commission_tier)}</small></span>
                  <b>Review</b>
                </Link> : <div className="admin-list-row static" key={organization.id}><span><strong>{organization.name}</strong><small>{cleanStatus(organization.partner_status)} · {cleanStatus(organization.commission_tier)}</small></span></div>
              ))}
            </div>
          ) : <div className="panel-empty"><strong>No partner requests waiting.</strong><span>No partner verification requests are waiting right now.</span></div>}
        </section>

        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow dark">Audit</p><h2>Recent admin activity</h2></div><Link href="/admin/audit">View log</Link></div>
          {recentAudit?.length ? (
            <div className="admin-list compact">
              {recentAudit.map((event) => (
                <div className="admin-list-row static" key={event.id}>
                  <span><strong>{event.action}</strong><small>{event.entity_type} · {formatAdminDate(event.created_at)}</small></span>
                </div>
              ))}
            </div>
          ) : <div className="panel-empty"><strong>No audit events yet.</strong><span>Partner decisions and future privileged changes will build the permanent timeline here.</span></div>}
        </section>
      </div>

      <section className="panel admin-system-boundary">
        <p className="eyebrow dark">System status</p>
        <h2>Operational coverage</h2>
        <div className="admin-capability-grid">
          <div><strong>Available now</strong><span>Admin identity and roles</span><span>Host/profile lookup</span><span>Real property records</span><span>Property review + publication</span><span>Organization partner status</span><span>Partner decisions</span><span>Audit history</span></div>
          <div><strong>Not enabled yet</strong><span>Availability/calendar sync</span><span>Reservations</span><span>Payments & ledger</span><span>Calendar health</span><span>Email/event diagnostics</span></div>
        </div>
      </section>
    </AdminShell>
  );
}
