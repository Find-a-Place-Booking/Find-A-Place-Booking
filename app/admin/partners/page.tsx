import { setPartnerCommission } from "@/app/admin/partners/actions";
import { AdminShell } from "@/components/AdminShell";
import {
  getAdminContext,
  hasAnyAdminRole,
} from "@/lib/admin/context";
import { formatAdminDate } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/server";

type OrganizationRow = {
  id: string;
  name: string;
  status: string;
  contact_email: string | null;
  contact_phone: string | null;
  partner_status: string;
  commission_tier: string;
  partner_verified_at: string | null;
  partner_verification_note: string | null;
  created_at: string;
};

export default async function AdminPartnersPage({
  searchParams,
}: {
  searchParams: Promise<{
    saved?: string;
    error?: string;
  }>;
}) {
  const context = await getAdminContext();
  const canChange = hasAnyAdminRole(context, [
    "SUPER_ADMIN",
    "PARTNER_ADMIN",
  ]);
  const params = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id,name,status,contact_email,contact_phone,partner_status,commission_tier,partner_verified_at,partner_verification_note,created_at",
    )
    .neq("status", "ARCHIVED")
    .order("created_at", { ascending: false });

  const organizations = (data ?? []) as OrganizationRow[];
  const partners = organizations.filter(
    (organization) =>
      organization.partner_status === "VERIFIED" &&
      organization.commission_tier === "PARTNER_5",
  );

  return (
    <AdminShell
      active="partners"
      eyebrow="Internal commission controls"
      title="Partner rates"
      context={context}
    >
      {params.saved ? (
        <div className="admin-message success">
          {params.saved}
        </div>
      ) : null}

      {params.error ? (
        <div className="admin-message error">
          {params.error}
        </div>
      ) : null}

      <div className="admin-page-intro">
        <div>
          <p className="eyebrow dark">Internal only</p>
          <h2>7% is the standard host commission.</h2>
          <p>
            The 5% partner rate is not a host enrollment option and is
            not advertised during onboarding. Authorized Find A Place
            staff may assign it to launch partners or other hosts we
            choose to approve.
          </p>
        </div>
        <div className="admin-role-note">
          <span>Current partner accounts</span>
          <strong>{partners.length}</strong>
          <small>
            {canChange
              ? "You can change partner rates"
              : "Read only"}
          </small>
        </div>
      </div>

      <section className="panel partner-verification-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Host organizations</p>
            <h2>Commission assignment</h2>
          </div>
          <span className="status-pill status-muted">
            {organizations.length} organizations
          </span>
        </div>

        {error ? (
          <div className="admin-message error">
            Host organizations could not be loaded.
          </div>
        ) : null}

        {!error && organizations.length ? (
          <div className="partner-request-list">
            {organizations.map((organization) => {
              const isPartner =
                organization.partner_status === "VERIFIED" &&
                organization.commission_tier === "PARTNER_5";

              return (
                <details
                  className="partner-request-card"
                  key={organization.id}
                >
                  <summary>
                    <span>
                      <strong>{organization.name}</strong>
                      <small>
                        {organization.contact_email ||
                          organization.contact_phone ||
                          "No contact saved"}
                      </small>
                    </span>
                    <span>
                      <b>{isPartner ? "5% Partner" : "7% Standard"}</b>
                      <small>
                        Added {formatAdminDate(organization.created_at)}
                      </small>
                    </span>
                  </summary>

                  <div className="partner-request-body">
                    <div className="partner-match-grid">
                      <div>
                        <small>Organization</small>
                        <strong>{organization.name}</strong>
                      </div>
                      <div>
                        <small>Account status</small>
                        <strong>{organization.status}</strong>
                      </div>
                      <div>
                        <small>Current commission</small>
                        <strong>
                          {isPartner ? "5%" : "7%"}
                        </strong>
                      </div>
                      <div>
                        <small>Partner flag</small>
                        <strong>
                          {isPartner ? "Partner" : "Not partner"}
                        </strong>
                      </div>
                      {organization.partner_verified_at ? (
                        <div>
                          <small>Partner assigned</small>
                          <strong>
                            {formatAdminDate(
                              organization.partner_verified_at,
                            )}
                          </strong>
                        </div>
                      ) : null}
                      {organization.partner_verification_note ? (
                        <div>
                          <small>Internal note</small>
                          <strong>
                            {organization.partner_verification_note}
                          </strong>
                        </div>
                      ) : null}
                    </div>

                    {canChange ? (
                      <form
                        className="partner-review-form"
                        action={setPartnerCommission}
                      >
                        <input
                          type="hidden"
                          name="organization_id"
                          value={organization.id}
                        />
                        <label>
                          <span>
                            Internal reason / note{" "}
                            <small>optional</small>
                          </span>
                          <textarea
                            name="note"
                            placeholder="Launch partner, approved manually, standard rate restored, etc."
                          />
                        </label>
                        <div className="partner-review-actions">
                          {!isPartner ? (
                            <button
                              className="button button-small"
                              type="submit"
                              name="rate"
                              value="partner"
                            >
                              Set partner rate — 5%
                            </button>
                          ) : (
                            <button
                              className="button button-small button-quiet"
                              type="submit"
                              name="rate"
                              value="standard"
                            >
                              Return to standard — 7%
                            </button>
                          )}
                        </div>
                      </form>
                    ) : (
                      <div className="admin-message neutral">
                        Only SUPER_ADMIN or PARTNER_ADMIN can change
                        commission assignments.
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        ) : !error ? (
          <div className="panel-empty">
            <strong>No host organizations yet.</strong>
          </div>
        ) : null}
      </section>
    </AdminShell>
  );
}
