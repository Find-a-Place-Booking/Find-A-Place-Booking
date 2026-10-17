import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SocialIcon } from "@/components/SocialIcon";
import { TrackedLink } from "@/components/TrackedLink";
import {
  FIND_A_PLACE_NETWORK_URL,
  FIND_A_PLACE_SOCIAL_LINKS,
} from "@/lib/brand-links";

import styles from "./social.module.css";

export const metadata: Metadata = {
  title: "Find A Place Social Media | Where Our Adventure Began",
  description:
    "Find A Place started with a community of Arkansas and Ozarks travel creators. Explore the story, follow Find A Place on social media and discover the stays behind the adventures.",
  alternates: { canonical: "/social" },
  openGraph: {
    title: "Find A Place Social Media | Where Our Adventure Began",
    description:
      "From sharing waterfalls, local adventures and cabins to helping travelers book places worth visiting. Follow the Find A Place network.",
    url: "/social",
    images: [{ url: "/brand/find-a-place-seal.png", alt: "Find A Place Arkansas & Beyond" }],
  },
};

const platformDescriptions: Record<string, string> = {
  facebook: "Community updates, travel finds and places worth exploring.",
  instagram: "Photos, reels and the scenery behind the adventures.",
  tiktok: "Quick stops, discoveries and travel inspiration.",
  lemon8: "Travel notes, trip ideas and outdoor discoveries.",
};

const foundingSocialVoices = [
  {
    name: "Renea and Jon",
    community: "Renea and Jon Travels",
    href: "https://linktr.ee/explorestayadventurerepeat",
  },
  {
    name: "Mike",
    community: "Van Muir – For Life Outdoors",
    href: "https://www.facebook.com/share/VWpwtLCyoK5ptN2T/?mibextid=qi2Omg",
  },
  {
    name: "Chad",
    community: "Chasing the Ozarks",
    href: "https://www.facebook.com/profile.php?id=100069507084422",
  },
  {
    name: "Gez",
    community: "Waterfalls in Arkansas and Other Cool Places",
    href: "https://www.facebook.com/share/C4tN9CYvBxzviVDL/?mibextid=qi2Omg",
  },
];

