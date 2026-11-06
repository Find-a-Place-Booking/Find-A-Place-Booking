import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAdminAssistedPropertyDraft, saveHostDraftAssistance } from "../actions";

export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const inputFields = [
  { name: "hostName", label: "Business or host name", max: 200 },
  { name: "contactName", label: "Host contact name", max: 200 },
  { name: "email", label: "Contact email", max: 250 },
  { name: "phone", label: "Contact phone", max: 100 },
  { name: "businessLocation", label: "Host business location", max: 200 },
  { name: "propertyName", label: "Property name", max: 180 },
  { name: "propertyType", label: "Type of stay", max: 80 },
  { name: "publicArea", label: "Public area", max: 180 },
  { name: "street", label: "Street address", max: 240 },
  { name: "city", label: "City", max: 120 },
  { name: "state", label: "State (two-letter code)", max: 2 },
  { name: "postal", label: "ZIP code", max: 24 },
  { name: "maxGuests", label: "Maximum guests", max: 3 },
  { name: "weeknight", label: "Weeknight ($)", max: 20 },
  { name: "weekend", label: "Weekend ($)", max: 20 },
];

export default async function AdminAssistHost({
  params, searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const context = await getAdminContext();
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) redirect("/admin");
  const [{ organizationId }, query] = await Promise.all([params, searchParams]);
  if (!uuidPattern.test(organizationId)) notFound();
  const admin = createAdminClient();
  const [{ data: organization }, { data: draft, error: draftError }, { data: members }] = await Promise.all([
    admin.from("organizations").select("id,name,status,partner_status,commission_tier,contact_email").eq("id", organizationId).maybeSingle(),
    admin.from("host_onboarding_drafts")
      .select("id,organization_id,status,current_step,form_data,authority_confirmed,host_policy_accepted_at,created_property_id,updated_at")
      .eq("organization_id", organizationId).maybeSingle(),
    admin.from("organization_members").select("profile_id,role,status").eq("organization_id", organizationId).eq("status", "ACTIVE"),
  ]);
  if (!organization) notFound();
  const owners = (members || []).filter((member) => member.role === "OWNER");
  const form = (draft?.form_data || {}) as Record<string, unknown>;
  const existingProperty = draft?.created_property_id || null;
  const noHostConsent = !draft?.host_policy_accepted_at || !draft?.authority_confirmed;
  return (
    <AdminShell active="publishing" eyebrow="Host onboarding support" title={organization.name} context={context}>
      <p><Link href="/admin/publishing">← Publishing queue</Link> · <Link href="/admin/hosts">All host accounts</Link></p>
      {query.saved ? <div className="admin-message success">{query.saved}</div> : null}
      {query.error ? <div className="admin-message error">{query.error}</div> : null}
      <section className="panel">
        <p className="eyebrow dark">Help the host finish</p>
        <h2>{draft ? `Host onboarding: ${draft.status}` : "Onboarding not started"}</h2>
        {draftError ? <p className="admin-message error">{draftError.message}</p> : null}
        <div className="admin-state-stack">
          <div><span>Saved step</span><strong>{draft ? `${Number(draft.current_step) + 1} of 11` : "No saved steps"}</strong></div>
          <div><span>Host Agreement accepted by host</span><strong>{draft?.host_policy_accepted_at ? "Yes" : "No — host action required"}</strong></div>
          <div><span>Authority to list confirmed by host</span><strong>{draft?.authority_confirmed ? "Yes" : "No — host action required"}</strong></div>
          <div><span>Property created</span><strong>{existingProperty ? "Yes" : "Not yet"}</strong></div>
          <div><span>Active owners</span><strong>{owners.length}</strong></div>
        </div>
        {noHostConsent ? <p className="admin-message neutral">This account still needs the host's personal consent/confirmation before publication. Admins cannot grant it on their behalf.</p> : null}
        {owners.length ? <p>For account-specific help, open the <Link href={`/admin/hosts/${owners[0].profile_id}`}>host profile</Link>.</p> : null}
        <p className="muted">This page is for helping an unfinished host draft. It cannot directly accept contracts, connect Stripe, certify lodging taxes, or bypass an unavailable calendar.</p>
      </section>
      {existingProperty ? (
        <section className="panel">
          <h2>A property already exists for this host</h2>
          <p>Use the assisted property editor for missing photos, rates, calendar preferences, descriptions and publishing.</p>
          <Link className="button" href={`/admin/publishing/${existingProperty}`}>Complete the property →</Link>
        </section>
      ) : draft ? (
        <>
          <section className="panel">
            <p className="eyebrow dark">Admin assistance</p>
            <h2>Fill in the factual details</h2>
            <p className="muted">Existing values are shown. Empty boxes are ignored, not erased. All changes are audit-logged. The host will still need to accept any agreements and verify their payment and tax setup.</p>
            <form className="settings-form" action={saveHostDraftAssistance}>
              <input type="hidden" name="organization_id" value={organizationId} />
              {inputFields.map(({ name, label, max }) => (
                <label key={name}>
                  <span>{label}</span>
                  <input name={name} maxLength={max} defaultValue={typeof form[name] === "string" ? String(form[name]) : ""} />
                </label>
              ))}
              <label><span>Description</span><textarea name="description" rows={4} maxLength={5000} defaultValue={typeof form.description === "string" ? form.description : ""} /></label>
              <label><span>Detailed cancellation/refund terms</span><textarea name="cancellation" rows={4} maxLength={5000} defaultValue={typeof form.cancellation === "string" ? form.cancellation : ""} /></label>
              <label><span>Admin help reason (required)</span><input name="reason" minLength={8} maxLength={500} required placeholder="Host requested help finishing listing details" /></label>
              <button className="button" type="submit">Save host draft details</button>
            </form>
          </section>
          <section className="panel">
            <p className="eyebrow dark">Prepare draft property</p>
            <h2>Create a property record for this host</h2>
            <p>This creates an unpublished DRAFT using the saved host details. It does <strong>not</strong> complete the host's agreement, enable payments or publish the stay.</p>
            <form className="settings-form" action={createAdminAssistedPropertyDraft}>
              <input type="hidden" name="organization_id" value={organizationId} />
              <label><span>Host approval and reason for preparing draft (required)</span>
                <input name="reason" minLength={8} required maxLength={500} placeholder="Host asked us to prepare their listing for them" /></label>
              <button className="button button-quiet" type="submit">Create unpublished property draft</button>
            </form>
          </section>
        </>
      ) : (
        <section className="panel"><h2>No onboarding draft found</h2><p>The host must start onboarding and accept the required agreements before their property can be published. Contact the host through their account profile.</p></section>
      )}
    </AdminShell>
  );
}
