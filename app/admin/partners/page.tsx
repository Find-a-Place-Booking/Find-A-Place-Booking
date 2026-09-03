import { AdminShell } from "@/components/AdminShell";
import { reviewPartnerVerification } from "@/app/admin/actions";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { cleanStatus, formatAdminDate } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/server";

type PendingOrganization = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  partner_status: string;
  commission_tier: string;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  organization_id: string;
  profile_id: string;
  role: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

export default async function AdminPartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const context = await getAdminContext();
  const canDecide = hasAnyAdminRole(context, ["SUPER_ADMIN", "PARTNER_ADMIN"]);
  const params = await searchParams;
  const supabase = await createClient();
  const { data: organizationData, error } = await supabase
    .from("organizations")
    .select("id,name,contact_email,contact_phone,partner_status,commission_tier,created_at,updated_at")
    .eq("partner_status", "PARTNER_PENDING")
    .order("updated_at", { ascending: true });

  const organizations = (organizationData ?? []) as PendingOrganization[];
  const organizationIds = organizations.map((organization) => organization.id);
  let members: MemberRow[] = [];
  let profiles: ProfileRow[] = [];

  if (organizationIds.length) {
    const { data: memberData } = await supabase
      .from("organization_members")
      .select("organization_id,profile_id,role")
      .in("organization_id", organizationIds)
      .eq("status", "ACTIVE");
    members = (memberData ?? []) as MemberRow[];

    const profileIds = [...new Set(members.map((member) => member.profile_id))];
    if (profileIds.length) {
      const { data: profileData } = await supabase.from("profiles").select("id,full_name,email,phone").in("id", profileIds);
      profiles = (profileData ?? []) as ProfileRow[];
    }
  }

  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  return (
    <AdminShell active="partners" eyebrow="Commission access" title="Partner verification" context={context}>
      {params.saved ? <div className="admin-message success">{params.saved}</div> : null}
      {params.error ? <div className="admin-message error">{params.error}</div> : null}

      <div className="admin-page-intro">
        <div><p className="eyebrow dark">Find A Place partner rate</p><h2>Manual verification only</h2><p>Hosts who claim an existing Find A Place relationship remain on <strong>STANDARD_7</strong> until an authorized reviewer confirms the membership. Approval changes the organization to <strong>PARTNER_5</strong> and writes a permanent audit event.</p></div>
        <div className="admin-role-note"><span>Your access</span><strong>{canDecide ? "Can approve partner rates" : "Read-only partner queue"}</strong><small>{context.roles.map(cleanStatus).join(" · ")}</small></div>
      </div>

      <section className="panel partner-verification-panel">
        <div className="panel-head"><div><p className="eyebrow dark">Waiting review</p><h2>Partner verification requests</h2></div><span className="status-pill status-muted">{organizations.length} pending</span></div>
        {error ? <div className="admin-message error">The partner queue could not be loaded.</div> : null}
        {!error && organizations.length ? (
          <div className="partner-request-list">
            {organizations.map((organization) => {
              const organizationMembers = members.filter((member) => member.organization_id === organization.id);
              const owner = organizationMembers.map((member) => ({ member, profile: profileMap.get(member.profile_id) })).find(({ member }) => member.role === "OWNER") ?? organizationMembers.map((member) => ({ member, profile: profileMap.get(member.profile_id) }))[0];
              return (
                <details className="partner-request-card" key={organization.id}>
                  <summary>
                    <span><strong>{organization.name}</strong><small>{owner?.profile?.full_name || owner?.profile?.email || "Owner identity not linked yet"}</small></span>
                    <span><b>7% pending</b><small>Requested {formatAdminDate(organization.updated_at)}</small></span>
                  </summary>
                  <div className="partner-request-body">
                    <div className="partner-match-grid">
                      <div><small>Organization email</small><strong>{organization.contact_email || "Not provided"}</strong></div>
                      <div><small>Organization phone</small><strong>{organization.contact_phone || "Not provided"}</strong></div>
                      <div><small>Owner email</small><strong>{owner?.profile?.email || "Not provided"}</strong></div>
                      <div><small>Owner phone</small><strong>{owner?.profile?.phone || "Not provided"}</strong></div>
                      <div><small>Current partner state</small><strong>{cleanStatus(organization.partner_status)}</strong></div>
                      <div><small>Current commission</small><strong>{cleanStatus(organization.commission_tier)}</strong></div>
                    </div>
                    {canDecide ? (
                      <form className="partner-review-form" action={reviewPartnerVerification}>
                        <input type="hidden" name="organization_id" value={organization.id} />
                        <label><span>Verification note <small>optional</small></span><textarea name="verification_note" placeholder="Membership matched by owner email, team confirmed by phone, reason kept at standard rate, etc." /></label>
                        <div className="partner-review-actions">
                          <button className="button button-small" type="submit" name="decision" value="approve">Approve partner — 5%</button>
                          <button className="button button-small button-quiet" type="submit" name="decision" value="standard">Keep standard — 7%</button>
                        </div>
                      </form>
                    ) : <div className="admin-message neutral">Your admin role can review the request, but only SUPER_ADMIN or PARTNER_ADMIN can change the commission tier.</div>}
                  </div>
                </details>
              );
            })}
          </div>
        ) : !error ? <div className="panel-empty"><strong>No verification requests waiting.</strong><span>This queue becomes active when Step 6 persists host organizations and partner claims.</span></div> : null}
      </section>

      <section className="panel admin-system-boundary">
        <p className="eyebrow dark">Existing partner import</p><h2>Preloaded matching comes later</h2><p className="muted">The architecture still reserves importing the existing 50–75+ Find A Place partner list and flagging likely matches. We will add that when host organizations/onboarding become real so we do not create a second temporary data model.</p>
      </section>
    </AdminShell>
  );
}
