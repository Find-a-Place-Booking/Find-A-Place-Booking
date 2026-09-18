import Link from "next/link";

import { createPropertyFromOnboarding } from "@/app/host/properties/actions";
import { DashboardShell } from "@/components/DashboardShell";
import { getHostProperties, getPropertyCreationState } from "@/lib/host/properties";

function money(cents: number | null) {
  if (cents == null) return "Rate not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, properties, creation] = await Promise.all([searchParams, getHostProperties(), getPropertyCreationState()]);
  const readyDraft = creation.readyDraft;
  const canCreateFromDraft = Boolean(readyDraft && !readyDraft.created_property_id);

  return (
    <DashboardShell active="Properties" title="Properties">
      <div className="dash-toolbar">
        <div><p>Real property records now live in Supabase. Hosts can submit listings for admin review, and only approved properties can be published to the marketplace.</p></div>
        <div className="property-toolbar-actions"><Link className="button button-small button-quiet" href="/host/onboarding">Host setup</Link><Link className="button button-small" href="/host/properties/new">+ Add property</Link></div>
      </div>

      {error ? <div className="admin-message error">Property creation did not complete: {decodeURIComponent(error)}</div> : null}

      {canCreateFromDraft ? <section className="property-draft-import">
        <div><p className="eyebrow dark">Saved onboarding draft</p><h2>Create your first real property from setup</h2><p>Your property name, location, capacity, amenities, policies, rates, fees and calendar preference can be carried into the production property record without entering them again.</p></div>
        <form action={createPropertyFromOnboarding}><input type="hidden" name="organizationId" value={readyDraft!.organization_id} /><button className="button" type="submit">Create property from saved setup →</button></form>
      </section> : null}

      <section className="panel property-table real-property-table">
        {properties.length ? <div className="property-record-list">
          {properties.map((property) => <Link href={`/host/properties/${property.slug}`} className="property-record-row" key={property.id}>
            <div className="property-record-thumb">
              {property.coverImageUrl ? <img src={property.coverImageUrl} alt={`${property.name} cover`} /> : <span>{property.imageCount ? `${property.imageCount} photo${property.imageCount === 1 ? "" : "s"}` : "No photos"}</span>}
            </div>
            <div><strong>{property.name}</strong><span>{[property.propertyType, property.publicArea || [property.city, property.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Location not complete"}</span><small>/stays/{property.slug}</small></div>
            <div><small>Status</small><strong>{property.status.replaceAll("_", " ")}</strong></div>
            <div><small>Capacity</small><strong>{property.maxGuests ? `${property.maxGuests} guests` : "Not set"}</strong></div>
            <div><small>Weeknight</small><strong>{money(property.weeknightCents)}</strong></div>
            <b>Edit →</b>
          </Link>)}
        </div> : <div className="panel-empty panel-empty-large"><strong>No real property records yet.</strong><span>{canCreateFromDraft ? "Use the saved onboarding draft above to create the first property." : "Add a property to begin building the real listing record."}</span><Link className="button button-small" href="/host/properties/new">Add a property</Link></div>}
      </section>

      <div className="feature-callout"><div><p className="eyebrow">Property workflow</p><h2>Property review, publication, calendars, and controlled checkout are active.</h2><p>Each property keeps an immutable internal ID, stable shareable URL, structured details, private photo storage, canonical availability, and a snapshotted booking/payment record. Live money remains individually approved during the pilot.</p></div><div className="feature-checks"><span>✓ Stable booking slug</span><span>✓ Calendar sync</span><span>✓ Real photos</span><span>✓ Structured amenities</span><span>✓ Policies + rates</span><span>✓ Admin approval</span></div></div>
    </DashboardShell>
  );
}
