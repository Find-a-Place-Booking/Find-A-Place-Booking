import { notFound } from "next/navigation";
import { properties } from "@/data/catalog";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BookingCard } from "@/components/BookingCard";
import { PropertyActions } from "@/components/PropertyActions";

export function generateStaticParams() { return properties.map((property) => ({ slug: property.slug })); }

export default async function PropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const property = properties.find((item) => item.slug === slug);
  if (!property) notFound();

  return <><Header /><main className="property-page"><div className="shell property-title"><div><p className="eyebrow dark">{property.region} · {property.type}</p><h1>{property.name}</h1><p>{property.location} · ★ {property.rating} ({property.reviews} reviews)</p></div><PropertyActions /></div><div className="shell gallery"><img className="gallery-main" src={property.image} alt={`${property.name} exterior`}/><img src={property.image2} alt={`${property.name} surroundings`}/><img src={property.image3} alt={`${property.name} interior`}/><div className="gallery-detail"><span>+</span><strong>More photos</strong></div></div><div className="shell property-content"><article className="property-copy"><div className="stay-summary"><div><strong>{property.sleeps}</strong><span>guests</span></div>{property.bedrooms > 0 && <div><strong>{property.bedrooms}</strong><span>bedrooms</span></div>}<div><strong>{property.baths}</strong><span>baths</span></div><div><strong>{property.type}</strong><span>stay type</span></div></div><h2>A place that fits the trip.</h2><p className="lead-copy">{property.blurb}</p><hr/><h3>What this place offers</h3><div className="amenity-grid">{property.tags.map((amenity)=><span key={amenity}>✓ {amenity}</span>)}</div><hr/><h3>Know before you book</h3><p>Selected host policies, check-in details, cancellation terms and any custom rules will be shown here from the property record.</p><hr/><div className="host-block"><div className="host-avatar">{property.hostName.split(" ").slice(0,2).map((word)=>word[0]).join("")}</div><div><small>Hosted by</small><h3>{property.hostName}</h3><p>Independent property · Find A Place Booking host</p></div></div></article><BookingCard slug={property.slug} price={property.price} rating={property.rating} /></div></main><Footer /></>;
}
