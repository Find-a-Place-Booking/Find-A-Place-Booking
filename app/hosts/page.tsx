import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { properties } from "@/data/demo";

export default function HostsPage() {
  return (
    <>
      <div className="hosts-hero">
        <Header light />
        <div className="shell hosts-hero-grid">
          <div><p className="eyebrow">For independent hosts</p><h1>Keep control of the stay. Get a better place to be found.</h1><p>List your property in a regional booking network built around independent rentals. Manage the details that matter, take direct bookings and keep Find A Place Booking out of your booking revenue.</p><div className="host-hero-actions"><Link className="button button-light" href="/host/onboarding">Start your listing</Link><Link className="host-text-link" href="/host">Preview the host dashboard →</Link></div></div>
          <div className="host-hero-card"><small>Founding host plan</small><strong>$49<span>/month</span></strong><b>$490/year · additional properties $29/month</b><hr/><p>One property included. No Find A Place Booking commission on your booking revenue.</p><ul><li>Marketplace listing</li><li>Direct booking page</li><li>Availability calendar</li><li>Host dashboard</li><li>Guest messaging</li><li>Payments and reporting</li></ul></div>
        </div>
      </div>
      <main>
        <section className="hosts-value shell">
          <div className="section-heading"><div><p className="eyebrow dark">What you get</p><h2>The tools to run the listing, without turning the platform into your property manager.</h2></div></div>
          <div className="host-value-grid">
            <article><span>01</span><h3>Show up when the dates fit</h3><p>Travelers search by destination, dates and guests. If your property is open and fits the trip, it can show up.</p></article>
            <article><span>02</span><h3>Take the booking directly</h3><p>Your property has a complete booking page and checkout while you remain in control of rates, rules and payouts.</p></article>
            <article><span>03</span><h3>Manage it in one place</h3><p>Reservations, calendars, rates, fees, guest messages, reports and listing details live in the host dashboard.</p></article>
          </div>
        </section>
        <section className="host-preview-section">
          <div className="shell host-preview-grid"><div className="host-preview-copy"><p className="eyebrow dark">A real operating dashboard</p><h2>Know what is booked, what is open and what needs attention.</h2><p>The host side is built around the day-to-day work of running a short-term rental, not around marketing dashboards owners do not need.</p><Link className="under-link" href="/host">Open the host dashboard →</Link></div><div className="host-ui-preview"><div className="preview-top"><span>September</span><strong>$8,420 booked</strong></div><div className="preview-calendar">{Array.from({length:28},(_,i)=><span className={[4,5,11,12,18,19,20,25].includes(i)?"filled":""} key={i}>{i+1}</span>)}</div><div className="preview-booking"><img src={properties[0].image} alt="Property listing"/><div><small>Next arrival</small><strong>Megan Turner · Sep 4</strong><span>Fancy Hill Cabin 1</span></div></div></div></div>
        </section>
        <section className="hosts-steps shell">
          <div><p className="eyebrow dark">Getting started</p><h2>From property details to a live listing.</h2></div>
          <ol><li><span>1</span><div><strong>Create the host profile</strong><p>Business/contact information and who manages the property.</p></div></li><li><span>2</span><div><strong>Build the listing</strong><p>Photos, amenities, occupancy, rates, fees and house rules.</p></div></li><li><span>3</span><div><strong>Connect calendars and payments</strong><p>Keep availability aligned and connect the account that receives booking payouts.</p></div></li><li><span>4</span><div><strong>Submit for review</strong><p>Find A Place checks the listing, then it can appear in traveler searches.</p></div></li></ol>
        </section>
        <section className="host-cta"><div className="shell host-cta-inner"><div><p className="eyebrow">Ready to see the full setup?</p><h2>Build the listing the same way a real host would.</h2></div><div><p>The host setup walks through business details, property setup, rates, policies, calendars and payments.</p><Link className="button button-light" href="/host/onboarding">Start host setup →</Link></div></div></section>
      </main>
      <Footer />
    </>
  );
}
