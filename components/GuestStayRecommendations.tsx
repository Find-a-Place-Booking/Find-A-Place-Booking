import Link from "next/link";

import { PropertyCard } from "@/components/PropertyCard";
import { getPublicHostProfileForProperty } from "@/lib/hosts/public-profile";
import { getStayRecommendations } from "@/lib/public/recommendations";

import styles from "./GuestStayRecommendations.module.css";

export async function GuestStayRecommendations({
  propertyId,
  slug,
  city,
  state,
  type,
  location,
  price,
}: {
  propertyId: string;
  slug: string;
  city: string;
  state: string;
  type: string;
  location: string;
  price: number;
}) {
  const groups = await getStayRecommendations({
    propertyId,
    slug,
    city,
    state,
    type,
    location,
    price,
  });

  if (!groups.sameHost.length && !groups.nearby.length) return null;

  const host = groups.sameHost.length
    ? await getPublicHostProfileForProperty(propertyId)
    : null;

  return (
    <div className={`shell ${styles.wrap}`}>
      {groups.sameHost.length ? (
        <section className={styles.section}>
          <div className={styles.heading}>
            <div>
              <p className="eyebrow dark">More from this host</p>
              <h2>
                More stays from {host?.name || "this host"}
              </h2>
              <p>
                Like the host but need a different setup? Keep browsing without
                starting your search over.
              </p>
            </div>

            <Link className="under-link" href="/host-profiles">
              Meet the hosts →
            </Link>
          </div>

          <div className={styles.grid}>
            {groups.sameHost.map((property) => (
              <PropertyCard
                key={property.slug}
                property={property}
                surface="stay_more_from_host"
              />
            ))}
          </div>
        </section>
      ) : null}

      {groups.nearby.length ? (
        <section className={styles.section}>
          <div className={styles.heading}>
            <div>
              <p className="eyebrow dark">Keep exploring</p>
              <h2>More stays worth a look nearby</h2>
              <p>
                Similar stays in the same area or region, so one listing that
                is not quite right does not end the search.
              </p>
            </div>

            <Link
              className="under-link"
              href={
                city
                  ? `/stays?where=${encodeURIComponent(city)}`
                  : "/stays"
              }
            >
              Browse more stays →
            </Link>
          </div>

          <div className={styles.grid}>
            {groups.nearby.map((property) => (
              <PropertyCard
                key={property.slug}
                property={property}
                surface="stay_nearby_recommendations"
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
