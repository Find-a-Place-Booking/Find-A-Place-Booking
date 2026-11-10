import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { hostMobileAccessMode } from "@/lib/host/mobile-access-policy";
import { setHostAppPartner } from "./actions";
export const dynamic = "force-dynamic";
export default async function HostAppAdmin({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    saved?: string;
    error?: string;
    warning?: string;
  }>;
}) {
  const [context, params] = await Promise.all([
    getAdminContext(),
    searchParams,
  ]);
  const canVerify = hasAnyAdminRole(context, ["SUPER_ADMIN", "PARTNER_ADMIN"]);
  const admin = createAdminClient();
  const [orgs, access, reviews] = await Promise.all([
    admin
      .from("organizations")
      .select("id,name,contact_email,partner_status,partner_verified_at")
      .neq("status", "ARCHIVED")
      .order("name")
      .limit(1000),
    admin
      .from("host_mobile_access")
      .select(
        "organization_id,trial_expires_at,subscription_expires_at,stripe_subscription_status,stripe_cancel_at_period_end",
      ),
    admin
      .from("audit_logs")
      .select("entity_id,reason,created_at")
      .eq("action", "host_webapp.billing_review_required")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const query = (params.q || "").trim().toLowerCase();
  const rows = (orgs.data || []).filter(
    (o) =>
      !query || `${o.name} ${o.contact_email}`.toLowerCase().includes(query),
  );
  return (
    <AdminShell
      active="host-app"
      title="Host app access"
      eyebrow="Partner verification"
      context={context}
    >
      <section className="panel">
        <p>
          Partner verification is controlled by the Find A Place team. Booking
          commission is separate.
        </p>
        <form method="get">
          <label>
            Find a host
            <input
              name="q"
              defaultValue={params.q || ""}
              placeholder="Host name or email"
            />
          </label>
          <button className="button" type="submit">
            Search
          </button>
        </form>
      </section>
      {params.saved ? (
        <p role="status" className="admin-message success">
          {params.saved === "verify"
            ? "Partner verified. Host app access is included."
            : "Partner status removed. Access now follows the host's subscription or remaining trial."}
        </p>
      ) : null}
      {params.error || orgs.error || access.error ? (
        <p role="alert" className="admin-message danger">
          Unable to complete this request. Refresh and try again.
        </p>
      ) : null}
      {params.warning ? (
        <p role="alert" className="admin-message warning">
          Partner access is free now, but automatic renewal could not be
          stopped. Check the host's Stripe subscription before its next renewal.
        </p>
      ) : null}
      {rows.map((o) => {
        const row = access.data?.find((a) => a.organization_id === o.id);
        const mode = hostMobileAccessMode({
          partnerStatus: o.partner_status,
          trialExpiresAt: row?.trial_expires_at,
          subscriptionExpiresAt: row?.subscription_expires_at,
          stripeSubscriptionStatus: row?.stripe_subscription_status,
        });
        const verified = o.partner_status === "VERIFIED";
        return (
          <section
            key={o.id}
            className="panel"
            style={{ padding: 20, marginBlock: 12 }}
          >
            <h2>{o.name}</h2>
            <p>{o.contact_email}</p>
            {reviews.data?.some((r) => r.entity_id === o.id) ? (
              <p className="admin-message warning">
                App billing has a refund, dispute or fraud signal to review in
                Stripe.
              </p>
            ) : null}
            <p>
              <strong>
                {verified
                  ? "Verified partner · Free"
                  : mode === "SUBSCRIBED"
                    ? "Paid app subscription"
                    : mode === "TRIAL"
                      ? "Free trial"
                      : "Paid app plan required"}
              </strong>
            </p>
            {canVerify ? (
              <form action={setHostAppPartner}>
                <input type="hidden" name="organizationId" value={o.id} />
                <label>
                  Admin note
                  <input
                    name="note"
                    maxLength={1000}
                    placeholder="Optional verification note"
                  />
                </label>
                {verified ? (
                  <details>
                    <summary>Remove partner verification</summary>
                    <p>
                      This removes included app access. An active paid plan or
                      remaining trial can still provide access.
                    </p>
                    <button
                      className="button button-outline"
                      name="decision"
                      value="remove"
                    >
                      Confirm removal
                    </button>
                  </details>
                ) : (
                  <button className="button" name="decision" value="verify">
                    Verify partner · Grant free app access
                  </button>
                )}
              </form>
            ) : (
              <small>Your admin role cannot change partner verification.</small>
            )}
          </section>
        );
      })}
      {!rows.length && !orgs.error ? (
        <section className="panel">No matching hosts.</section>
      ) : null}
    </AdminShell>
  );
}
