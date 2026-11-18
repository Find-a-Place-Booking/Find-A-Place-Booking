import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { getHostProperties } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";

export default async function HostOwnerRezStatusPage() {
  const properties = await getHostProperties();
  const unitIds = properties.map(p => p.unitId);
  const client = await createClient();
  const { data: connections, error } = unitIds.length
    ? await client.from("calendar_connections")
      .select("unit_id,provider,connection_kind,label,sync_status,last_success_at,last_sync_attempt_at,last_error,is_active")
      .in("unit_id", unitIds).eq("provider", "OWNEREZ")
    : { data: [], error: null };
  const byUnit = new Map((connections || []).map(c => [c.unit_id, c]));
  return <DashboardShell active="Integrations" title="OwnerRez connection status">
    <p><Link href="/host/calendar">← Calendar and integrations</Link></p>
    <section className="panel">
      <h2>How OwnerRez currently connects</h2>
      <p>Find A Place is using OwnerRez calendar feeds where configured. This synchronizes booking blocks but does not transfer guest details, signatures, security deposits or all OwnerRez rates and rules.</p>
      <p className="muted">A full OwnerRez API connection requires host authorization and a separately configured OAuth app. Until that integration is tested, keep OwnerRez's existing calendar feed active so bookings aren't missed.</p>
    </section>
    {error ? <p className="admin-message error">Could not load sync status. Nothing was changed.</p> : null}
    {properties.map(p => {
      const calendar = byUnit.get(p.unitId);
      return <section className="panel" key={p.id}>
        <h3>{p.name}</h3>
        {calendar ? <>
          <p>Connection: <b>{calendar.label || "OwnerRez"}</b> · {calendar.connection_kind}</p>
          <p>Status: <strong>{calendar.sync_status}</strong> {calendar.is_active ? "· Active" : "· Paused"}</p>
          <p>Last successful sync: {calendar.last_success_at ? new Date(calendar.last_success_at).toLocaleString("en-US") : "None recorded"}</p>
          {calendar.last_error ? <p role="alert">Last sync error: {calendar.last_error.slice(0,300)}</p> : null}
        </> : <p>No OwnerRez feed connected to this listing.</p>}
        <p><Link href={`/host/properties/${p.slug}`}>Manage property and calendar →</Link></p>
      </section>;
    })}
  </DashboardShell>;
}
