import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SearchBar } from "@/components/SearchBar";
import { PropertyCard } from "@/components/PropertyCard";
import { destinations, properties } from "@/data/demo";

export default function HomePage() {
  return (
    <>
      <div className="home-hero">
        <Header light />
        <div className="shell hero-layout">
          <div className="hero-copy">
            <p className="eyebrow">Stays in Arkansas, Missouri & beyond</p>
            <h1>Find somewhere worth going.</h1>
            <p className="hero-lead">Search cabins, cottages, RV stays and one-of-a-kind places by the dates you actually want to travel, then book without being passed from site to site.</p>
            <div className="hero-proof">
              <span><strong>Search real dates</strong>See which stays are open</span>
              <span><strong>Book in one place</strong>One clean checkout</span>
              <span><strong>Regional by design</strong>Arkansas and the Ozarks first</span>
            </div>
          </div>
          <div className="hero-photo"><img src={properties[0].image} alt="Wooded cabin getaway" /><div className="photo-caption"><span>Lake Ouachita region</span><strong>Cabins, lake stays and places a little farther out.</strong></div></div>
        </div>
        <div className="shell hero-search"><SearchBar /></div>
      </div>

      <main>
        <section className="quick-destinations shell" aria-label="Popular destinations">
          <span>Popular:</span>
          {["Hot Springs", "Lake Ouachita", "Caddo River", "Eureka Springs", "Branson"].map((place) => <Link href={`/stays?where=${encodeURIComponent(place)}&checkin=2026-09-18&checkout=2026-09-21&guests=4`} key={place}>{place}</Link>)}
        </section>

        <section className="section section-featured shell">
          <div className="section-heading"><div><p className="eyebrow dark">Open September 18–21</p><h2>A few places ready for a long weekend.</h2></div><Link className="under-link" href="/stays">See all available stays →</Link></div>
          <div className="featured-grid"><PropertyCard property={properties[0]} wide /><PropertyCard property={properties[3]} /><PropertyCard property={properties[5]} /></div>
        </section>

        <section id="regions" className="regions-section">
          <div className="shell">
            <div className="regions-intro"><p className="eyebrow">Explore the region</p><h2>Start where people are already going.</h2><p>Find A Place Booking is built to win close to home first. The strongest destinations in Arkansas and the Ozarks become the foundation, while the platform stays open to hosts and travelers beyond the region.</p></div>
            <div className="destination-grid">
              {destinations.map((destination, index) => <Link href={`/stays?where=${encodeURIComponent(destination.name)}&checkin=2026-09-18&checkout=2026-09-21&guests=4`} className="destination-card" key={destination.name}><span>0{index + 1}</span><div><h3>{destination.name}</h3><p>{destination.detail}</p><small>{destination.count} network stays</small></div><b>↗</b></Link>)}
            </div>
          </div>
        </section>

        <section id="story" className="network-section shell">
          <div className="network-photo"><img src={properties[4].image} alt="Forest and river getaway" /><div className="network-photo-note"><strong>Built around independent stays.</strong><span>Owners stay in control of their property and guests get a simpler way to find them.</span></div></div>
          <div className="network-copy"><p className="eyebrow dark">Regional first, open beyond</p><h2>More useful than a directory. More focused than a national marketplace.</h2><p>Find A Place already connects outdoor audiences with places to stay. Find A Place Booking turns that reach into a complete booking product: real availability for travelers, a direct booking home for owners, and a marketplace that can grow across Arkansas, Missouri and nearby drive markets without needing national scale to work.</p><div className="stat-line"><div><strong>Flat fee</strong><span>predictable host pricing</span></div><div><strong>0%</strong><span>platform booking commission</span></div><div><strong>Direct</strong><span>host controls payouts and policies</span></div></div><Link className="button" href="/hosts">See how hosting works</Link></div>
        </section>

        <section className="how-booking-works">
          <div className="shell">
            <div className="section-heading"><div><p className="eyebrow dark">Simple on purpose</p><h2>From “where should we go?” to booked.</h2></div></div>
            <div className="journey-row"><div><span>01</span><strong>Pick the trip</strong><p>Destination, dates and guests.</p></div><div><span>02</span><strong>See what is open</strong><p>Only stays that fit the search.</p></div><div><span>03</span><strong>Choose the place</strong><p>Photos, amenities, rules and real pricing.</p></div><div><span>04</span><strong>Book it here</strong><p>One branded checkout and trip page.</p></div></div>
          </div>
        </section>

        <section className="host-cta">
          <div className="shell host-cta-inner"><div><p className="eyebrow">Have a place people should know about?</p><h2>A real booking page, regional discovery and one predictable price.</h2></div><div><p>Owners manage their property, rates, calendar, policies and payouts while Find A Place Booking helps travelers discover and book the stay.</p><Link className="button button-light" href="/hosts">See the host plan →</Link></div></div>
        </section>
      </main>
      <Footer />
    </>
  );
}
