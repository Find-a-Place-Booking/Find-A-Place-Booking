import Link from "next/link";

import { createPropertyFromOnboarding } from "@/app/host/properties/actions";
import { DashboardShell } from "@/components/DashboardShell";
import { getHostProperties, getPropertyCreationState } from "@/lib/host/properties";

function money(cents: number | null) {
  if (cents == null) return "Rate not set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function statusLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, properties, creation] = await Promise.all([searchParams, getHostProperties(), getPropertyCreationState()]);
  const readyDraft = creation.readyDraft;
  const canCreateFromDraft = Boolean(readyDraft && !readyDraft.created_property_id);

  return (
    <DashboardShell active="Properties" title="Properties">
      <div className="dash-toolbar">
        <div><p>Manage your listings, update property details and submit changes for review. Approved properties can be published to the Find A Place marketplace.</p></div>
        <div className="property-toolbar-actions"><Link className="button button-small button-quiet" href="/host/onboarding">Host setup</Link><Link className="button button-small" href="/host/properties/new">+ Add property</Link></div>
      </div>

      {error ? <div className="admin-message error">We couldn’t create the property. Please try again, or contact Find A Place if the problem continues.</div> : null}

      {canCreateFromDraft ? <section className="property-draft-import">
        <div><p className="eyebrow dark">Saved setup</p><h2>Create your first property from the details you already entered.</h2><p>We can carry over the property name, location, capacity, amenities, policies, rates, fees and calendar preference from your host setup so you do not have to enter them twice.</p></div>
        <form action={createPropertyFromOnboarding}><input type="hidden" name="organizationId" value={readyDraft!.organization_id} /><button className="button" type="submit">Create property from saved setup →</button></form>
      </section> : null}

      <section className="panel property-table real-property-table">
        {properties.length ? <div className="property-record-list">
          {properties.map((property) => <Link href={`/host/properties/${property.slug}`} className="property-record-row" key={property.id}>
            <div className="property-record-thumb">
              {property.coverImageUrl ? <img src={property.coverImageUrl} alt={`${property.name} cover`} /> : <span>{property.imageCount ? `${property.imageCount} photo${property.imageCount === 1 ? "" : "s"}` : "No photos"}</span>}
            </div>
            <div><strong>{property.name}</strong><span>{[property.propertyType, property.publicArea || [property.city, property.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Location not complete"}</span><small>{property.status === "PUBLISHED" ? "Live in marketplace" : "Not live in marketplace yet"}</small></div>
            <div><small>Status</small><strong>{statusLabel(property.status)}</strong></div>
            <div><small>Capacity</small><strong>{property.maxGuests ? `${property.maxGuests} guests` : "Not set"}</strong></div>
            <div><small>Weeknight</small><strong>{money(property.weeknightCents)}</strong></div>
            <b>Edit →</b>
          </Link>)}
        </div> : <div className="panel-empty panel-empty-large"><strong>No properties yet.</strong><span>{canCreateFromDraft ? "Use your saved setup above to create the first property." : "Add a property to start building your listing."}</span><Link className="button button-small" href="/host/properties/new">Add a property</Link></div>}
      </section>
    </DashboardShell>
  );
}
