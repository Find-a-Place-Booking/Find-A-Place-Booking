import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext } from "@/lib/admin/context";
import { cleanStatus, formatAdminDate } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/server";

type HostSearchRow = {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  profile_created_at: string;
  organization_id: string | null;
  organization_name: string | null;
  organization_status: string | null;
  member_role: string | null;
  membership_status: string | null;
  partner_status: string | null;
  commission_tier: string | null;
};

export default async function AdminHostsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const context = await getAdminContext();
  const { q = "" } = await searchParams;
  const search = q.trim();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_search_hosts", {
    search_term: search,
    result_limit: 50,
  });
  const rows = (data ?? []) as HostSearchRow[];

  return (
    <AdminShell active="hosts" eyebrow="Accounts & organizations" title="Host lookup" context={context}>
      <section className="panel admin-search-page">
        <form className="admin-search-shell" action="/admin/hosts" method="get">
          <input name="q" defaultValue={search} aria-label="Search hosts" placeholder="Owner name, organization, email or phone…" autoFocus />
          <button className="button button-small" type="submit">Search</button>
        </form>
        <p className="muted">This searches the real account/organization foundation only. Properties, bookings and payments will join this lookup when those systems exist.</p>
      </section>

      <section className="panel admin-results-panel">
        <div className="panel-head"><div><p className="eyebrow dark">Results</p><h2>{search ? `Matches for “${search}”` : "Recent host profiles"}</h2></div><span className="status-pill status-muted">{rows.length} shown</span></div>
        {error ? <div className="admin-message error">Host lookup failed. Confirm the Milestone 5 migration was applied.</div> : null}
        {!error && rows.length ? (
          <div className="admin-host-results">
            {rows.map((row, index) => (
              <Link className="admin-host-row" href={`/admin/hosts/${row.profile_id}`} key={`${row.profile_id}-${row.organization_id ?? "none"}-${index}`}>
                <div className="admin-host-primary">
                  <strong>{row.full_name || row.email || "Unnamed host"}</strong>
                  <span>{row.email || "No email"}{row.phone ? ` · ${row.phone}` : ""}</span>
                </div>
                <div><small>Organization</small><strong>{row.organization_name || "Not created yet"}</strong><span>{row.organization_status ? cleanStatus(row.organization_status) : "Identity only"}</span></div>
                <div><small>Partner tier</small><strong>{row.commission_tier ? cleanStatus(row.commission_tier) : "Standard 7%"}</strong><span>{row.partner_status ? cleanStatus(row.partner_status) : "Not claimed"}</span></div>
                <div><small>Account created</small><strong>{formatAdminDate(row.profile_created_at)}</strong><span>Open account →</span></div>
              </Link>
            ))}
          </div>
        ) : !error ? <div className="panel-empty"><strong>{search ? "No matching host accounts." : "No host accounts yet."}</strong><span>{search ? "Try the owner name, organization, email or phone associated with the account." : "Public host signups will appear here as profiles are created."}</span></div> : null}
      </section>
    </AdminShell>
  );
}
