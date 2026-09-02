import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { hostListings } from "@/data/demo";

export default function PropertiesPage(){
  return <DashboardShell active="Properties" title="Properties">
    <div className="dash-toolbar"><div><p>Manage listing details, photos, occupancy, amenities and what guests see before they book.</p></div><Link className="button button-small" href="/host/onboarding">+ Add property</Link></div>
    <section className="panel property-table">
      {hostListings.map((p)=><div className="property-admin-row" key={p.slug}><img src={p.image} alt=""/><div><strong>{p.name}</strong><span>{p.location} · {p.type}</span></div><div><small>From</small><strong>${p.price}/night</strong></div><div><small>Calendar</small><strong className="good">Synced</strong></div><div><small>Status</small><strong>Live</strong></div><Link href={`/host/properties/${p.slug}`}>Manage →</Link></div>)}
    </section>
    <div className="feature-callout"><div><p className="eyebrow">Direct booking pages</p><h2>Every property has one place to tell the story and take the reservation.</h2><p>Hosts control the information guests rely on while Find A Place Booking handles discovery, checkout and reservation flow.</p></div><div className="feature-checks"><span>✓ Seasonal rates</span><span>✓ Minimum stays</span><span>✓ Cleaning / pet fees</span><span>✓ Promo codes</span><span>✓ Tax settings</span><span>✓ Channel calendars</span></div></div>
  </DashboardShell>
}
