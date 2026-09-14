import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext } from "@/lib/admin/context";
import { cleanStatus, formatAdminDate } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/server";

type ConnectionRow = {
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
};

type UnitRow = { id: string; property_id: string; name: string; slug: string };
type PropertyRow = { id: string; organization_id: string; name: string; status: string };
type OrganizationRow = { id: string; name: string };
type BlockRow = { unit_id: string; connection_id: string | null; block_type: string };

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

  const [connectionsResult, blocksResult] = await Promise.all([
    supabase
      .from("calendar_connections")
      .select("id,unit_id,provider,label,connection_kind,sync_status,last_sync_attempt_at,last_success_at,last_error,is_active")
      .eq("is_active", true)
      .order("last_success_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("availability_blocks")
      .select("unit_id,connection_id,block_type")
      .eq("state", "ACTIVE"),
  ]);

  if (connectionsResult.error || blocksResult.error) {
    throw new Error("Unable to load calendar operations. Apply the current Milestone 9B migration and refresh.");
  }

  const connections = (connectionsResult.data ?? []) as ConnectionRow[];
  const blocks = (blocksResult.data ?? []) as BlockRow[];
  const unitIds = [...new Set([...connections.map((row) => row.unit_id), ...blocks.map((row) => row.unit_id)])];

  let units: UnitRow[] = [];
  let properties: PropertyRow[] = [];
  let organizations: OrganizationRow[] = [];

  if (unitIds.length) {
    const { data: unitData, error: unitError } = await supabase
      .from("property_units")
      .select("id,property_id,name,slug")
      .in("id", unitIds);
    if (unitError) throw new Error("Unable to resolve calendar units.");
    units = (unitData ?? []) as UnitRow[];

    const propertyIds = [...new Set(units.map((unit) => unit.property_id))];
    if (propertyIds.length) {
      const { data: propertyData, error: propertyError } = await supabase
        .from("properties")
        .select("id,organization_id,name,status")
        .in("id", propertyIds);
      if (propertyError) throw new Error("Unable to resolve calendar properties.");
      properties = (propertyData ?? []) as PropertyRow[];

      const organizationIds = [...new Set(properties.map((property) => property.organization_id))];
      if (organizationIds.length) {
        const { data: organizationData, error: organizationError } = await supabase
          .from("organizations")
          .select("id,name")
          .in("id", organizationIds);
        if (organizationError) throw new Error("Unable to resolve calendar organizations.");
        organizations = (organizationData ?? []) as OrganizationRow[];
      }
    }
  }

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const organizationById = new Map(organizations.map((organization) => [organization.id, organization]));
  const connectionBlockCount = new Map<string, number>();
  for (const block of blocks) {
    if (!block.connection_id) continue;
    connectionBlockCount.set(block.connection_id, (connectionBlockCount.get(block.connection_id) ?? 0) + 1);
  }

  const healthy = connections.filter((connection) => connection.sync_status === "HEALTHY").length;
  const errors = connections.filter((connection) => connection.sync_status === "ERROR").length;
  const neverSynced = connections.filter((connection) => connection.sync_status === "NEVER_SYNCED").length;
  const ownerBlocks = blocks.filter((block) => block.block_type === "OWNER_BLOCK").length;
  const externalBlocks = blocks.filter((block) => block.block_type === "EXTERNAL_BLOCK").length;

  return (
    <AdminShell active="calendars" eyebrow="Integration health" title="Calendars" context={context}>
      <div className="metrics dash-grid">
        <div><span>Active sources</span><strong>{connections.length}</strong><small>{healthy} healthy</small></div>
        <div><span>Sync errors</span><strong>{errors}</strong><small>{neverSynced} never synced</small></div>
        <div><span>Imported blocks</span><strong>{externalBlocks}</strong><small>Canonical external availability</small></div>
        <div><span>Owner blocks</span><strong>{ownerBlocks}</strong><small>Manual host blocks</small></div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow dark">Calendar operations</p><h2>Connected availability sources</h2></div><span className="status-pill status-muted">Read only</span></div>
        <p className="muted">This view exposes source ownership and sync health without allowing Admin to silently rewrite a host calendar. Host changes stay behind the unit-scoped calendar workflow and audit log.</p>
        {connections.length ? <div className="admin-list compact">{connections.map((connection) => {
          const unit = unitById.get(connection.unit_id);
          const property = unit ? propertyById.get(unit.property_id) : null;
          const organization = property ? organizationById.get(property.organization_id) : null;
          return <div className="admin-list-row static" key={connection.id}>
            <span>
              <strong>{connection.label} · {providerLabel(connection.provider)}</strong>
              <small>{organization?.name ?? "Unknown organization"} · {property?.name ?? "Unknown property"}{unit ? ` · ${unit.name}` : ""}</small>
              <small>{connectionBlockCount.get(connection.id) ?? 0} active imported blocks · Last success: {connection.last_success_at ? formatAdminDate(connection.last_success_at) : "Never"}</small>
              {connection.last_error ? <small>Last error: {connection.last_error}</small> : null}
            </span>
            <span>
              <em className={connection.sync_status === "ERROR" ? "pending" : ""}>{cleanStatus(connection.sync_status)}</em>
              {property ? <Link href={`/admin/properties/${property.id}`}>Open property →</Link> : null}
            </span>
          </div>;
        })}</div> : <div className="panel-empty"><strong>No external calendars connected yet.</strong><span>Host iCal sources will appear here after Milestone 9B connections are created.</span></div>}
      </section>
    </AdminShell>
  );
}
