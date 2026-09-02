import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";
import { hostListings } from "@/data/demo";

export function generateStaticParams() { return hostListings.map((property) => ({ slug: property.slug })); }

export default async function ManagePropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const property = hostListings.find((item) => item.slug === slug);
  if (!property) notFound();
  return <DashboardShell active="Properties" title={property.name} eyebrow="Manage property">
    <div className="property-editor-top"><div><span className="status-pill">Live</span><p>Last updated today · Calendar synced</p></div><div><Link className="button button-small button-quiet" href="/host/properties">Back to properties</Link><button className="button button-small" type="button">Save changes</button></div></div>
    <div className="property-editor-layout">
      <section className="panel editor-main">
        <div className="editor-tabs"><button className="active" type="button">Listing</button><button type="button">Photos</button><button type="button">Amenities</button><button type="button">Policies</button><button type="button">SEO & share</button></div>
        <div className="editor-section"><p className="eyebrow dark">Listing details</p><h2>What guests see first</h2><div className="field-grid onboarding-fields"><label className="full"><span>Property name</span><input defaultValue={property.name}/></label><label><span>Property type</span><select defaultValue={property.type}><option>{property.type}</option><option>Cabin</option><option>House</option><option>Cottage</option><option>Lodge</option><option>RV Site</option></select></label><label><span>Location</span><input defaultValue={property.location}/></label><label className="full"><span>Short description</span><textarea defaultValue={property.blurb}/></label></div></div>
        <div className="editor-section"><p className="eyebrow dark">Stay basics</p><div className="field-grid onboarding-fields"><label><span>Guests</span><input type="number" defaultValue={property.sleeps}/></label><label><span>Bedrooms</span><input type="number" defaultValue={property.bedrooms}/></label><label><span>Bathrooms</span><input type="number" defaultValue={property.baths}/></label><label><span>Base nightly rate</span><div className="money-input"><b>$</b><input defaultValue={property.price}/></div></label></div></div>
        <div className="editor-section"><p className="eyebrow dark">Highlights</p><div className="amenity-picker">{["Hot tub","Pet friendly","Fire pit","Waterfront","Wi-Fi","Full kitchen","Self check-in","Boat parking","Full hookup","Big-rig friendly"].map((item,index)=><label key={item}><input type="checkbox" defaultChecked={property.tags.includes(item) || [2,4,5,6].includes(index)}/><span>{item}</span></label>)}</div></div>
      </section>
      <aside className="editor-side">
        <div className="panel listing-health"><p className="eyebrow dark">Listing health</p><strong>92%</strong><span>Ready for guests</span><div className="health-bar"><i/></div><small>Add two more photos to improve the listing.</small></div>
        <div className="panel cover-preview"><img src={property.image} alt={property.name}/><small>Cover photo</small><strong>{property.name}</strong><span>{property.location}</span><button type="button" className="button button-small button-quiet">Change cover</button></div>
        <div className="panel quick-links"><strong>Quick links</strong><Link href="/host/rates">Rates & fees →</Link><Link href="/host/calendar">Calendar →</Link><Link href="/host/reservations">Reservations →</Link></div>
      </aside>
    </div>
  </DashboardShell>;
}
