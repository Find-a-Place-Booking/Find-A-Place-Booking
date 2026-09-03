import { AdminShell } from "@/components/AdminShell";
import { getAdminContext } from "@/lib/admin/context";
import { formatAdminDate } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/server";

type AuditRow = {
  id: string;
  actor_profile_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type Actor = { id: string; full_name: string | null; email: string | null };

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await getAdminContext();
  const { q = "" } = await searchParams;
  const search = q.trim().toLowerCase();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id,actor_profile_id,action,entity_type,entity_id,reason,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const events = (data ?? []) as AuditRow[];
  const actorIds = [...new Set(events.map((event) => event.actor_profile_id).filter((id): id is string => Boolean(id)))];
  let actors: Actor[] = [];
  if (actorIds.length) {
    const { data: actorData } = await supabase.from("profiles").select("id,full_name,email").in("id", actorIds);
    actors = (actorData ?? []) as Actor[];
  }
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));
  const filtered = search ? events.filter((event) => {
    const actor = event.actor_profile_id ? actorMap.get(event.actor_profile_id) : undefined;
    return [event.action, event.entity_type, event.entity_id, event.reason, actor?.full_name, actor?.email]
      .some((value) => value?.toLowerCase().includes(search));
  }) : events;

  return (
    <AdminShell active="audit" eyebrow="Traceability" title="Audit log" context={context}>
      <section className="panel admin-search-page">
        <form className="admin-search-shell" action="/admin/audit" method="get">
          <input name="q" defaultValue={q} placeholder="Filter action, entity, ID, reason or admin…" aria-label="Filter audit log" />
          <button className="button button-small" type="submit">Filter</button>
        </form>
        <p className="muted">Audit records are append-only. This page reads the latest 200 events; broader pagination/export can be added when operational volume requires it.</p>
      </section>

      <section className="panel admin-results-panel">
        <div className="panel-head"><div><p className="eyebrow dark">Permanent history</p><h2>{search ? `Filtered activity` : "Latest activity"}</h2></div><span className="status-pill status-muted">{filtered.length} shown</span></div>
        {error ? <div className="admin-message error">Audit history could not be loaded.</div> : null}
        {!error && filtered.length ? <div className="admin-audit-list">{filtered.map((event) => {
          const actor = event.actor_profile_id ? actorMap.get(event.actor_profile_id) : undefined;
          return <details className="admin-audit-row expandable" key={event.id}>
            <summary><span><strong>{event.action}</strong><small>{event.entity_type}{event.entity_id ? ` · ${event.entity_id}` : ""}</small></span><span><b>{actor?.full_name || actor?.email || "System"}</b><small>{formatAdminDate(event.created_at)}</small></span></summary>
            <div className="admin-audit-detail"><p><strong>Reason:</strong> {event.reason || "No note recorded."}</p><p><strong>Actor:</strong> {actor?.email || event.actor_profile_id || "System"}</p>{event.metadata && Object.keys(event.metadata).length ? <pre>{JSON.stringify(event.metadata, null, 2)}</pre> : null}</div>
          </details>;
        })}</div> : !error ? <div className="panel-empty"><strong>No audit events match.</strong><span>Partner verification decisions and future privileged changes will appear here automatically.</span></div> : null}
      </section>
    </AdminShell>
  );
}
