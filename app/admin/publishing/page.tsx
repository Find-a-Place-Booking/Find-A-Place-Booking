import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { cleanStatus } from "@/lib/admin/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Listing = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  updated_at: string;
  live_checkout_enabled: boolean;
};

export default async function AdminPublishingQueue({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const context = await getAdminContext();
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) redirect("/admin");
  const admin = createAdminClient();
  const userClient = await createClient();
  const params = await searchParams;
  const { data, error } = await admin.from("properties")
    .select("id,organization_id,name,status,updated_at,live_checkout_enabled")
    .in("status", ["DRAFT", "PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PAUSED", "REJECTED"])
    .order("updated_at", { ascending: false })
    .limit(150);
  const properties = (data || []) as Listing[];
  const organizationIds = [...new Set(properties.map((property) => property.organization_id))];
  const draftsResult = await admin.from("host_onboarding_drafts")
    .select("organization_id,status,current_step,created_property_id,updated_at,host_policy_accepted_at,authority_confirmed")
    .eq("status", "IN_PROGRESS").order("updated_at", { ascending: false }).limit(100);
  const incompleteDrafts = (draftsResult.data || []).filter((draft) =>
    !draft.created_property_id || properties.some((property) => property.id === draft.created_property_id));

  // A published listing can still be blocked at checkout by a stale external
  // PMS. Report that separately from the unpublished property queue.
  const { data: calendarAlerts } = await admin.from("calendar_connections")
    .select("unit_id,provider,sync_status,last_success_at,connection_kind")
    .eq("is_active", true).limit(400);
  const alerts = (calendarAlerts || []).filter((c) => {
    if (c.sync_status !== "HEALTHY") return true;
    if (!c.last_success_at) return true;
    const age = Date.now() - Date.parse(c.last_success_at);
    const maxAgeHours = c.connection_kind === "ICAL" ? 48 : 24;
    return Number.isFinite(age) && age > maxAgeHours * 3600_000;
  });
  const alertUnitIds = [...new Set(alerts.map((c) => c.unit_id))];
  const { data: alertUnits } = alertUnitIds.length
    ? await admin.from("property_units").select("id,property_id").in("id", alertUnitIds)
    : { data: [] };
  const propIdsWithWarning = [...new Set((alertUnits || []).map((u) => u.property_id))];
  const { data: publishedWithAlerts } = propIdsWithWarning.length
    ? await admin.from("properties").select("id,name,status")
      .in("id", propIdsWithWarning).eq("status", "PUBLISHED")
    : { data: [] };
  const unitPropId = new Map((alertUnits || []).map((u) => [u.id, u.property_id]));
  const calendarIssueCounts = new Map<string, number>();
  for (const connection of alerts) {
    const id = unitPropId.get(connection.unit_id);
    if (id) calendarIssueCounts.set(id, (calendarIssueCounts.get(id) || 0) + 1);
  }
  const additionalOrgIds = incompleteDrafts.map((d) => d.organization_id);
  const allOrgIds = [...new Set([...organizationIds, ...additionalOrgIds])];
  const { data: queueOrganizations } = allOrgIds.length
    ? await admin.from("organizations").select("id,name,commission_tier,partner_status").in("id", allOrgIds)
    : { data: [] };
  const orgById = new Map((queueOrganizations || []).map((row) => [row.id, row]));
  const organizationsById = orgById;

  const readiness = await Promise.all(properties.map(async (property) => {
    const { data: issues, error: issueError } = await userClient.rpc(
      "admin_property_publication_issues", { target_property_id: property.id });
    return { property, issues: (issues ?? []) as string[], error: issueError };
  }));
  const ready = readiness.filter((item) => !item.error && item.issues.length === 0);
  const incomplete = readiness.filter((item) => item.error || item.issues.length);

  return (
    <AdminShell active="publishing" eyebrow="Host setup operations" title="Complete & publish listings" context={context}>
      <section className="panel">
        <p className="eyebrow dark">Publication queue</p>
        <h2>{ready.length} ready to publish · {incomplete.length} need attention</h2>
        <p className="muted">
          This checks the actual property fields, photos, cancellation terms, calendar choice,
          Stripe readiness, address and tax/state requirements. Finishing a listing does not
          mean accepting the Host Agreement for the host or overriding payment protections.
        </p>
        <p className="muted">For existing live listings, use <Link href="/admin/properties">Properties</Link>. Published listings cannot be changed with the draft-completion editor.</p>
      </section>
      {params.error ? <div className="admin-message error">{params.error}</div> : null}
      {error ? <div className="admin-message error">Unable to load the publishing queue: {error.message}</div> : null}
      {!error && !properties.length ? (
        <section className="panel"><strong>No unpublished properties found.</strong></section>
      ) : null}
      {incompleteDrafts.length ? <section className="panel" style={{ display: "grid", gap: 12 }}>
        <p className="eyebrow dark">Earlier in onboarding</p>
        <h2>{incompleteDrafts.length} host setup drafts need follow-up</h2>
        <p className="muted">Admins can complete factual details and prepare a draft property. Host Agreement, authority confirmation, taxes and Stripe still require the proper owner or provider.</p>
        {incompleteDrafts.map((draft) => (
          <div key={draft.organization_id} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div><strong>{orgById.get(draft.organization_id)?.name || "Host account"}</strong>
              <div className="muted">Step {Number(draft.current_step) + 1} of 11 · {draft.created_property_id ? "Property started" : "No property record"}
              {!draft.host_policy_accepted_at ? " · Agreement outstanding" : ""}</div>
            </div>
            <Link className="button button-small button-quiet" href={`/admin/host-assist/${draft.organization_id}`}>Help this host</Link>
          </div>
        ))}
      </section> : null}
      {publishedWithAlerts?.length ? <section className="panel" style={{ display: "grid", gap: 12 }}>
        <p className="eyebrow dark">Calendar attention</p>
        <h2>{publishedWithAlerts.length} live listings have external calendar warnings</h2>
        <p className="muted">A listing can be public even when guest booking checks correctly block unavailable or unverifiable calendars. Resolve credentials and verify new successful syncs before accepting bookings.</p>
        {publishedWithAlerts.slice(0, 25).map((property) => (
          <div key={property.id} style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <span><strong>{property.name}</strong> · {calendarIssueCounts.get(property.id) || 0} calendar warning(s)</span>
            <Link href={`/admin/properties/${property.id}`} className="button button-small button-quiet">Inspect listing</Link>
          </div>
        ))}
        <Link href="/admin/calendars">Go to calendar diagnostics →</Link>
      </section> : null}
      <section className="panel" style={{ display: "grid", gap: 16 }}>
        <h2>Properties waiting to go live</h2>
        {readiness.map(({ property, issues, error: readinessError }) => {
          const org = organizationsById.get(property.organization_id);
          const isReady = !readinessError && issues.length === 0;
          return (
            <div key={property.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 14, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>{property.name}</strong>
                  <div className="muted">{org?.name || "Unknown host"} · {cleanStatus(property.status)}</div>
                </div>
                <div><strong>{isReady ? "Ready to publish" : readinessError ? "Unable to verify" : `${issues.length} requirements outstanding`}</strong></div>
              </div>
              {!isReady ? (
                <ul style={{ marginTop: 0, marginBottom: 0 }}>
                  {(readinessError ? ["Publishing check unavailable. Do not publish until this is resolved."] : issues)
                    .slice(0, 7).map((issue) => <li key={issue}>{issue}</li>)}
                </ul>
              ) : <p className="muted">All required checks passed. Review and publish from the property detail page.</p>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href={`/admin/publishing/${property.id}`} className="button button-small">
                  {isReady ? "Review & publish" : "Fix setup"}
                </Link>
                <Link href={`/admin/properties/${property.id}`} className="button button-small button-quiet">Existing property record</Link>
              </div>
            </div>
          );
        })}
      </section>
    </AdminShell>
  );
}
