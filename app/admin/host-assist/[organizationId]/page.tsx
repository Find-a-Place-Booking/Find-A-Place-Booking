import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveHostDraftAssistance, createAdminAssistedPropertyDraft } from "../actions";
import styles from "../../publishing/PublishingFlow.module.css";

export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Field = { name: string; label: string; max?: number };
const propertyFields: Field[] = [
  { name: "propertyName", label: "Property name", max: 180 },
  { name: "propertyType", label: "Property type", max: 80 },
  { name: "publicArea", label: "Guest-facing area", max: 180 },
  { name: "street", label: "Street address", max: 240 },
  { name: "city", label: "City", max: 120 },
  { name: "state", label: "State (2 letters)", max: 2 },
  { name: "postal", label: "ZIP code", max: 24 },
  { name: "maxGuests", label: "Maximum guests", max: 3 },
];
const hostFields: Field[] = [
  { name: "hostName", label: "Host / business name", max: 200 },
  { name: "contactName", label: "Contact person", max: 200 },
  { name: "email", label: "Contact email", max: 250 },
  { name: "phone", label: "Phone number", max: 100 },
  { name: "businessLocation", label: "Business location", max: 200 },
];

function SaveDraftForm({ orgId, form, fields, extra }: {
  orgId: string;
  form: Record<string, unknown>;
  fields: Field[];
  extra?: React.ReactNode;
}) {
  return (
    <form action={saveHostDraftAssistance} className={styles.form}>
      <input type="hidden" name="organization_id" value={orgId} />
      {fields.map(({ name }) => (
        <input key={`original_${name}`} type="hidden" name={`original_${name}`}
          value={typeof form[name] === "string" ? form[name] as string : ""} />
      ))}
      <input type="hidden" name="original_description"
        value={typeof form.description === "string" ? form.description : ""} />
      <input type="hidden" name="original_cancellation"
        value={typeof form.cancellation === "string" ? form.cancellation : ""} />
      <div className={styles.fields}>
        {fields.map(({ name, label, max }) => (
          <label key={name}><span>{label}</span>
            <input name={name} maxLength={max || 250}
              defaultValue={typeof form[name] === "string" ? form[name] as string : ""} />
          </label>
        ))}
        {extra}
        <label className={styles.wide}><span>Reason for helping the host</span>
          <input name="reason" minLength={8} maxLength={500} required
            placeholder="Host requested help completing listing details" />
        </label>
      </div>
      <button className="button button-small" type="submit">Save changes</button>
    </form>
  );
}

export default async function AdminAssistHost({ params, searchParams }: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const context = await getAdminContext();
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) redirect("/admin");
  const [{ organizationId }, query] = await Promise.all([params, searchParams]);
  if (!uuidPattern.test(organizationId)) notFound();
  const admin = createAdminClient();
  const [{ data: organization }, { data: draft, error: draftError }, { data: members }] = await Promise.all([
    admin.from("organizations").select("id,name").eq("id", organizationId).maybeSingle(),
    admin.from("host_onboarding_drafts")
      .select("id,status,current_step,form_data,authority_confirmed,host_policy_accepted_at,created_property_id")
      .eq("organization_id", organizationId).maybeSingle(),
    admin.from("organization_members").select("profile_id,role").eq("organization_id", organizationId)
      .eq("status", "ACTIVE"),
  ]);
  if (!organization) notFound();
  const owner = (members || []).find((member) => member.role === "OWNER");
  const form = (draft?.form_data || {}) as Record<string, unknown>;
  const nameReady = typeof form.propertyName === "string" && form.propertyName.trim().length > 0;

  return (
    <AdminShell active="publishing" eyebrow="Host setup help" title={organization.name} context={context}>
      <div className={styles.page}>
        <Link className={styles.back} href="/admin/publishing">← Back to listings</Link>
        {query.saved ? <div className="admin-message success">{query.saved}</div> : null}
        {query.error ? <div className="admin-message error">{query.error}</div> : null}
        {draftError ? <div className="admin-message error">Unable to load this host's saved setup.</div> : null}
        <section className="panel">
          <div className={styles.heroText}>
            <h2>{draft?.created_property_id ? "This host already has a property" : draft ? "Help prepare their first listing" : "The host hasn't started setup"}</h2>
            <p className={styles.muted}>
              {draft ? `Their last saved step was ${Number(draft.current_step) + 1} of 11. ` : ""}
              You can save listing details. The host still controls their own agreements, Stripe connection and tax confirmation.
            </p>
            {draft && (!draft.host_policy_accepted_at || !draft.authority_confirmed) ? (
              <div className={styles.note}>Waiting on host: {[
                !draft.host_policy_accepted_at ? "accept the Host Agreement" : "",
                !draft.authority_confirmed ? "confirm permission to list the property" : "",
              ].filter(Boolean).join(" and ")}.</div>
            ) : null}
            {owner ? <Link href={`/admin/hosts/${owner.profile_id}`}>Open host account →</Link> : null}
          </div>
        </section>
        {draft?.created_property_id ? (
          <section className="panel">
            <h2 className={styles.sectionHeading}>Continue with the listing</h2>
            <p className={styles.sectionLead}>The property is already prepared, so continue in its publishing checklist.</p>
            <Link className="button" href={`/admin/publishing/${draft.created_property_id}`}>See what needs fixing</Link>
          </section>
        ) : draft ? (
          <>
            <details className={styles.details} open={!nameReady}>
              <summary>Property details {!nameReady ? "· add a name to get started" : ""}</summary>
              <div className={styles.detailsContent}>
                <SaveDraftForm orgId={organizationId} form={form} fields={propertyFields}
                  extra={<label className={styles.wide}><span>Description</span>
                    <textarea name="description" rows={4} maxLength={5000}
                      defaultValue={typeof form.description === "string" ? form.description : ""} />
                  </label>} />
              </div>
            </details>
            <details className={styles.details}>
              <summary>Nightly rates and cancellation policy</summary>
              <div className={styles.detailsContent}>
                <SaveDraftForm orgId={organizationId} form={form} fields={[
                  { name: "weeknight", label: "Weeknight price ($)" },
                  { name: "weekend", label: "Weekend price ($)" },
                ]} extra={<label className={styles.wide}><span>Cancellation/refund terms</span>
                  <textarea name="cancellation" rows={4} maxLength={5000}
                    defaultValue={typeof form.cancellation === "string" ? form.cancellation : ""} />
                </label>} />
              </div>
            </details>
            <details className={styles.details}>
              <summary>Host contact details</summary>
              <div className={styles.detailsContent}>
                <SaveDraftForm orgId={organizationId} form={form} fields={hostFields} />
              </div>
            </details>
            <section className="panel">
              <h2 className={styles.sectionHeading}>Create the unpublished draft</h2>
              <p className={styles.sectionLead}>This prepares a property record, not a live listing. The remaining publishing checks still apply.</p>
              <form action={createAdminAssistedPropertyDraft} className={styles.form}>
                <input type="hidden" name="organization_id" value={organizationId} />
                <label><span>Reason for preparing the property</span>
                  <input name="reason" minLength={8} maxLength={500} required
                    placeholder="Host requested that we prepare the listing" />
                </label>
                {nameReady ? <button className="button" type="submit">Create draft & check readiness</button>
                  : <p className={styles.note}>Save the property name first, then you can create the draft.</p>}
              </form>
            </section>
          </>
        ) : <section className="panel"><p>Ask the host to begin setup from their dashboard. After they save their first details, you can help complete them here.</p></section>}
      </div>
    </AdminShell>
  );
}