export default function SocialPage() {
  return (
    <>
      <Header />
      <main className={styles.page}>
        <section className={styles.hero} aria-labelledby="social-heading">
          <div className={`shell ${styles.heroLayout}`}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Find A Place Arkansas &amp; Beyond</p>
              <h1 id="social-heading">Find A Place <span>Social Media</span></h1>
              <p className={styles.lead}>
                Before there was a place to book a stay, there was a group of people
                sharing the places they loved. Waterfalls, trails, rivers, small towns
                and the cabins that made the next adventure possible.
              </p>
              <div className={styles.heroActions}>
                <a href="#follow" className={styles.primaryCta}>Follow the adventure <span aria-hidden="true">↗</span></a>
                <Link href="/about" className={styles.secondaryCta}>Meet the people behind it</Link>
              </div>
            </div>
            <div className={styles.heroVisual}>
              <Image
                src="/about/team/find-a-place-seal-black.webp"
                alt="Find A Place Arkansas and Beyond emblem"
                width={640}
                height={640}
                priority
                className={styles.seal}
              />
              <span className={styles.visualCaption}>Explore. Stay. Adventure. Repeat.</span>
            </div>
          </div>
        </section>

        <section className={`shell ${styles.storySection}`} aria-labelledby="story-heading">
          <div>
            <p className={styles.sectionLabel}>Where it started</p>
            <h2 id="story-heading">The community came first.</h2>
          </div>
          <div className={styles.storyCopy}>
            <p>
              Find A Place grew from outdoor creators, local hosts and travelers
              sharing the places that made their trips memorable. From hiking and
              floating in Arkansas to discovering little-known destinations across
              the Ozarks, it has always been about more than where you sleep.
            </p>
            <p>
              As the network grew, so did the idea: connect those travel stories
              to real places people can stay. Find A Place Booking is an extension
              of the community that started on social media—not a replacement for it.
            </p>
            <Link href="/about" className={styles.textLink}>Read our story and meet the team <span aria-hidden="true">→</span></Link>
          </div>
        </section>

        <section className={styles.foundersBand} aria-labelledby="founders-heading">
          <div className="shell">
            <div className={styles.foundersHeading}>
              <div>
                <p className={styles.sectionLabel}>The original community</p>
                <h2 id="founders-heading">The people who started sharing.</h2>
              </div>
              <p>Find A Place began with Renea, Mike, Chad and Gez bringing together their love of the outdoors, travel and the places worth staying.</p>
            </div>
            <div className={styles.foundersGrid}>
              {foundingSocialVoices.map((person) => (
                <TrackedLink key={person.name} href={person.href} target="_blank" rel="noopener noreferrer" prefetch={false}
                  className={styles.founderCard} eventName="social_link_click"
                  eventData={{ platform: "founder_social", creator: person.name.toLowerCase(), placement: "social_page" }}>
                  <span>{person.name}</span>
                  <strong>{person.community}</strong>
                  <small>Explore their page <span aria-hidden="true">↗</span></small>
                </TrackedLink>
              ))}
            </div>
            <Link href="/about" className={styles.textLink}>Meet the full Find A Place collaboration network <span aria-hidden="true">→</span></Link>
          </div>
        </section>

        <section id="follow" className={styles.followBand} aria-labelledby="follow-heading">
          <div className="shell">
            <div className={styles.followHeading}>
              <div>
                <p className={styles.sectionLabel}>Find us out there</p>
                <h2 id="follow-heading">Follow Find A Place</h2>
              </div>
              <p>Join the conversation, see new adventures and discover the stories behind the stays.</p>
            </div>
            <div className={styles.platformGrid}>
              {FIND_A_PLACE_SOCIAL_LINKS.map((social) => (
                <TrackedLink
                  key={social.network}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch={false}
                  className={styles.platformCard}
                  eventName="social_link_click"
                  eventData={{ platform: social.network, placement: "social_page" }}
                  aria-label={`Open Find A Place ${social.label} in a new tab`}
                >
                  <span className={styles.iconCircle}><SocialIcon network={social.network} /></span>
                  <span className={styles.platformContent}>
                    <strong>{social.label}</strong>
                    <small>{platformDescriptions[social.network]}</small>
                    <span className={styles.visit}>Visit {social.label} <span aria-hidden="true">↗</span></span>
                  </span>
                </TrackedLink>
              ))}
            </div>
            <div className={styles.networkLink}>
              <span>
                <strong>Find A Place Arkansas &amp; Beyond</strong>
                <small>Our original outdoor community and partner network.</small>
              </span>
              <TrackedLink href={FIND_A_PLACE_NETWORK_URL} target="_blank" rel="noopener noreferrer" prefetch={false}
                eventName="social_link_click" eventData={{ platform: "network_website", placement: "social_page" }}>
                Explore the network ↗
              </TrackedLink>
            </div>
          </div>
        </section>

        <section className={`shell ${styles.shareSection}`} aria-labelledby="share-heading">
          <div>
            <p className={styles.sectionLabel}>Share the stay</p>
            <h2 id="share-heading">From an adventure post to your next getaway.</h2>
            <p>See a place that makes you want to pack a bag? Find the stay, choose your dates and book right here.</p>
            <Link href="/stays" className={styles.primaryCta}>Browse places to stay <span aria-hidden="true">→</span></Link>
          </div>
          <div className={styles.qrCard}>
            <Image src="/qr/find-a-place-booking.png" alt="Scannable QR code for findaplacebooking.com" width={350} height={350} className={styles.qrImage} />
            <strong>Scan to find a stay</strong>
            <span>findaplacebooking.com</span>
            <a href="/qr/find-a-place-booking-print.png" download="find-a-place-booking-qr-print.png">Get printable QR code ↓</a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
