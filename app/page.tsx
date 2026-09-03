import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SearchBar } from "@/components/SearchBar";
import { destinations, properties } from "@/data/catalog";
import { PropertyCard } from "@/components/PropertyCard";

export default function HomePage() {
  const featured = properties.slice(0, 3);
  return (
    <>
      <div className="home-hero">
        <Header light />
        <div className="shell hero-layout">
          <div className="hero-copy">
            <p className="eyebrow">Stays in Arkansas, Missouri & beyond</p>
            <h1>Find somewhere worth going.</h1>
            <p className="hero-lead">Search independent cabins, cottages, RV stays and one-of-a-kind places by location, dates and guests, then book without being passed from site to site.</p>
            <div className="hero-proof">
              <span><strong>Search real dates</strong>See which stays are open</span>
              <span><strong>Book in one place</strong>One clean checkout</span>
              <span><strong>Regional by design</strong>Arkansas and the Ozarks first</span>
            </div>
          </div>
          <div className="hero-photo hero-photo-empty" aria-label="Find A Place Booking regional travel"><div className="editorial-mark">FIND A PLACE</div><div className="photo-caption"><span>Arkansas, Missouri & beyond</span><strong>Independent stays, easier to find and book.</strong></div></div>
        </div>
        <div className="shell hero-search"><SearchBar /></div>
      </div>

      <main>
        <section className="quick-destinations shell" aria-label="Popular destinations">
          <span>Popular:</span>
          {destinations.map((destination) => <Link href={`/stays?where=${encodeURIComponent(destination.name)}`} key={destination.name}>{destination.name}</Link>)}
        </section>

        <section className="section section-featured shell">
          <div className="section-heading"><div><p className="eyebrow dark">Featured stays</p><h2>Places worth building a trip around.</h2></div><Link className="under-link" href="/stays">Search all stays →</Link></div>
          {featured.length > 0 ? <div className="featured-grid">{featured.map((property, index) => <PropertyCard key={property.slug} property={property} wide={index === 0} />)}</div> : <div className="featured-empty"><div><p className="eyebrow dark">Catalog coming online</p><h3>Featured properties will appear here as hosts are approved.</h3><p>The production shell no longer uses sample cabins or pretend availability. Live inventory will populate this section from the platform database.</p></div><Link className="button button-quiet" href="/hosts">List a property</Link></div>}
        </section>

        <section id="regions" className="regions-section">
          <div className="shell">
            <div className="regions-intro"><p className="eyebrow">Explore the region</p><h2>Start where people are already going.</h2><p>Find A Place Booking is built to win close to home first. Strong Arkansas and Ozarks destinations become the foundation while the platform remains open to hosts and travelers beyond the region.</p></div>
            <div className="destination-grid">
              {destinations.map((destination, index) => <Link href={`/stays?where=${encodeURIComponent(destination.name)}`} className="destination-card" key={destination.name}><span>0{index + 1}</span><div><h3>{destination.name}</h3><p>{destination.detail}</p><small>Search this destination</small></div><b>↗</b></Link>)}
            </div>
          </div>
        </section>

        <section id="story" className="network-section shell">
          <div className="network-photo network-photo-empty"><div className="editorial-mark">REGIONAL FIRST</div><div className="network-photo-note"><strong>Built around independent stays.</strong><span>Owners stay in control of their property and guests get a simpler way to find them.</span></div></div>
          <div className="network-copy"><p className="eyebrow dark">Regional first, open beyond</p><h2>More useful than a directory. More focused than a national marketplace.</h2><p>Find A Place Booking turns regional reach into a complete booking product: real availability for travelers, a direct booking home for owners, and a marketplace designed to grow across Arkansas, Missouri and nearby drive markets.</p><div className="stat-line"><div><strong>5%</strong><span>existing Find A Place partners</span></div><div><strong>7%</strong><span>other network hosts</span></div><div><strong>Lodging only</strong><span>commission excludes legitimate host fees and taxes</span></div></div><Link className="button" href="/hosts">See how hosting works</Link></div>
        </section>

        <section className="how-booking-works">
          <div className="shell">
            <div className="section-heading"><div><p className="eyebrow dark">Simple on purpose</p><h2>From “where should we go?” to booked.</h2></div></div>
            <div className="journey-row"><div><span>01</span><strong>Pick the trip</strong><p>Destination, dates and guests.</p></div><div><span>02</span><strong>See what is open</strong><p>Only stays that fit the search.</p></div><div><span>03</span><strong>Choose the place</strong><p>Photos, amenities, rules and real pricing.</p></div><div><span>04</span><strong>Book it here</strong><p>One branded checkout and trip page.</p></div></div>
          </div>
        </section>

        <section className="host-cta">
          <div className="shell host-cta-inner"><div><p className="eyebrow">Have a place people should know about?</p><h2>Regional discovery, direct booking and a straightforward commission.</h2></div><div><p>Owners manage their property, rates, calendar, policies and payouts. Find A Place Booking earns 5% on partner stays or 7% on other host stays, calculated from the nightly lodging subtotal.</p><Link className="button button-light" href="/hosts">See how hosting works →</Link></div></div>
        </section>
      </main>
      <Footer />
    </>
  );
}
