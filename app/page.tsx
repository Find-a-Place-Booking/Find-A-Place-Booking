import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PropertyCard } from "@/components/PropertyCard";
import { SearchBar } from "@/components/SearchBar";
import { destinations } from "@/data/catalog";
import { getPublishedProperties } from "@/lib/public/listings";
import { getSiteContentBlocks } from "@/lib/public/site-content";

const stayCollections = [
  {
    label: "Cabins",
    detail: "Wooded weekends, porches and a little room to unplug.",
    filter: "Cabin",
  },
  {
    label: "RV stays",
    detail: "Road-trip stops, campsites and places to settle in for a few days.",
    filter: "RV Site",
  },
  {
    label: "Waterfront",
    detail: "Lakes, rivers and stays close to the water.",
    filter: "Waterfront",
  },
  {
    label: "Pet-friendly",
    detail: "Bring the dog and keep the whole crew together.",
    filter: "Pet friendly",
  },
  {
    label: "Hot tubs",
    detail: "A little extra after a long day outside.",
    filter: "Hot tub",
  },
  {
    label: "Under $250",
    detail: "Good stays at an easier nightly rate.",
    filter: "Under $250",
  },
];

const destinationImages: Record<string, string> = {
  "Hot Springs":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/9c/Downtown_Hot_Springs%2C_Arkansas_001.jpg/960px-Downtown_Hot_Springs%2C_Arkansas_001.jpg",
  "Lake Ouachita":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d5/Lake_Ouachita_north_of_Mount_Ida%2C_Arkansas.jpg/960px-Lake_Ouachita_north_of_Mount_Ida%2C_Arkansas.jpg",
  "Caddo River":
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/f0/Norman%2C_AR_002.jpg/960px-Norman%2C_AR_002.jpg",
  "Eureka Springs":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Aerial_shot_of_downtown_Eureka_Springs%2C_Arkansas.jpg/960px-Aerial_shot_of_downtown_Eureka_Springs%2C_Arkansas.jpg",
  Branson:
    "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1c/Downtown_Branson_Missouri.jpg/960px-Downtown_Branson_Missouri.jpg",
};

const defaults = {
  hero: {
    eyebrow: "Find A Place Booking",
    title: "Find a stay close to where you want to be.",
    body:
      "Cabins, cottages, lake stays and places worth getting away to across Arkansas, Missouri and beyond.",
  },
  story: {
    eyebrow: "Why Find A Place",
    title: "Places worth staying. People ready to find them.",
    body:
      "Find A Place brings travelers and independent hosts together around the places that make a trip worth remembering. Guests can discover cabins, lake stays, RV spots and one-of-a-kind places near where they’re headed. Hosts get a better way to share what makes their place special with people already planning the trip.",
    cta_label: "More about Find A Place",
    cta_href: "/about",
  },
  hostCta: {
    eyebrow: "List your place",
    title: "Put your stay in front of guests already planning the trip.",
    body:
      "Share what makes your place worth the stay and let Find A Place help the right guests discover it.",
    cta_label: "See how hosting works",
    cta_href: "/hosts",
  },
};

