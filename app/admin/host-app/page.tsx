import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { setHostAppPartner } from "./actions";

export const dynamic = "force-dynamic";

/** Partner verification stays an admin choice, but app access is free to every host. */
export default async function HostAppAdmin({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; saved?: string; error?: string; warning?: string }>;
}) {
  const [context, params] = await Promise.all([getAdminContext(), searchParams]);
  const canVerify = hasAnyAdminRole(context, ["SUPER_ADMIN", "PARTNER_ADMIN"]);
  const admin = createAdminClient();
  const { data: orgs, error } = await admin
    .from("organizations")
    .select("id,name,contact_email,partner_status,partner_verified_at")
    .neq("status", "ARCHIVED")
    .order("name")
    .limit(1000);
  const query = (params.q || "").trim().toLowerCase();
  const rows = (orgs || []).filter(
    (org) => !query || `${org.name} ${org.contact_email}`.toLowerCase().includes(query),
  );

  return (
    <AdminShell active="host-app" title="Partner verification" eyebrow="Host partners" context={context}>
      <section className="panel">
        <h2>All host apps are free</h2>
        <p>
          Any active host owner or manager can use the dedicated Host web app.
          Guests have their own separate app, and both can use the same booking messages.
          Partner verification is still managed here for other partner benefits;
          it no longer determines app access.
        </p>
        <form method="get">
          <label>
            Find a host
            <input name="q" defaultValue={params.q || ""} placeholder="Host name or email" />
          </label>
          <button className="button" type="submit">Search</button>
        </form>
      </section>
      {params.saved ? (
        <p role="status" className="admin-message success">
          {params.saved === "verify"
            ? "Partner verified. Host app access remains free for everyone."
            : "Partner status removed. The host app remains free."}
        </p>
      ) : null}
      {params.error || error ? (
        <p role="alert" className="admin-message danger">
          Unable to complete this request. Refresh and try again.
        </p>
      ) : null}
      {params.warning ? (
        <p role="alert" className="admin-message warning">
          A legacy paid host-app subscription may need manual billing review in Stripe.
        </p>
      ) : null}
      {rows.map((org) => {
        const verified = org.partner_status === "VERIFIED";
        return (
          <section key={org.id} className="panel" style={{ padding: 20, marginBlock: 12 }}>
            <h2>{org.name}</h2>
            <p>{org.contact_email}</p>
            <p><strong>{verified ? "Verified partner" : "Standard host"} · Free host app</strong></p>
            {canVerify ? (
              <form action={setHostAppPartner}>
                <input type="hidden" name="organizationId" value={org.id} />
                <label>
                  Admin note
                  <input name="note" maxLength={1000} placeholder="Optional verification note" />
                </label>
                {verified ? (
                  <details>
                    <summary>Remove partner verification</summary>
                    <p>This only removes partner status; host app access stays free.</p>
                    <button className="button button-outline" name="decision" value="remove">
                      Confirm removal
                    </button>
                  </details>
                ) : (
                  <button className="button" name="decision" value="verify">
                    Verify partner
                  </button>
                )}
              </form>
            ) : <small>Your admin role cannot change partner verification.</small>}
          </section>
        );
      })}
      {!rows.length && !error ? <section className="panel">No matching hosts.</section> : null}
    </AdminShell>
  );
}
