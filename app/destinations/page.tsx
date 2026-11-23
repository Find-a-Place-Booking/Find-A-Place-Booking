import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { DESTINATIONS } from "@/lib/seo/destinations";
import styles from "./destinations.module.css";

export const metadata: Metadata = {
  title: "Browse Arkansas destinations and places to stay",
  description: "Explore vacation stays by destination: Hot Springs, Lake Ouachita, Caddo River, Buffalo National River, Jasper and Mammoth Spring.",
  alternates: { canonical: "/destinations" },
};

export default function DestinationsPage() {
  return <>
    <Header />
    <main className={`shell ${styles.page}`}>
      <p className="eyebrow dark">Where to go</p>
      <h1>Find a stay near the trip you have in mind.</h1>
      <p className={styles.intro}>River mornings, lake weekends, small-town stops and cabin escapes. Pick an area to browse real Find A Place listings from independent hosts.</p>
      <div className={styles.destinations}>
        {DESTINATIONS.map((place) => <article key={place.slug} className={styles.destination}>
          <h2><Link href={`/destinations/${place.slug}`}>{place.name}</Link></h2>
          <p>{place.description}</p>
          <Link href={`/destinations/${place.slug}`}>Explore stays in this area →</Link>
        </article>)}
      </div>
      <p className={styles.disclaimer}>Distances are approximate. Always check the location, access and driving route for the exact property before booking.</p>
      <Link className="button" href="/stays">Browse every stay</Link>
    </main>
    <Footer />
  </>;
}
