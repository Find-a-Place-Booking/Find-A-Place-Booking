import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { cleanStatus, formatAdminDate } from "@/lib/admin/format";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
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

type RecentAuditRow = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function metadataEnvironment(metadata: Record<string, unknown> | null) {
  const raw =
    metadata?.payment_environment ??
    metadata?.environment ??
    metadata?.stripe_environment;

  return raw === "LIVE" || raw === "TEST" ? raw : null;
}

export default async function AdminPage() {
  const context = await getAdminContext();
  const supabase = await createClient();
  const environment = stripeEnvironment();
  const canManagePartners = hasAnyAdminRole(context, [
    "SUPER_ADMIN",
    "PARTNER_ADMIN",
  ]);

  const [
    { data: summaryData },
    { data: pendingPartners },
    { data: recentAuditData },
    { count: reservationCount },
    { count: confirmedCount },
  ] = await Promise.all([
    supabase.rpc("admin_dashboard_summary"),
    supabase
      .from("organizations")
      .select("id,name,partner_status,commission_tier,updated_at")
      .eq("partner_status", "PARTNER_PENDING")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("audit_logs")
      .select("id,action,entity_type,entity_id,reason,metadata,created_at")
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("payment_environment", environment),
    supabase
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("payment_environment", environment)
      .eq("status", "CONFIRMED"),
  ]);

  const summary = (summaryData ?? {}) as DashboardSummary;
  const recentAuditRows = (recentAuditData ?? []) as RecentAuditRow[];

  const reservationIds = [
    ...new Set(
      recentAuditRows
        .filter(
          (event) =>
            event.entity_type === "reservation" && Boolean(event.entity_id),
        )
        .map((event) => event.entity_id as string),
    ),
  ];
  const paymentAccountIds = [
    ...new Set(
      recentAuditRows
        .filter(
          (event) =>
            event.entity_type === "payment_account" && Boolean(event.entity_id),
        )
        .map((event) => event.entity_id as string),
    ),
  ];

  const [reservationEnvironmentResult, paymentAccountEnvironmentResult] =
    await Promise.all([
      reservationIds.length
        ? supabase
            .from("reservations")
            .select("id,payment_environment")
            .in("id", reservationIds)
        : Promise.resolve({ data: [] }),
      paymentAccountIds.length
        ? supabase
            .from("payment_accounts")
            .select("id,environment")
            .in("id", paymentAccountIds)
        : Promise.resolve({ data: [] }),
    ]);

  const reservationEnvironment = new Map(
    (reservationEnvironmentResult.data ?? []).map((row) => [
      row.id as string,
      row.payment_environment as string,
    ]),
  );
  const paymentAccountEnvironment = new Map(
    (paymentAccountEnvironmentResult.data ?? []).map((row) => [
      row.id as string,
      row.environment as string,
    ]),
  );

  const recentAudit = recentAuditRows
    .filter((event) => {
      const explicitEnvironment = metadataEnvironment(event.metadata);
      if (explicitEnvironment) return explicitEnvironment === environment;

      if (event.entity_type === "reservation" && event.entity_id) {
        return reservationEnvironment.get(event.entity_id) === environment;
      }
      if (event.entity_type === "payment_account" && event.entity_id) {
        return paymentAccountEnvironment.get(event.entity_id) === environment;
      }

      return true;
    })
    .slice(0, 6);

  return (
    <AdminShell
      active="overview"
      eyebrow="Platform operations"
      title="Admin workspace"
      context={context}
    >
      <div className="admin-launch-banner">
        <div>
          <span>{environment} operations overview</span>
          <p>
            <strong>
              Booking and payment records on this dashboard are isolated to the
              active {environment} Stripe environment.
            </strong>{" "}
            Host, property and normal admin records remain shared platform data.
          </p>
        </div>
        <span className="status-pill status-inverse">{environment}</span>
      </div>

      <div className="dash-grid metrics admin-metrics admin-real-metrics">
        <Link className="admin-metric-card" href="/admin/hosts">
          <span>Host profiles</span>
          <strong>{summary.host_profiles ?? 0}</strong>
          <small>Host identities</small>
        </Link>
        <Link className="admin-metric-card" href="/admin/properties">
          <span>Properties</span>
          <strong>{summary.properties ?? 0}</strong>
          <small>Active property records</small>
        </Link>
        <Link className="admin-metric-card" href="/admin/reservations">
          <span>{environment} reservations</span>
          <strong>{reservationCount ?? 0}</strong>
          <small>{confirmedCount ?? 0} confirmed</small>
        </Link>
        <Link
          className="admin-metric-card"
          href="/admin/properties?status=PENDING_REVIEW"
        >
          <span>Listing reviews</span>
          <strong>{summary.property_pending_review ?? 0}</strong>
          <small>Waiting for review</small>
        </Link>
        {canManagePartners ? (
          <Link className="admin-metric-card" href="/admin/partners">
            <span>Partner requests</span>
            <strong>{summary.partner_pending ?? 0}</strong>
            <small>Waiting for verification</small>
          </Link>
        ) : (
          <div className="admin-metric-card admin-metric-card-static">
            <span>Partner requests</span>
            <strong>{summary.partner_pending ?? 0}</strong>
            <small>Partner-admin access required</small>
          </div>
        )}
        <Link className="admin-metric-card" href="/admin/content">
          <span>Site content</span>
          <strong>Edit</strong>
          <small>Managed public copy and policies</small>
        </Link>
      </div>

      <section className="panel admin-global-search">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Support lookup</p>
            <h2>Find a host, property or booking.</h2>
          </div>
        </div>
        <div className="dash-two">
          <form className="admin-search-shell" action="/admin/hosts" method="get">
            <input name="q" aria-label="Search hosts" placeholder="Host, organization, email or phone…" />
            <button className="button button-small" type="submit">Search hosts</button>
          </form>
          <form className="admin-search-shell" action="/admin/reservations" method="get">
            <input name="q" aria-label="Search reservations" placeholder={`Search ${environment} bookings…`} />
            <button className="button button-small" type="submit">Search bookings</button>
          </form>
        </div>
      </section>

      <div className="dash-two admin-home-grid">
        <section className="panel">
          <div className="panel-head">
            <div><p className="eyebrow dark">Commission access</p><h2>Partner verification</h2></div>
            {canManagePartners ? <Link href="/admin/partners">Open queue</Link> : <span className="status-pill status-muted">Role limited</span>}
          </div>
          {pendingPartners?.length ? (
            <div className="admin-list">
              {pendingPartners.map((organization) =>
                canManagePartners ? (
                  <Link className="admin-list-row" href="/admin/partners" key={organization.id}>
                    <span>
                      <strong>{organization.name}</strong>
                      <small>{cleanStatus(organization.partner_status)} · {cleanStatus(organization.commission_tier)}</small>
                    </span>
                    <b>Review</b>
                  </Link>
                ) : (
                  <div className="admin-list-row static" key={organization.id}>
                    <span><strong>{organization.name}</strong></span>
                  </div>
                ),
              )}
            </div>
          ) : <div className="panel-empty"><strong>No partner requests waiting.</strong></div>}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div><p className="eyebrow dark">Activity</p><h2>Recent admin activity</h2></div>
            <Link href="/admin/audit">View log</Link>
          </div>
          {recentAudit.length ? (
            <div className="admin-list compact">
              {recentAudit.map((event) => (
                <div className="admin-list-row static" key={event.id}>
                  <span>
                    <strong>{event.action}</strong>
                    <small>{event.entity_type} · {formatAdminDate(event.created_at)}</small>
                  </span>
                </div>
              ))}
            </div>
          ) : <div className="panel-empty"><strong>No activity for this environment yet.</strong></div>}
        </section>
      </div>
    </AdminShell>
  );
}
