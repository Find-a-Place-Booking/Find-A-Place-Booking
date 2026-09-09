import Link from "next/link";
import { notFound } from "next/navigation";

import { archiveProperty, submitPropertyForReview } from "@/app/host/properties/actions";
import { DashboardShell } from "@/components/DashboardShell";
import { PropertyEditor } from "@/components/PropertyEditor";
import { getHostPropertyBySlug } from "@/lib/host/properties";

function readable(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function ManagePropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ created?: string; submitted?: string; review_error?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const property = await getHostPropertyBySlug(slug);
  if (!property) notFound();

  const canSubmit = ["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(property.status);
  const ready = canSubmit && property.submissionIssues.length === 0;

  return <DashboardShell active="Properties" title={property.form.name || "Property"} eyebrow="Property editor">
    <div className="property-editor-heading">
      <Link href="/host/properties">← All properties</Link>
      {query.created ? <span className="status-pill">Real property created</span> : <span className="status-pill status-muted">{readable(property.status)}</span>}
    </div>

    {query.submitted ? <div className="admin-message success"><strong>Submitted for review.</strong> The Find A Place team can now review this listing. Editing is locked until they approve it or return it for changes.</div> : null}
    {query.review_error ? <div className="admin-message error">{query.review_error}</div> : null}

    <PropertyEditor initial={property} />

    <section className="panel property-review-submit">
      <div>
        <p className="eyebrow dark">Listing review</p>
        <h2>{property.status === "PENDING_REVIEW" ? "Review in progress" : property.status === "APPROVED" ? "Approved and waiting for publication" : property.status === "PUBLISHED" ? "Published to the marketplace" : property.status === "PAUSED" ? "Publication paused" : "Submit this listing to Find A Place"}</h2>
        {canSubmit ? property.submissionIssues.length ? <><p>Finish the minimum listing details below before sending it to the admin team.</p><div className="review-readiness-list">{property.submissionIssues.map((issue) => <span key={issue}>• {issue}</span>)}</div></> : <p>The minimum review requirements are complete. Submission sends the current saved property record to the Find A Place admin queue.</p> : <p>{property.status === "PENDING_REVIEW" ? "The listing is locked while the admin team reviews the saved version." : property.status === "APPROVED" ? "Approval does not automatically make a listing public. An authorized admin must publish it separately." : property.status === "PUBLISHED" ? "The listing is guest-visible, but availability and checkout are not enabled yet." : "This listing is not currently editable from the host side."}</p>}
        {property.reviewNote ? <div className="review-note-inline"><strong>Latest review note</strong><span>{property.reviewNote}</span></div> : null}
      </div>
      {canSubmit ? <form action={submitPropertyForReview}>
        <input type="hidden" name="propertyId" value={property.propertyId} />
        <input type="hidden" name="slug" value={property.form.slug} />
        <button className="button" type="submit" disabled={!ready}>Submit for review →</button>
      </form> : null}
    </section>

    {canSubmit ? <section className="panel property-danger-zone">
      <div><p className="eyebrow dark">Property lifecycle</p><h2>Archive this property</h2><p>Archiving removes it from the active host property list and prevents future publication. It preserves the database/audit record instead of permanently deleting history.</p></div>
      <form action={archiveProperty}><input type="hidden" name="propertyId" value={property.propertyId} /><button className="button button-quiet" type="submit">Archive property</button></form>
    </section> : null}
  </DashboardShell>;
}
