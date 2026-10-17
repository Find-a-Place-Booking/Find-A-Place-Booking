"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { FIND_A_PLACE_SOCIAL_LINKS } from "@/lib/brand-links";
import { SocialIcon } from "./SocialIcon";
import { TrackedLink } from "./TrackedLink";
import styles from "./HomeSocialConnections.module.css";

const primarySocials = FIND_A_PLACE_SOCIAL_LINKS.filter(
  (social) => social.network !== "lemon8",
);

export function HomeSocialRibbon() {
  return (
    <div className={`shell ${styles.ribbon}`} aria-label="Follow Find A Place on social media">
      <span className={styles.ribbonMessage}>
        <span className={styles.ribbonMark} aria-hidden="true">✦</span>
        <strong>Follow the adventure</strong>
        <span className={styles.ribbonDescription}>Where our community began.</span>
      </span>
      <div className={styles.ribbonActions}>
        <div className={styles.ribbonIcons}>
          {primarySocials.map((social) => (
            <TrackedLink
              key={social.network}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              prefetch={false}
              className={styles.ribbonIcon}
              aria-label={`Follow Find A Place on ${social.label} (opens in a new tab)`}
              title={social.label}
              eventName="social_link_click"
              eventData={{ platform: social.network, placement: "home_top_social" }}
            >
              <SocialIcon network={social.network} />
            </TrackedLink>
          ))}
        </div>
        <Link className={styles.ribbonStory} href="/social">
          Our social story <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </div>
  );
}

const creators = [
  { image: "/about/team/renea-jon.webp", name: "Renea & Jon", detail: "Travel & local stays" },
  { image: "/about/team/mike.webp", name: "Mike", detail: "The great outdoors" },
  { image: "/about/team/gez.webp", name: "Gez", detail: "Waterfalls & discoveries" },
];

/** A single homepage-only section. No live social embeds or external APIs required. */
export function HomeSocialFeature() {
  const pathname = usePathname();
  if (pathname !== "/") return null;

  return (
    <section className={styles.featureSection} aria-labelledby="home-social-heading">
      <div className={`shell ${styles.featureOuter}`}>
        <div className={styles.featureLayout}>
          <div className={styles.photoGallery} aria-label="Some of the people behind the Find A Place community">
            {creators.map((creator, i) => (
              <div className={`${styles.creatorPhoto} ${i === 0 ? styles.creatorPhotoMain : ""}`} key={creator.name}>
                <Image
                  src={creator.image}
                  alt={`${creator.name}, part of the Find A Place outdoor community`}
                  fill
                  sizes={i === 0 ? "(max-width: 680px) 65vw, 230px" : "(max-width: 680px) 30vw, 125px"}
                  className={styles.photoImage}
                />
                <span className={styles.creatorCaption}>
                  <strong>{creator.name}</strong>
                  <small>{creator.detail}</small>
                </span>
              </div>
            ))}
            <span className={styles.photoNote}>A community of explorers, hosts &amp; storytellers</span>
          </div>

          <div className={styles.featureCopy}>
            <p className={styles.eyebrow}><span aria-hidden="true">✦</span> The community behind the stays</p>
            <h2 id="home-social-heading">The best trips start with <em>a little inspiration.</em></h2>
            <p className={styles.featureLead}>
              Find A Place started with people sharing trails, waterfalls, small towns
              and places worth getting away to. Now you can follow the adventure
              and find a stay close to it—all in one place.
            </p>
            <div className={styles.featureSocials} aria-label="Find A Place social profiles">
              {primarySocials.map((social) => (
                <TrackedLink
                  key={social.network}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  prefetch={false}
                  className={styles.featureSocialLink}
                  eventName="social_link_click"
                  eventData={{ platform: social.network, placement: "home_community_feature" }}
                >
                  <SocialIcon network={social.network} />
                  <span>{social.label}</span>
                  <span aria-hidden="true" className={styles.outArrow}>↗</span>
                </TrackedLink>
              ))}
            </div>
            <div className={styles.featureActions}>
              <Link href="/social" className={styles.featurePrimary}>
                Meet our social community <span aria-hidden="true">→</span>
              </Link>
              <Link href="/stays" className={styles.featureSecondary}>
                Explore stays <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
