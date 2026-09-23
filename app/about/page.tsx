import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getSiteContentBlocks } from "@/lib/public/site-content";

import styles from "./about-map.module.css";

const defaults = {
  "about.hero": {
    eyebrow: "About Find A Place",
    title: "Unforgettable Stays. Exceptional Adventures.",
    body:
      "Find A Place grew from a simple idea: the place you stay should feel connected to the trip you came to take.",
  },
  "about.featured": {
    title: "Find a stay. Find the adventure around it.",
    body:
      "Cabins, campgrounds, lake stays, RV spots and independent places close to the places people already want to explore.",
  },
  "about.who": {
    eyebrow: "Who we are",
    title: "A travel and outdoor network built close to home.",
    body:
      "Find A Place began around Arkansas travelers, outdoor communities, content creators and short-term-rental owners sharing cabins, campgrounds, rivers, lakes, trails and the places people kept asking about. That community-first approach still shapes the booking platform today.",
  },
  "about.what": {
    eyebrow: "What we do",
    title: "We help people find the stay that fits the adventure.",
    body:
      "We connect travelers with independent cabins, cottages, RV stays and other places to stay near the towns, lakes, rivers, trails and attractions they came to explore.",
  },
  "about.community": {
    eyebrow: "Built from the places people share",
    title: "The trip is bigger than the room you sleep in.",
    body:
      "Find A Place has always been about more than a property listing. It is about the float, the trail, the lake, the small town, the waterfall, the local stop and the place you come back to at the end of the day.",
  },
  "about.hosts": {
    eyebrow: "For hosts",
    title: "Independent places deserve a better way to be found.",
    body:
      "Find A Place gives property owners a direct booking marketplace built around the destinations and audiences already looking for places to stay.",
    cta_label: "List your property",
    cta_href: "/hosts",
  },
};

export default async function AboutPage() {
  const keys = Object.keys(defaults);
  const content = await getSiteContentBlocks(keys);

  const get = (key: keyof typeof defaults) => ({
    ...defaults[key],
    ...(content.get(key) ?? {}),
  });

  const hero = get("about.hero");
  const featured = get("about.featured");
  const who = get("about.who");
  const what = get("about.what");
  const community = get("about.community");
  const hosts = get("about.hosts");

  return (
    <>
      <div className={`home-hero ${styles.aboutHero}`}>
        <video
          className={styles.aboutHeroVideo}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/media/find-a-place-about-fall-poster.jpg"
          aria-hidden="true"
        >
          <source
            src="/media/find-a-place-about-fall-remix.mp4"
            type="video/mp4"
          />
        </video>
        <div className={styles.aboutHeroShade} aria-hidden="true" />

        <Header light />
        <div className={`shell hero-layout ${styles.aboutHeroContent}`}>
          <div className="hero-copy">
            <p className="eyebrow">{hero.eyebrow}</p>
            <h1>{hero.title}</h1>
            <p className="hero-lead">{hero.body}</p>
          </div>

          <div className="hero-featured-panel">
            <div className="hero-featured-media">
              <img
                src="/brand/find-a-place-pin.jpg"
                alt="Find A Place"
              />
            </div>
            <div className="hero-featured-copy">
              <strong>{featured.title}</strong>
              <p>{featured.body}</p>
            </div>
          </div>
        </div>
      </div>

      <main>
        <section className="network-section shell">
          <div className="network-copy">
            <p className="eyebrow dark">{who.eyebrow}</p>
            <h2>{who.title}</h2>
            <p>{who.body}</p>
          </div>

          <div className="network-copy">
            <p className="eyebrow dark">{what.eyebrow}</p>
            <h2>{what.title}</h2>
            <p>{what.body}</p>
          </div>
        </section>

        <section className="marketplace-section marketplace-band">
          <div className="shell">
            <div className="regions-intro">
              <p className="eyebrow dark">{community.eyebrow}</p>
              <h2>{community.title}</h2>
              <p>{community.body}</p>
            </div>
          </div>
        </section>

        <section className={styles.partnerMapSection}>
          <div className="shell">
            <div className={styles.partnerMapHeading}>
              <div>
                <p className="eyebrow dark">Across the Find A Place network</p>
                <h2>See where our partners are.</h2>
              </div>
              <p>
                Find A Place started by connecting travelers with local stays and
                outdoor destinations across Arkansas. This map shows the partner
                locations that make up that growing network.
              </p>
            </div>

            <div className={styles.partnerMapFrame}>
              <iframe
                title="Find A Place partner locations"
                src="https://www.google.com/maps/d/u/0/embed?mid=1znr--DZK2UInog1toBsweyTKqHtFPnU"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>

            <div className={styles.partnerMapFooter}>
              <span>
                Partner locations are maintained by Find A Place in Google My Maps.
              </span>
              <a
                href="https://www.google.com/maps/d/u/0/viewer?mid=1znr--DZK2UInog1toBsweyTKqHtFPnU"
                target="_blank"
                rel="noreferrer"
              >
                Open full partner map →
              </a>
            </div>
          </div>
        </section>

        <section className="host-cta">
          <div className="shell host-cta-inner">
            <div>
              <p className="eyebrow">{hosts.eyebrow}</p>
              <h2>{hosts.title}</h2>
            </div>
            <div>
              <p>{hosts.body}</p>
              <Link
                className="button button-light"
                href={hosts.cta_href || "/hosts"}
              >
                {hosts.cta_label || "List your property"} →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
