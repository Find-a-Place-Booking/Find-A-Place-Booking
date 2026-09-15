import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function HostsPage() {
  return (
    <>
      <div className="hosts-hero">
        <Header light />
        <div className="shell hosts-hero-grid">
          <div><p className="eyebrow">For independent hosts</p><h1>Your place should show up when someone is planning the trip.</h1><p>Maybe they’re coming for the lake, the river, a trail, a small town or just a quiet weekend away. Find A Place helps the right stay show up around that trip, while you keep control of your property, rates, rules and payouts.</p><div className="host-hero-actions"><Link className="button button-light" href="/host/sign-up?next=%2Fhost%2Fonboarding">Start your listing</Link><Link className="host-text-link" href="/host/sign-in">Open the host portal →</Link></div></div>
          <div className="host-hero-card"><small>Platform commission</small><strong>5%<span> verified partner stays</span></strong><b>7% for other Find A Place Booking hosts</b><hr/><p>Commission is calculated from the nightly lodging subtotal after host discounts, not legitimate cleaning fees, pet fees, taxes, refundable deposits or optional add-ons.</p><ul><li>Marketplace listing</li><li>Branded booking page</li><li>Availability calendar</li><li>Host dashboard</li><li>Guest messaging</li><li>Payments and reporting</li></ul></div>
        </div>
      </div>
      <main>
        <section className="hosts-value shell"><div className="section-heading"><div><p className="eyebrow dark">What Find A Place handles</p><h2>Built to help the right guest find the right stay.</h2></div></div><div className="host-value-grid"><article><span>01</span><h3>Be there when the trip starts</h3><p>Travelers search the place, dates and group first. When your property fits, it can meet them right there.</p></article><article><span>02</span><h3>Give them the full picture</h3><p>Photos, amenities, house rules, rates and booking details live together on one complete property page.</p></article><article><span>03</span><h3>Keep the work in one place</h3><p>Reservations, calendars, rates, fees, guest messages, reports and listing details stay in your host dashboard.</p></article></div></section>
        <section className="host-preview-section"><div className="shell host-preview-grid"><div className="host-preview-copy"><p className="eyebrow dark">Built for the day-to-day</p><h2>Know what’s booked, what’s open and what needs your attention.</h2><p>The host side stays practical on purpose. The things you need most are up front, with the deeper details there when you need them.</p><Link className="under-link" href="/host/sign-in">Open the host portal →</Link></div><div className="host-ui-preview empty-host-preview"><div className="preview-top"><span>Host overview</span><strong>Ready for your first property</strong></div><div className="preview-calendar">{Array.from({length:28},(_,i)=><span key={i}>{i+1}</span>)}</div><div className="preview-booking empty-preview-booking"><div><small>Next step</small><strong>Add a property to begin</strong><span>Bookings and arrivals will appear here automatically.</span></div></div></div></div></section>
        <section className="hosts-steps shell"><div><p className="eyebrow dark">Getting your place ready</p><h2>From your property details to a stay travelers can find.</h2></div><ol><li><span>1</span><div><strong>Tell us who’s hosting</strong><p>Add the business/contact information and who manages the property.</p></div></li><li><span>2</span><div><strong>Build the stay</strong><p>Add photos, amenities, occupancy, rates, fees and the house rules guests need to know.</p></div></li><li><span>3</span><div><strong>Connect calendars and payments</strong><p>Keep availability aligned and connect the account that receives booking payouts.</p></div></li><li><span>4</span><div><strong>Send it for review</strong><p>Find A Place checks the listing, then it can appear in traveler searches.</p></div></li></ol></section>
        <section className="host-cta"><div className="shell host-cta-inner"><div><p className="eyebrow">Ready to add your place?</p><h2>We’ll walk through it one piece at a time.</h2></div><div><p>The host setup covers the property, amenities, rates, policies, calendars and payments without dropping everything into one giant form.</p><Link className="button button-light" href="/host/sign-up?next=%2Fhost%2Fonboarding">Start host setup →</Link></div></div></section>
      </main>
      <Footer />
    </>
  );
}
