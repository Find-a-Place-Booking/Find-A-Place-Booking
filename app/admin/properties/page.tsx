import Link from "next/link";

import { setHomepageFeaturePriority } from "@/app/admin/actions";
import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { cleanStatus, formatAdminDate } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/server";

type PropertyRow = {
  id: string;
  organization_id: string;
  name: string;
  property_type: string | null;
  public_area: string | null;
  city: string | null;
  region_code: string | null;
  status: string;
  homepage_feature_priority: number;
  submitted_at: string | null;
  updated_at: string;
};

const statusOptions = ["ALL", "PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "PUBLISHED", "PAUSED", "DRAFT", "REJECTED"];

const priorityLabels: Record<number, string> = {
  1: "1 · Founding partner",
  2: "2 · Paid placement",
  3: "3 · Standard",
};

export default async function AdminPropertiesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; error?: string; saved?: string }> }) {
  const context = await getAdminContext();
  const { q = "", status = "ALL", error: errorMessage, saved } = await searchParams;
  const search = q.trim();
  const selectedStatus = statusOptions.includes(status) ? status : "ALL";
  const canReview = hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"]);
  const supabase = await createClient();

  let query = supabase
    .from("properties")
    .select("id,organization_id,name,property_type,public_area,city,region_code,status,homepage_feature_priority,submitted_at,updated_at")
    .neq("status", "ARCHIVED")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (selectedStatus !== "ALL") query = query.eq("status", selectedStatus);
  if (search) query = query.or(`name.ilike.%${search.replaceAll(",", "")}%,public_area.ilike.%${search.replaceAll(",", "")}%,city.ilike.%${search.replaceAll(",", "")}%`);

  const [{ data, error }, { count: pendingCount }, { count: publishedCount }] = await Promise.all([
    query,
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("status", "PENDING_REVIEW"),
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("status", "PUBLISHED"),
  ]);

  const properties = (data ?? []) as PropertyRow[];
  const orgIds = [...new Set(properties.map((property) => property.organization_id))];

  const { data: organizations } = orgIds.length
    ? await supabase.from("organizations").select("id,name").in("id", orgIds)
    : { data: [] };

  const orgMap = new Map(
    (organizations ?? []).map((organization) => [
      organization.id as string,
      organization.name as string,
    ]),
  );

  const propertyIds = properties.map((property) => property.id);
  const { data: units } = propertyIds.length
    ? await supabase
        .from("property_units")
        .select("property_id,slug,max_guests")
        .in("property_id", propertyIds)
        .eq("is_primary", true)
    : { data: [] };

  const unitMap = new Map(
    (units ?? []).map((unit) => [unit.property_id as string, unit]),
  );

  return <AdminShell active="properties" eyebrow="Listings & inventory" title="Properties" context={context}>
    <div className="dash-grid metrics admin-review-metrics">
      <div><span>Waiting for review</span><strong>{pendingCount ?? 0}</strong><small>{canReview ? "Ready for your decision" : "Operations review queue"}</small></div>
      <div><span>Published</span><strong>{publishedCount ?? 0}</strong><small>Guest-visible listings</small></div>
    </div>

    <section className="panel admin-search-page">
      <form className="admin-search-shell admin-property-filters" action="/admin/properties" method="get">
        <input name="q" defaultValue={search} placeholder="Property name, destination or city…" />
        <select name="status" defaultValue={selectedStatus}>{statusOptions.map((option) => <option value={option} key={option}>{option === "ALL" ? "All statuses" : cleanStatus(option)}</option>)}</select>
        <button className="button button-small" type="submit">Filter</button>
      </form>
      <p className="muted">
        Hosts submit complete drafts here. Operations/Super Admin can review publication and set homepage feature priority:
        <strong> 1 founding partner</strong>, <strong>2 paid placement</strong>, <strong>3 standard</strong>.
      </p>
    </section>

    {saved ? <div className="admin-message success">{saved}</div> : null}
    {errorMessage ? <div className="admin-message error">{errorMessage}</div> : null}

    <section className="panel admin-results-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow dark">Inventory</p>
          <h2>{search ? `Matches for “${search}”` : selectedStatus === "ALL" ? "Current property records" : cleanStatus(selectedStatus)}</h2>
        </div>
        <span className="status-pill status-muted">{properties.length} shown</span>
      </div>

      {error ? <div className="admin-message error">Property lookup failed. Confirm the latest database migrations were applied.</div> : null}

      {!error && properties.length ? (
        <div className="admin-property-results">
          {properties.map((property) => {
            const unit = unitMap.get(property.id);
            const priority = property.homepage_feature_priority || 3;

            return (
              <div
                className={`admin-property-row ${property.status === "PENDING_REVIEW" ? "needs-review" : ""}`}
                key={property.id}
              >
                <div>
                  <Link
                    href={`/admin/properties/${property.id}`}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    <strong>{property.name}</strong>
                  </Link>
                  <span>{orgMap.get(property.organization_id) || "Unknown organization"}</span>
                </div>

                <div>
                  <small>Area</small>
                  <strong>{property.public_area || [property.city, property.region_code].filter(Boolean).join(", ") || "Not set"}</strong>
                  <span>{property.property_type || "Type not set"}</span>
                </div>

                <div>
                  <small>Status</small>
                  <strong>{cleanStatus(property.status)}</strong>
                  <span>{property.status === "PENDING_REVIEW" && property.submitted_at ? `Submitted ${formatAdminDate(property.submitted_at)}` : unit?.slug ? `/stays/${unit.slug}` : "No slug"}</span>
                </div>

                <div>
                  <small>Homepage priority</small>
                  {canReview ? (
                    <form
                      action={setHomepageFeaturePriority}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: "6px",
                        alignItems: "center",
                      }}
                    >
                      <input type="hidden" name="property_id" value={property.id} />
                      <select
                        name="priority"
                        defaultValue={String(priority)}
                        aria-label={`Homepage priority for ${property.name}`}
                        style={{
                          width: "100%",
                          minWidth: 0,
                          border: "1px solid var(--line)",
                          background: "#fff",
                          padding: "8px 9px",
                          fontSize: ".68rem",
                        }}
                      >
                        <option value="1">1 · Founding</option>
                        <option value="2">2 · Paid</option>
                        <option value="3">3 · Standard</option>
                      </select>
                      <button
                        className="button button-small button-quiet"
                        type="submit"
                        style={{ padding: "8px 9px" }}
                      >
                        Save
                      </button>
                    </form>
                  ) : (
                    <strong>{priorityLabels[priority] || priorityLabels[3]}</strong>
                  )}
                  <span>
                    {unit?.max_guests ? `${unit.max_guests} guests` : "Capacity not set"} · {formatAdminDate(property.updated_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : !error ? (
        <div className="panel-empty">
          <strong>No property records in this view.</strong>
          <span>Try another status or search term.</span>
        </div>
      ) : null}
    </section>
  </AdminShell>;
}
