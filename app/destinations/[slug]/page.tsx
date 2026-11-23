import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PropertyCard } from "@/components/PropertyCard";
import { JsonLd } from "@/components/JsonLd";
import { getPublishedProperties } from "@/lib/public/listings";
import { searchPublishedStaysNearby } from "@/lib/public/nearby-destination-search";
import { DESTINATIONS, getDestination } from "@/lib/seo/destinations";
import { absoluteUrl } from "@/lib/seo";
import styles from "../destinations.module.css";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const place = getDestination(slug);
  if (!place) return { title: "Destination unavailable", robots: { index: false } };
  const path = `/destinations/${place.slug}`;
  return {
    title: place.heading,
    description: place.description,
    alternates: { canonical: path },
    openGraph: { type: "website", title: place.heading, description: place.description, url: path },
  };
}

export default async function DestinationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const place = getDestination(slug);
  if (!place) notFound();

  // Use the same publishing/active-unit lookup as the marketplace. No drafts,
  // unapproved listings, or invented business results appear here.
  const allProperties = await getPublishedProperties();
  const result = await searchPublishedStaysNearby(allProperties, place.searchPlace, place.radiusMiles);
  const stays = result.properties;
  const path = `/destinations/${place.slug}`;
  const browseUrl = `/stays?where=${encodeURIComponent(place.searchPlace)}&radius=${place.radiusMiles}`;
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "Destinations", item: absoluteUrl("/destinations") },
      { "@type": "ListItem", position: 3, name: place.name, item: absoluteUrl(path) },
    ],
  };

  return <>
    <Header />
    <main className={`shell ${styles.page}`}>
      <nav className={styles.crumbs} aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/destinations">Destinations</Link><span>/</span><span>{place.name}</span></nav>
      <p className="eyebrow dark">Where to stay</p>
      <h1>{place.heading}</h1>
      <p className={styles.intro}>{place.intro}</p>
      <section className={styles.tips} aria-label="What draws visitors to this area">
        <h2>Things people come here for</h2>
        <ul>{place.localFocus.map((item) => <li key={item}>{item}</li>)}</ul>
        {place.guideUrl ? <a href={place.guideUrl} target="_blank" rel="noopener noreferrer">Read the {place.guideName} ↗</a> : null}
      </section>
      <section aria-label={`Places to stay near ${place.name}`}>
        <div className={styles.sectionHead}>
          <div><h2>{stays.length ? `${stays.length} stays in and around ${place.name}` : `Explore stays around ${place.name}`}</h2>
            <p>{place.slug === "buffalo-national-river"
              ? "Searches stay close to mapped river access points, not an entire county. Driving distances may be longer."
              : `Listings match the area or lie within roughly ${place.radiusMiles} straight-line miles; road distances can differ.`}</p>
          </div>
          <Link href={browseUrl}>Search dates and guests →</Link>
        </div>
        {stays.length ? <div className={styles.stays}>
          {stays.map((stay) => <PropertyCard key={stay.slug} property={stay} surface={`destination_${place.slug}`} />)}
        </div> : <div className={styles.empty}><p>We don't currently have an independently hosted listing that matches this area. Browse the full marketplace or try a nearby town.</p><Link href="/stays">Browse all stays</Link></div>}
      </section>
      <section className={styles.more}>
        <h2>Other areas worth exploring</h2>
        <div className={styles.moreLinks}>{DESTINATIONS.filter((item) => item.slug !== place.slug).map((item) => <Link key={item.slug} href={`/destinations/${item.slug}`}>{item.name}</Link>)}</div>
      </section>
      <p className={styles.disclaimer}>Each listing is maintained by its host. Nightly prices are starting rates; select travel dates to verify availability and see the complete quote before payment.</p>
    </main>
    <Footer />
    <JsonLd data={breadcrumbs} />
  </>;
}
