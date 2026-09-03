import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function HostsPage() {
  return (
    <>
      <div className="hosts-hero">
        <Header light />
        <div className="shell hosts-hero-grid">
          <div><p className="eyebrow">For independent hosts</p><h1>Keep control of the stay. Get a better place to be found.</h1><p>List your property in a regional booking network built around independent rentals. Manage the details that matter, receive guest payouts through your connected payment account, and pay Find A Place Booking only when the platform produces a booking.</p><div className="host-hero-actions"><Link className="button button-light" href="/host/onboarding">Start your listing</Link><Link className="host-text-link" href="/host">Open the host portal →</Link></div></div>
          <div className="host-hero-card"><small>Platform commission</small><strong>5%<span> partner stays</span></strong><b>7% for other Find A Place Booking hosts</b><hr/><p>Commission is calculated from the nightly lodging subtotal after host discounts, not legitimate cleaning fees, pet fees, taxes, refundable deposits or optional add-ons.</p><ul><li>Marketplace listing</li><li>Branded booking page</li><li>Availability calendar</li><li>Host dashboard</li><li>Guest messaging</li><li>Payments and reporting</li></ul></div>
        </div>
      </div>
      <main>
        <section className="hosts-value shell"><div className="section-heading"><div><p className="eyebrow dark">What you get</p><h2>The tools to run the listing, without turning the platform into your property manager.</h2></div></div><div className="host-value-grid"><article><span>01</span><h3>Show up when the dates fit</h3><p>Travelers search by destination, dates and guests. If your property is open and fits the trip, it can show up.</p></article><article><span>02</span><h3>Take the booking here</h3><p>Your property has a complete booking page and checkout while you remain in control of rates, rules and payouts.</p></article><article><span>03</span><h3>Manage it in one place</h3><p>Reservations, calendars, rates, fees, guest messages, reports and listing details live in the host dashboard.</p></article></div></section>
        <section className="host-preview-section"><div className="shell host-preview-grid"><div className="host-preview-copy"><p className="eyebrow dark">A real operating dashboard</p><h2>Know what is booked, what is open and what needs attention.</h2><p>The host side is built around the day-to-day work of running a short-term rental, with the important information surfaced first and deeper detail available when needed.</p><Link className="under-link" href="/host">Open the host portal →</Link></div><div className="host-ui-preview empty-host-preview"><div className="preview-top"><span>Host overview</span><strong>Ready for your first property</strong></div><div className="preview-calendar">{Array.from({length:28},(_,i)=><span key={i}>{i+1}</span>)}</div><div className="preview-booking empty-preview-booking"><div><small>Next step</small><strong>Add a property to begin</strong><span>Bookings and arrivals will appear here automatically.</span></div></div></div></div></section>
        <section className="hosts-steps shell"><div><p className="eyebrow dark">Getting started</p><h2>From property details to a live listing.</h2></div><ol><li><span>1</span><div><strong>Create the host profile</strong><p>Business/contact information and who manages the property.</p></div></li><li><span>2</span><div><strong>Build the listing</strong><p>Photos, amenities, occupancy, rates, fees and selected house rules.</p></div></li><li><span>3</span><div><strong>Connect calendars and payments</strong><p>Keep availability aligned and connect the account that receives booking payouts.</p></div></li><li><span>4</span><div><strong>Submit for review</strong><p>Find A Place checks the listing, then it can appear in traveler searches.</p></div></li></ol></section>
        <section className="host-cta"><div className="shell host-cta-inner"><div><p className="eyebrow">Ready to set up a stay?</p><h2>Build the listing with guided selections instead of a wall of forms.</h2></div><div><p>The host setup walks through business details, property setup, amenities, rates, policies, calendars and payments.</p><Link className="button button-light" href="/host/onboarding">Start host setup →</Link></div></div></section>
      </main>
      <Footer />
    </>
  );
}
