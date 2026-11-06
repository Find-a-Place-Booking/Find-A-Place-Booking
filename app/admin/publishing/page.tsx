import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  explainPublishingIssue,
  sortPublishingIssues,
  issueOwnerLabel,
} from "@/lib/admin/publishing-steps";
import styles from "./PublishingFlow.module.css";

export const dynamic = "force-dynamic";

type Listing = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  updated_at: string;
};

type QueueItem = {
  property: Listing;
  issues: string[];
  checkFailed: boolean;
};

function statusFor(item: QueueItem) {
  if (item.property.status === "PAUSED") return "paused" as const;
  if (item.property.status === "REJECTED") return "needs" as const;
  if (item.checkFailed || item.issues.length) return "needs" as const;
  return "ready" as const;
}

export default async function AdminPublishingQueue({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; error?: string }>;
}) {
  const context = await getAdminContext();
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) redirect("/admin");
  const [{ view: rawView, q: rawSearch, error: errorMessage }, admin, client] = await Promise.all([
    searchParams,
    Promise.resolve(createAdminClient()),
    createClient(),
  ]);
  const view = ["all", "ready", "needs", "paused"].includes(rawView || "") ? rawView! : "all";
  const search = (rawSearch || "").trim().toLowerCase();

  const [{ data: propertiesData, error: propertyError }, { data: draftsData, error: draftError }] = await Promise.all([
    admin.from("properties")
      .select("id,organization_id,name,status,updated_at")
      .in("status", ["DRAFT", "PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PAUSED", "REJECTED"])
      .order("updated_at", { ascending: false }).limit(150),
    admin.from("host_onboarding_drafts")
      .select("organization_id,current_step,created_property_id,updated_at")
      .eq("status", "IN_PROGRESS")
      .is("created_property_id", null)
      .order("updated_at", { ascending: false }).limit(100),
  ]);
  const properties = (propertiesData || []) as Listing[];
  const drafts = draftsData || [];
  const organizationIds = [...new Set([
    ...properties.map((property) => property.organization_id),
    ...drafts.map((draft) => draft.organization_id),
  ])];
  const { data: organizations } = organizationIds.length
    ? await admin.from("organizations").select("id,name").in("id", organizationIds)
    : { data: [] };
  const organizationNames = new Map((organizations || []).map((org) => [org.id as string, org.name as string]));

  const queue: QueueItem[] = await Promise.all(properties.map(async (property) => {
    // This RPC is the same authoritative check used immediately before publishing.
    const { data: issues, error } = await client.rpc("admin_property_publication_issues", {
      target_property_id: property.id,
    });
    return { property, issues: (issues || []) as string[], checkFailed: Boolean(error) };
  }));
  const counts = {
    ready: queue.filter((item) => statusFor(item) === "ready").length,
    needs: queue.filter((item) => statusFor(item) === "needs").length,
    paused: queue.filter((item) => statusFor(item) === "paused").length,
  };
  const selected = queue
    .filter((item) => view === "all" || statusFor(item) === view)
    .filter((item) => !search || [item.property.name, organizationNames.get(item.property.organization_id) || ""]
      .some((value) => value.toLowerCase().includes(search)))
    .sort((a, b) => {
      const weight = { ready: 0, needs: 1, paused: 2 };
      return weight[statusFor(a)] - weight[statusFor(b)];
    });

  return (
    <AdminShell active="publishing" eyebrow="Host operations" title="Get listings live" context={context}>
      <div className={styles.page}>
        <div className={styles.intro}>
          <h2>Find the listing. See the problem. Fix it.</h2>
          <p>Ready listings come first. Open any listing to see what is stopping publication and go straight to the fix.</p>
        </div>
        {errorMessage ? <div className="admin-message error">{errorMessage}</div> : null}
        {propertyError ? <div className="admin-message error">Couldn't load property records. Refresh and try again.</div> : null}
        <nav className={styles.metrics} aria-label="Filter listings by readiness">
          {([
            ["ready", "Ready to publish", counts.ready],
            ["needs", "Need help", counts.needs],
            ["paused", "Paused", counts.paused],
          ] as const).map(([key, label, count]) => (
            <Link key={key} href={`/admin/publishing?view=${key}`}
              aria-current={view === key ? "page" : undefined}
              className={`${styles.metric} ${view === key ? styles.metricActive : ""}`}>
              <strong>{count}</strong><span>{label}</span>
            </Link>
          ))}
        </nav>
        <section className="panel">
          <div className={styles.toolbar}>
            <div>
              <h2 className={styles.sectionHeading}>{view === "ready" ? "Ready to go live" : view === "needs" ? "Listings needing help" : view === "paused" ? "Paused listings" : "Unpublished listings"}</h2>
              <p className={styles.sectionLead}>
                {view === "all" ? "Showing publishable listings first." : ""} {selected.length} shown
                {view !== "all" ? <> · <Link href="/admin/publishing">Show all</Link></> : null}
              </p>
            </div>
            <form className={styles.search} action="/admin/publishing" method="get">
              <input type="hidden" name="view" value={view} />
              <input name="q" aria-label="Search listings or hosts" defaultValue={rawSearch || ""} placeholder="Search property or host…" />
              <button className="button button-small button-quiet" type="submit">Search</button>
            </form>
          </div>
          {selected.length ? (
            <div className={styles.list}>
              {selected.map((item) => {
                const state = statusFor(item);
                const lead = sortPublishingIssues(item.issues.map(explainPublishingIssue))[0];
                const isRejected = item.property.status === "REJECTED";
                const stateText = isRejected ? "Previously rejected" : state === "ready" ? "Ready to publish" : state === "paused" ? "Paused by choice" : item.checkFailed ? "Needs admin review" : `${item.issues.length} ${item.issues.length === 1 ? "thing" : "things"} to fix`;
                return (
                  <div className={styles.listRow} key={item.property.id}>
                    <div>
                      <h3>{item.property.name}</h3>
                      <div className={styles.eyeline}>{organizationNames.get(item.property.organization_id) || "Host not found"}</div>
                      <p className={state === "ready" ? styles.ready : state === "paused" ? styles.paused : item.checkFailed ? styles.error : styles.needs}>
                        <strong>{stateText}</strong>
                        {state === "needs" && !isRejected && !item.checkFailed && lead ? <> · {lead.title.toLowerCase()} <span className={styles.muted}>({issueOwnerLabel(lead.owner).toLowerCase()})</span></> : null}
                        {item.checkFailed ? " · Publishing check could not run" : null}
                        {isRejected ? " · Review the previous decision before any approval" : null}
                        {state === "paused" ? " · Review with host before reactivating" : null}
                      </p>
                    </div>
                    <Link className={`button button-small ${state === "ready" ? "" : "button-quiet"}`}
                      href={`/admin/publishing/${item.property.id}`}>
                      {state === "ready" ? "Review & publish" : isRejected ? "Review rejection" : state === "paused" ? "Review paused stay" : "See what to fix"}
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={styles.empty}>{search ? "No listings match that search." : "No listings in this category."}</p>
          )}
        </section>
        <details className={styles.details}>
          <summary>Hosts who haven't finished their first listing ({drafts.length})</summary>
          <div className={styles.detailsContent}>
            {draftError ? <p className="admin-message error">Couldn't load unfinished host setups.</p> : null}
            <p className={styles.muted}>These hosts started onboarding but don't have a property to publish yet. Help prepare a draft without signing agreements or connecting accounts for them.</p>
            {drafts.length ? <div className={styles.list}>
              {drafts.map((draft) => (
                <div className={styles.listRow} key={draft.organization_id}>
                  <div><strong>{organizationNames.get(draft.organization_id) || "Host account"}</strong>
                    <div className={styles.eyeline}>Saved at step {Number(draft.current_step) + 1} of 11</div>
                  </div>
                  <Link className="button button-small button-quiet" href={`/admin/host-assist/${draft.organization_id}`}>Help finish setup</Link>
                </div>
              ))}
            </div> : <p>No unfinished host drafts without a property record.</p>}
          </div>
        </details>
        <div className={styles.quickLinks}>
          <Link href="/admin/properties">All properties</Link>
          <Link href="/admin/calendars">Calendar health</Link>
          <Link href="/admin/hosts">Host accounts</Link>
        </div>
      </div>
    </AdminShell>
  );
}
