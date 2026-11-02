import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import {
  getAdminContext,
  hasAnyAdminRole,
} from "@/lib/admin/context";
import { cleanStatus, formatAdminDate } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/server";

type CalendarHealthConnection = {
  id: string;
  unit_id: string;
  provider: string;
  label: string;
  connection_kind: string;
  sync_status: string;
  last_sync_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  is_active: boolean;
  active_block_count: number;
  property_id: string;
  property_name: string;
  property_status: string;
  organization_id: string;
  organization_name: string;
  unit_name: string;
};

type CalendarHealthBundle = {
  connections: CalendarHealthConnection[];
  owner_blocks: number;
  external_blocks: number;
};

function providerLabel(value: string) {
  const labels: Record<string, string> = {
    AIRBNB: "Airbnb",
    VRBO: "Vrbo",
    BOOKING_COM: "Booking.com",
    GOOGLE: "Google Calendar",
    LODGIFY: "Lodgify",
    OWNEREZ: "OwnerRez",
    RESNEXUS: "ResNexus",
    GUESTY: "Guesty",
    HOSTIFY: "Hostify",
    THINKRESERVATIONS: "ThinkReservations",
    OTHER_ICAL: "Other iCal",
  };
  return labels[value] ?? cleanStatus(value);
}

/** A displayed HEALTHY value only describes the last outcome, not freshness. */
function isCalendarSourceStale(connection: CalendarHealthConnection, nowMs: number) {
  if (!connection.is_active) return false;
  if (!connection.last_success_at) return true;
  const last = Date.parse(connection.last_success_at);
  if (!Number.isFinite(last)) return true;
  // Browser-worker sources are normally hourly; iCal and PMS API run every
  // 15 minutes. Include a wide grace period to avoid false positives.
  const staleAfterMinutes = connection.connection_kind === "BROWSER_WORKER" ? 180 : 90;
  return nowMs - last > staleAfterMinutes * 60_000;
}

export default async function AdminCalendarsPage() {
  const context = await getAdminContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_calendar_health_bundle");
  if (error) {
    throw new Error(
      "Unable to load calendar operations. Refresh the page, and contact Find A Place support if the problem continues.",
    );
  }

  const bundle = (data ?? {
    connections: [],
    owner_blocks: 0,
    external_blocks: 0,
  }) as CalendarHealthBundle;
  const connections = bundle.connections ?? [];
  const healthy = connections.filter(
    (connection) => connection.sync_status === "HEALTHY",
  ).length;
  const errors = connections.filter(
    (connection) => connection.sync_status === "ERROR",
  ).length;
  const neverSynced = connections.filter(
    (connection) => connection.sync_status === "NEVER_SYNCED",
  ).length;
  const nowMs = Date.now();
  const staleIds = new Set(
    connections.filter((connection) => isCalendarSourceStale(connection, nowMs))
      .map((connection) => connection.id),
  );
  const staleSources = connections.filter((connection) => staleIds.has(connection.id));
  const canUseTestLab = hasAnyAdminRole(context, [
    "SUPER_ADMIN",
    "OPERATIONS_ADMIN",
  ]);

  return (
    <AdminShell
      active="calendars"
      eyebrow="Integration health"
      title="Calendars"
      context={context}
    >
      <div className="metrics dash-grid">
        <div><span>Active sources</span><strong>{connections.length}</strong><small>{healthy} healthy</small></div>
        <div><span>Overdue sync</span><strong>{staleSources.length}</strong><small>{errors} reported errors · {neverSynced} never synced</small></div>
        <div><span>Imported blocks</span><strong>{bundle.external_blocks ?? 0}</strong><small>Imported external availability</small></div>
        <div><span>Owner blocks</span><strong>{bundle.owner_blocks ?? 0}</strong><small>Manual host blocks</small></div>
      </div>

      {staleSources.length ? (
        <section className="panel" role="status" aria-label="Calendar sync attention needed">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">Sync attention</p>
              <h2>{staleSources.length} connected calendar {staleSources.length === 1 ? "source is" : "sources are"} overdue for a successful refresh</h2>
            </div>
          </div>
          <p className="muted">
            A last-result label of Healthy can become stale when an external
            worker stops running. Browser-worker integrations are flagged after
            3 hours; iCal and PMS-API integrations after 90 minutes. Existing
            blocks stay in place; this warning never changes availability.
          </p>
          <div className="admin-list compact">
            {staleSources.slice(0, 20).map((connection) => (
              <div className="admin-list-row static" key={connection.id}>
                <span>
                  <strong>{connection.property_name} · {providerLabel(connection.provider)}</strong>
                  <small>{connection.unit_name} · Last success: {connection.last_success_at ? formatAdminDate(connection.last_success_at) : "Never"}</small>
                </span>
                <Link href={`/admin/properties/${connection.property_id}`}>Review property →</Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {canUseTestLab ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">Booking calendar safety</p>
              <h2>Check live calendar coverage and ResNexus worker status</h2>
            </div>
            <Link className="button button-small" href="/admin/calendars/attention">
              Review safety checks
            </Link>
          </div>
          <p className="muted">
            Review overdue browser workers, manual-only published listings,
            overlapping paid reservations, and missing reservation calendar blocks.
            These checks cannot edit bookings or calendars.
          </p>
        </section>
      ) : null}

      {canUseTestLab ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">Testing tools</p>
              <h2>Need a fake iCal feed?</h2>
            </div>
            <Link
              className="button button-small"
              href="/admin/calendars/test-lab"
            >
              Open iCal Test Lab
            </Link>
          </div>
          <p className="muted">
            Generate synthetic iCal reservations, change their dates, cancel or
            remove them, and verify that the real calendar sync reconciles the
            changes correctly.
          </p>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow dark">Calendar operations</p><h2>Connected availability sources</h2></div><span className="status-pill status-muted">Read only</span></div>
        <p className="muted">This view exposes source ownership and sync health without transferring private feed URLs or PMS credentials to the Admin screen or allowing silent calendar rewrites.</p>
        {connections.length ? <div className="admin-list compact">{connections.map((connection) => (
          <div className="admin-list-row static" key={connection.id}>
            <span>
              <strong>{connection.label} · {providerLabel(connection.provider)}</strong>
              <small>{connection.organization_name} · {connection.property_name} · {connection.unit_name}</small>
              <small>{connection.active_block_count ?? 0} active imported blocks · Last success: {connection.last_success_at ? formatAdminDate(connection.last_success_at) : "Never"}</small>
              {connection.last_error ? <small>Last error: {connection.last_error}</small> : null}
            </span>
            <span>
              <em className={staleIds.has(connection.id) || connection.sync_status === "ERROR" ? "pending" : ""}>{staleIds.has(connection.id) ? "OVERDUE SYNC" : cleanStatus(connection.sync_status)}</em>
              <Link href={`/admin/properties/${connection.property_id}`}>Open property →</Link>
            </span>
          </div>
        ))}</div> : <div className="panel-empty"><strong>No external availability sources connected yet.</strong><span>Host calendar and PMS integrations will appear here after connections are created.</span></div>}
      </section>
    </AdminShell>
  );
}
