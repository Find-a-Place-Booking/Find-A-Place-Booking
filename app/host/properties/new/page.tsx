import Link from "next/link";

import { createBlankProperty } from "@/app/host/properties/actions";
import { DashboardShell } from "@/components/DashboardShell";
import { getManagedOrganizations } from "@/lib/host/properties";
import { propertyTypes } from "@/lib/property/catalog";

export default async function NewPropertyPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, organizations] = await Promise.all([searchParams, getManagedOrganizations()]);
  const primary = organizations[0];

  return <DashboardShell active="Properties" title="Add property" eyebrow="Property setup">
    <div className="admin-detail-back"><Link href="/host/properties">← Back to properties</Link></div>
    <section className="panel new-property-card">
      <p className="eyebrow dark">New property</p><h2>Start the property listing.</h2><p>Add the name, type and public area first. The full editor opens next so you can finish the address, capacity, photos, amenities, policies, rates and notification settings.</p>
      {error ? <div className="admin-message error">Could not create the property. Check the required fields and try again.</div> : null}
      {primary ? <form action={createBlankProperty} className="field-grid onboarding-fields new-property-form">
        <input type="hidden" name="organizationId" value={primary.id} />
        <label className="full"><span>Host organization</span><input value={primary.name} readOnly /></label>
        <label className="full"><span>Property / listing name</span><input name="name" required maxLength={180} placeholder="Pine Hollow Ridge Cabin" /></label>
        <label><span>Property type</span><select name="propertyType" defaultValue=""><option value="">Select type</option>{propertyTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label><span>Public area</span><input name="publicArea" maxLength={180} placeholder="Hot Springs, AR" /></label>
        <div className="full new-property-actions"><Link className="button button-quiet" href="/host/properties">Cancel</Link><button className="button" type="submit">Create property →</button></div>
      </form> : <div className="panel-empty"><strong>No host organization available.</strong><span>Complete host setup before creating a property.</span><Link className="button button-small" href="/host/onboarding">Open host setup</Link></div>}
    </section>
  </DashboardShell>;
}
