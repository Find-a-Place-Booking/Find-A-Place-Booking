import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext } from "@/lib/admin/context";
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
    OTHER_ICAL: "Other iCal",
  };
  return labels[value] ?? cleanStatus(value);
}

export default async function AdminCalendarsPage() {
  const context = await getAdminContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_calendar_health_bundle");
  if (error) throw new Error("Unable to load calendar operations. Refresh the page, and contact Find A Place support if the problem continues.");

  const bundle = (data ?? { connections: [], owner_blocks: 0, external_blocks: 0 }) as CalendarHealthBundle;
  const connections = bundle.connections ?? [];
  const healthy = connections.filter((connection) => connection.sync_status === "HEALTHY").length;
  const errors = connections.filter((connection) => connection.sync_status === "ERROR").length;
  const neverSynced = connections.filter((connection) => connection.sync_status === "NEVER_SYNCED").length;

  return (
    <AdminShell active="calendars" eyebrow="Integration health" title="Calendars" context={context}>
      <div className="metrics dash-grid">
        <div><span>Active sources</span><strong>{connections.length}</strong><small>{healthy} healthy</small></div>
        <div><span>Sync errors</span><strong>{errors}</strong><small>{neverSynced} never synced</small></div>
        <div><span>Imported blocks</span><strong>{bundle.external_blocks ?? 0}</strong><small>Imported external availability</small></div>
        <div><span>Owner blocks</span><strong>{bundle.owner_blocks ?? 0}</strong><small>Manual host blocks</small></div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow dark">Calendar operations</p><h2>Connected availability sources</h2></div><span className="status-pill status-muted">Read only</span></div>
        <p className="muted">This view exposes source ownership and sync health without transferring private feed URLs to the Admin screen or allowing silent calendar rewrites.</p>
        {connections.length ? <div className="admin-list compact">{connections.map((connection) => (
          <div className="admin-list-row static" key={connection.id}>
            <span>
              <strong>{connection.label} · {providerLabel(connection.provider)}</strong>
              <small>{connection.organization_name} · {connection.property_name} · {connection.unit_name}</small>
              <small>{connection.active_block_count ?? 0} active imported blocks · Last success: {connection.last_success_at ? formatAdminDate(connection.last_success_at) : "Never"}</small>
              {connection.last_error ? <small>Last error: {connection.last_error}</small> : null}
            </span>
            <span>
              <em className={connection.sync_status === "ERROR" ? "pending" : ""}>{cleanStatus(connection.sync_status)}</em>
              <Link href={`/admin/properties/${connection.property_id}`}>Open property →</Link>
            </span>
          </div>
        ))}</div> : <div className="panel-empty"><strong>No external calendars connected yet.</strong><span>Host iCal sources will appear here after calendar connections are created.</span></div>}
      </section>
    </AdminShell>
  );
}
