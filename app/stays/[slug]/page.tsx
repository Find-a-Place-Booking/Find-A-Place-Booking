import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { properties } from "@/data/demo";
import { BookingCard } from "@/components/BookingCard";
import { PropertyActions } from "@/components/PropertyActions";

export function generateStaticParams() { return properties.map((p) => ({ slug: p.slug })); }

export default async function PropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = properties.find((x) => x.slug === slug);
  if (!p) notFound();
  return (
    <><Header /><main className="property-page"><div className="shell property-title"><div><p className="eyebrow dark">{p.region} · {p.type}</p><h1>{p.name}</h1><p>{p.location} · ★ {p.rating} ({p.reviews} reviews)</p></div><PropertyActions /></div>
      <div className="shell gallery"><img className="gallery-main" src={p.image} alt={`${p.name} exterior`}/><img src={p.image2} alt={`${p.name} surroundings`}/><img src={p.image3} alt={`${p.name} interior`}/><div className="gallery-detail"><span>+</span><strong>12 photos</strong></div></div>
      <div className="shell property-content"><article className="property-copy"><div className="stay-summary"><div><strong>{p.sleeps}</strong><span>guests</span></div>{p.bedrooms > 0 && <div><strong>{p.bedrooms}</strong><span>bedrooms</span></div>}<div><strong>{p.baths}</strong><span>baths</span></div><div><strong>{p.type}</strong><span>stay type</span></div></div><h2>A place that fits the trip.</h2><p className="lead-copy">{p.blurb}</p><hr/><h3>What this place offers</h3><div className="amenity-grid">{[...p.tags,"Fast Wi‑Fi","Free parking","Coffee setup","Outdoor space","Self check‑in"].slice(0,8).map(a=><span key={a}>✓ {a}</span>)}</div><hr/><h3>Know before you book</h3><div className="rule-grid"><div><strong>Check-in</strong><span>After 3:00 PM</span></div><div><strong>Checkout</strong><span>By 11:00 AM</span></div><div><strong>Cancellation</strong><span>Host policy shown at checkout</span></div><div><strong>Rental terms</strong><span>Set by the property owner</span></div></div><hr/><div className="host-block"><div className="host-avatar">{p.hostName.split(" ").slice(0,2).map(x=>x[0]).join("")}</div><div><small>Hosted by</small><h3>{p.hostName}</h3><p>Independent property · Find A Place Booking host</p></div></div></article>
      <BookingCard slug={p.slug} price={p.price} rating={p.rating} /></div></main><Footer /></>
  );
}