export default async function HomePage() {
  const [published, content] = await Promise.all([
    getPublishedProperties(14),
    getSiteContentBlocks(["home.hero", "home.story", "home.host_cta"]),
  ]);

  const hero = {
    ...defaults.hero,
    ...(content.get("home.hero") ?? {}),
  };
  const story = {
    ...defaults.story,
    ...(content.get("home.story") ?? {}),
  };
  const hostCta = {
    ...defaults.hostCta,
    ...(content.get("home.host_cta") ?? {}),
  };

  const featuredStay = published[0] ?? null;
  const primaryStays = published.slice(0, 8);
  const moreStays = published.slice(8, 14);

  return (
    <>
      <div className="home-hero">
        <Header light />

        <div className="shell hero-layout">
          <div className="hero-copy">
            <p className="eyebrow">{hero.eyebrow}</p>
            <h1>{hero.title}</h1>
            <p className="hero-lead">{hero.body}</p>

            <div className="hero-proof">
              <span>
                <strong>Search by trip</strong>
                Place, dates and guests
              </span>
              <span>
                <strong>Real stays</strong>
                Published by approved hosts
              </span>
              <span>
                <strong>Arkansas first</strong>
                Growing across the region
              </span>
            </div>
          </div>

          <div className="hero-featured-panel" aria-label="Featured stay">
            {featuredStay ? (
              <>
                <Link
                  className="hero-featured-media hero-featured-live"
                  href={`/stays/${featuredStay.slug}`}
                  aria-label={`View ${featuredStay.name}`}
                >
                  {featuredStay.image ? (
                    <img
                      src={featuredStay.image}
                      alt={`${featuredStay.name} in ${featuredStay.location}`}
                    />
                  ) : (
                    <div className="hero-featured-photo-placeholder">
                      <span>Featured stay</span>
                    </div>
                  )}
                  <span>Featured stay</span>
                </Link>

                <div className="hero-featured-copy">
                  <span>{featuredStay.location}</span>
                  <strong>{featuredStay.name}</strong>
                  <p>
                    {featuredStay.sleeps} guests · {featuredStay.type}
                    {featuredStay.tags.length
                      ? ` · ${featuredStay.tags.slice(0, 2).join(" · ")}`
                      : ""}
                  </p>
                  <div className="hero-featured-meta">
                    <b>${featuredStay.price}</b>
                    <small>/ night</small>
                  </div>
                  <Link href={`/stays/${featuredStay.slug}`}>
                    View this stay →
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="hero-featured-media" aria-hidden="true">
                  <span>Featured cabin photo</span>
                </div>
                <div className="hero-featured-copy">
                  <span>Featured stay</span>
                  <strong>Featured cabin coming soon.</strong>
                  <p>
                    One standout cabin, cottage or getaway at a time, picked for
                    the kind of trip you’ll want to start planning.
                  </p>
                  <Link href="/stays">Browse all stays →</Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <main>
        <section className="home-search-band">
          <div className="shell hero-search">
            <SearchBar />
          </div>
          <div
            className="quick-destinations shell"
            aria-label="Popular destinations"
          >
            <span>Popular:</span>
            {destinations.map((destination) => (
              <Link
                href={`/stays?where=${encodeURIComponent(destination.name)}`}
                key={destination.name}
              >
                {destination.name}
              </Link>
            ))}
          </div>
        </section>

        <section className="marketplace-section marketplace-band">
          <div className="shell">
            <div className="section-heading marketplace-heading">
              <div>
                <p className="eyebrow dark">Featured stays</p>
                <h2>Places people are already looking at.</h2>
              </div>
              <Link className="under-link" href="/stays">
                See all stays →
              </Link>
            </div>

            {primaryStays.length > 0 ? (
              <div className="home-property-grid">
                {primaryStays.map((property) => (
                  <PropertyCard key={property.slug} property={property} />
                ))}
              </div>
            ) : (
              <div className="featured-empty home-inventory-empty">
                <div>
                  <p className="eyebrow dark">The first stays are on the way</p>
                  <h3>We’re getting the first places ready for travelers.</h3>
                  <p>
                    As approved hosts publish their properties, they’ll start
                    showing up here.
                  </p>
                </div>
                <Link className="button button-quiet" href="/hosts">
                  List a property
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="stay-types-section">
          <div className="stay-type-backdrop" aria-hidden="true">
            <div className="stay-type-slice stay-type-slice-1" />
            <div className="stay-type-slice stay-type-slice-2" />
            <div className="stay-type-slice stay-type-slice-3" />
            <div className="stay-type-slice stay-type-slice-4" />
          </div>
          <div className="stay-type-overlay" aria-hidden="true" />

          <div className="shell stay-types-shell">
            <div className="section-heading marketplace-heading">
              <div>
                <p className="eyebrow">Browse by stay type</p>
                <h2>Pick the kind of place that fits the trip.</h2>
              </div>
            </div>

            <div className="stay-type-grid">
              {stayCollections.map((collection) => (
                <Link
                  className="stay-type-card"
                  href={`/stays?filter=${encodeURIComponent(
                    collection.filter,
                  )}`}
                  key={collection.filter}
                >
                  <div>
                    <strong>{collection.label}</strong>
                    <p>{collection.detail}</p>
                  </div>
                  <span>Browse →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="regions" className="regions-section">
          <div className="shell">
            <div className="regions-intro">
              <p className="eyebrow dark">Browse by destination</p>
              <h2>Going somewhere specific?</h2>
              <p>Start with the place, then find a stay nearby.</p>
            </div>

            <div className="destination-grid">
              {destinations.map((destination) => (
                <Link
                  href={`/stays?where=${encodeURIComponent(destination.name)}`}
                  className="destination-card"
                  key={destination.name}
                >
                  <span
                    className="destination-card-media"
                    style={{
                      backgroundImage: `url(${
                        destinationImages[destination.name] ??
                        "/stay-types/slice-cabin.png"
                      })`,
                    }}
                    aria-hidden="true"
                  />
                  <span
                    className="destination-card-overlay"
                    aria-hidden="true"
                  />
                  <span className="destination-card-content">
                    <span>
                      <h3>{destination.name}</h3>
                      <p>{destination.detail}</p>
                      <small>Browse stays</small>
                    </span>
                    <b>↗</b>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {moreStays.length >= 3 ? (
          <section className="marketplace-section marketplace-section-secondary marketplace-band">
            <div className="shell">
              <div className="section-heading marketplace-heading">
                <div>
                  <p className="eyebrow dark">Keep exploring</p>
                  <h2>More stays worth keeping in mind.</h2>
                </div>
                <Link className="under-link" href="/stays">
                  Browse every stay →
                </Link>
              </div>

              <div className="home-property-grid home-property-grid-secondary">
                {moreStays.map((property) => (
                  <PropertyCard key={property.slug} property={property} />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section id="story" className="network-section shell">
          <div className="network-photo find-place-poster">
            <img
              src={story.image_url || "/brand/find-a-place-pin.jpg"}
              alt="Find A Place cabin, campfire and water mark"
            />
          </div>

          <div className="network-copy">
            <p className="eyebrow dark">{story.eyebrow}</p>
            <h2>{story.title}</h2>
            <p>{story.body}</p>

            <div className="stat-line brand-value-row">
              <div>
                <strong>For travelers</strong>
                <span>Find a stay that feels like part of the trip</span>
              </div>
              <div>
                <strong>For hosts</strong>
                <span>Put your place in front of the right guests</span>
              </div>
              <div>
                <strong>Built local</strong>
                <span>Arkansas first, with more places to come</span>
              </div>
            </div>

            <Link
              className="button"
              href={story.cta_href || "/about"}
            >
              {story.cta_label || "More about Find A Place"} →
            </Link>
          </div>
        </section>

        <section className="host-cta">
          <div className="shell host-cta-inner">
            <div>
              <p className="eyebrow">{hostCta.eyebrow}</p>
              <h2>{hostCta.title}</h2>
            </div>
            <div>
              <p>{hostCta.body}</p>
              <Link
                className="button button-light"
                href={hostCta.cta_href || "/hosts"}
              >
                {hostCta.cta_label || "See how hosting works"} →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
