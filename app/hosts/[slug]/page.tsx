import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { PublicHostInquiryForm } from "@/components/PublicHostInquiryForm";
import { StarRating } from "@/components/StarRating";
import {
  getPublicHostPageBySlug,
  type PublicHostStay,
} from "@/lib/hosts/public-profile";
import { absoluteUrl, seoDescription } from "@/lib/seo";

import styles from "./host-profile.module.css";

export const revalidate = 1800;

const getHost = cache(getPublicHostPageBySlug);

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "H";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function StayCard({ stay }: { stay: PublicHostStay }) {
  return (
    <article className={styles.stayCard}>
      <Link className={styles.stayImage} href={`/stays/${stay.slug}`}>
        {stay.image ? (
          <img
            src={stay.image}
            alt={`${stay.name} property`}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={styles.stayPlaceholder} aria-hidden="true" />
        )}
        <span>{stay.type}</span>
      </Link>

      <div className={styles.stayBody}>
        <small>{stay.location}</small>
        <Link href={`/stays/${stay.slug}`}>
          <h3>{stay.name}</h3>
        </Link>
        <p>
          Sleeps {stay.sleeps}
          {stay.bedrooms > 0 ? ` · ${stay.bedrooms} bedrooms` : ""}
          {stay.baths > 0 ? ` · ${stay.baths} baths` : ""}
        </p>
        <div className={styles.stayFooter}>
          <strong>
            {stay.price > 0 ? `$${stay.price} / night` : "View rates"}
          </strong>
          <span>
            {stay.reviewCount
              ? `${stay.rating.toFixed(1)} ★ · ${stay.reviewCount}`
              : "New on Find A Place"}
          </span>
        </div>
      </div>
    </article>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const host = await getHost(slug);

  if (!host) {
    return {
      title: "Host not found",
      robots: { index: false, follow: false },
    };
  }

  const description = seoDescription(
    host.publicBio,
    `View ${host.name}'s stays and verified guest reviews on Find A Place Booking.`,
  );
  const canonical = `/hosts/${host.slug}`;

  return {
    title: `${host.name} | Find A Place Host`,
    description,
    alternates: { canonical },
    openGraph: {
      type: "profile",
      title: host.name,
      description,
      url: canonical,
      images: host.avatarUrl
        ? [{ url: host.avatarUrl, alt: `${host.name} host profile` }]
        : undefined,
    },
  };
}

export default async function PublicHostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const host = await getHost(slug);
  if (!host) notFound();

  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: host.name,
    url: absoluteUrl(`/hosts/${host.slug}`),
    description: host.publicBio || undefined,
    image: host.avatarUrl || undefined,
  };

  return (
    <>
      <JsonLd data={schema} />
      <Header />

      <main className={styles.page}>
        <section className={`shell ${styles.hero}`}>
          <div className={styles.avatar}>
            {host.avatarUrl ? (
              <img
                src={host.avatarUrl}
                alt={`${host.name} host profile`}
                loading="eager"
                decoding="async"
              />
            ) : (
              <span>{initials(host.name)}</span>
            )}
          </div>

          <div className={styles.heroCopy}>
            <p className="eyebrow dark">Find A Place host</p>
            <h1>{host.name}</h1>

            <div className={styles.trustRow}>
              <span>
                {host.stays.length} published stay
                {host.stays.length === 1 ? "" : "s"}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {host.reviewCount
                  ? `${host.rating.toFixed(1)} ★ from ${host.reviewCount} verified review${
                      host.reviewCount === 1 ? "" : "s"
                    }`
                  : "New host reviews coming soon"}
              </span>
            </div>

            {host.publicBio ? (
              <p className={styles.bio}>{host.publicBio}</p>
            ) : null}

            <a className="button button-small" href="#message-host">
              Message host
            </a>
          </div>
        </section>

        <section className={`shell ${styles.section}`}>
          <div className={styles.sectionHead}>
            <div>
              <p className="eyebrow dark">Places to stay</p>
              <h2>All stays from {host.name}</h2>
            </div>
            <Link className="under-link" href="/stays">
              Browse all Find A Place stays →
            </Link>
          </div>

          <div className={styles.stayGrid}>
            {host.stays.map((stay) => (
              <StayCard key={stay.propertyId} stay={stay} />
            ))}
          </div>
        </section>

        <section className={`shell ${styles.section}`}>
          <div className={styles.sectionHead}>
            <div>
              <p className="eyebrow dark">Verified guest feedback</p>
              <h2>Reviews for {host.name}</h2>
            </div>
            {host.reviewCount ? (
              <div className={styles.ratingSummary}>
                <strong>{host.rating.toFixed(1)}</strong>
                <StarRating rating={host.rating} />
                <span>
                  {host.reviewCount} verified review
                  {host.reviewCount === 1 ? "" : "s"}
                </span>
              </div>
            ) : null}
          </div>

          {host.reviews.length ? (
            <div className={styles.reviewGrid}>
              {host.reviews.map((review) => (
                <article className={styles.reviewCard} key={review.id}>
                  <div className={styles.reviewTop}>
                    <div>
                      <strong>{review.guestName}</strong>
                      <StarRating rating={review.rating} showValue />
                    </div>
                    <span>
                      {new Date(review.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  {review.body ? <p>{review.body}</p> : null}

                  <Link
                    className={styles.reviewStay}
                    href={`/stays/${review.propertySlug}`}
                  >
                    Stayed at {review.propertyName} →
                  </Link>

                  {review.hostResponse ? (
                    <div className={styles.hostResponse}>
                      <strong>Response from {host.name}</strong>
                      <span>{review.hostResponse}</span>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyReviews}>
              No verified Find A Place reviews yet.
            </div>
          )}
        </section>

        <section
          className={`shell ${styles.messageSection}`}
          id="message-host"
        >
          <div className={styles.messageIntro}>
            <p className="eyebrow dark">Questions before booking?</p>
            <h2>Message {host.name}</h2>
            <p>
              Send a question through Find A Place. The host sees it inside
              their host dashboard; their private phone number, email and
              account details are never shown here.
            </p>
          </div>

          <div className={styles.messageCard}>
            <PublicHostInquiryForm
              hostSlug={host.slug}
              hostName={host.name}
              stays={host.stays.map((stay) => ({
                propertyId: stay.propertyId,
                name: stay.name,
              }))}
            />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
