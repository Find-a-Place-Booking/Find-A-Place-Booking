import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getPublicHostDirectory } from "@/lib/hosts/public-profile";

import styles from "./host-directory.module.css";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Meet the Hosts",
  description:
    "Browse independent Find A Place hosts, see their published stays and read verified guest reviews.",
  alternates: { canonical: "/host-profiles" },
  openGraph: {
    title: "Meet the Hosts | Find A Place",
    description:
      "Browse independent Find A Place hosts, their stays and verified guest reviews.",
    url: "/host-profiles",
  },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "H";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default async function HostDirectoryPage() {
  const hosts = await getPublicHostDirectory();

  return (
    <>
      <Header />

      <main className={styles.page}>
        <section className={`shell ${styles.hero}`}>
          <p className="eyebrow dark">Independent hosts</p>
          <h1>Meet the people behind the stays.</h1>
          <p>
            Browse public host profiles, see every stay they currently have
            published on Find A Place, and read verified guest reviews from
            completed bookings.
          </p>
        </section>

        <section className={`shell ${styles.grid}`}>
          {hosts.length ? (
            hosts.map((host) => (
              <Link
                className={styles.card}
                href={`/hosts/${encodeURIComponent(host.slug)}`}
                key={host.organizationId}
              >
                <div className={styles.avatar}>
                  {host.avatarUrl ? (
                    <img
                      src={host.avatarUrl}
                      alt={`${host.name} host profile`}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span>{initials(host.name)}</span>
                  )}
                </div>

                <div className={styles.body}>
                  <span className={styles.kicker}>Find A Place host</span>
                  <h2>{host.name}</h2>

                  <div className={styles.meta}>
                    <span>
                      {host.stayCount} stay{host.stayCount === 1 ? "" : "s"}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {host.reviewCount
                        ? `${host.rating.toFixed(1)} ★ · ${host.reviewCount} verified review${
                            host.reviewCount === 1 ? "" : "s"
                          }`
                        : "New host reviews coming soon"}
                    </span>
                  </div>

                  {host.publicBio ? (
                    <p>{host.publicBio}</p>
                  ) : (
                    <p>
                      View this host&apos;s published stays and guest feedback.
                    </p>
                  )}

                  <strong className={styles.action}>
                    View host profile →
                  </strong>
                </div>
              </Link>
            ))
          ) : (
            <div className={styles.empty}>
              <strong>No public host profiles are available yet.</strong>
              <span>Published hosts will appear here automatically.</span>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </>
  );
}
