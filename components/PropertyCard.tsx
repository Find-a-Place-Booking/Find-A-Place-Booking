import type { Property } from "@/data/catalog";
import { NearbyExperiencesPeek } from "@/components/NearbyExperiencesPeek";
import peekStyles from "@/components/NearbyExperiencesPeek.module.css";
import { SaveStayButton } from "@/components/SaveStayButton";
import { TrackedLink } from "@/components/TrackedLink";

import styles from "./PropertyCardEnhancements.module.css";


const standoutAmenityOrder = [
  "Waterfront",
  "Hot tub",
  "ATV access",
  "Mountain view",
  "Lake view",
  "River view",
  "Pet friendly",
  "Fireplace",
  "Private deck / patio",
  "Fire pit",
];

function cardTags(property: Property) {
  const tags = property.tags ?? [];
  const standout = standoutAmenityOrder.filter((tag) => tags.includes(tag));
  const remaining = tags.filter((tag) => !standout.includes(tag));
  return [...standout, ...remaining].slice(0, 3);
}

function nearbyDistance(property: Property) {
  const item = property.nearbyExperiences?.[0];
  if (!item) return "";

  const parts: string[] = [];

  if (
    typeof item.distanceMiles === "number" &&
    Number.isFinite(item.distanceMiles)
  ) {
    const miles =
      item.distanceMiles % 1 === 0
        ? item.distanceMiles.toFixed(0)
        : item.distanceMiles.toFixed(1);
    parts.push(`${miles} mi`);
  }

  if (
    typeof item.driveMinutes === "number" &&
    item.driveMinutes > 0
  ) {
    parts.push(`${item.driveMinutes} min`);
  }

  return parts.join(" · ");
}

export function PropertyCard({
  property,
  wide = false,
  surface = "property_card",
  availabilityConfirmed = false,
}: {
  property: Property;
  wide?: boolean;
  surface?: string;
  availabilityConfirmed?: boolean;
}) {
  const href = `/stays/${property.slug}`;
  const showNearby =
    !property.instantBook &&
    Boolean(property.nearbyExperienceCount) &&
    Boolean(property.nearbyExperiences?.length);
  const featuredNearby = property.nearbyExperiences?.[0] ?? null;
  const distance = nearbyDistance(property);
  const displayTags = cardTags(property);

  return (
    <article className={`property-card ${wide ? "property-wide" : ""}`}>
      <div className={peekStyles.mediaShell}>
        <TrackedLink
          className="property-image-wrap"
          href={href}
          prefetch={false}
          eventName="property_click"
          eventData={{
            slug: property.slug,
            surface,
            trigger: "image",
          }}
        >
          {property.image ? (
            <img
              className="property-image"
              src={property.image}
              alt={`${property.name} in ${property.location}`}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div
              className="property-image property-image-empty"
              aria-label="Property photo unavailable"
            />
          )}
          <span className="property-type">{property.type}</span>
          {property.instantBook && (
            <span className="instant-label">Instant book</span>
          )}
        </TrackedLink>

        {showNearby ? (
          <NearbyExperiencesPeek
            slug={property.slug}
            count={property.nearbyExperienceCount ?? 0}
            items={property.nearbyExperiences ?? []}
          />
        ) : null}
      </div>

      <SaveStayButton
        propertyName={property.name}
        propertySlug={property.slug}
        surface={surface}
      />

      <div className="property-body">
        <div className="property-kicker">
          <span>{property.location}</span>
          <span>
            {property.reviews > 0
              ? `★ ${property.rating}`
              : "New on Find A Place"}
          </span>
        </div>

        <TrackedLink
          href={href}
          prefetch={false}
          eventName="property_click"
          eventData={{
            slug: property.slug,
            surface,
            trigger: "title",
          }}
        >
          <h3>{property.name}</h3>
        </TrackedLink>

        {availabilityConfirmed ? (
          <div className={styles.availabilityCue}>
            <span aria-hidden="true">✓</span>
            Calendar open for these dates
          </div>
        ) : null}

        {featuredNearby ? (
          <div className={styles.tripHook}>
            <span aria-hidden="true">⌖</span>
            <strong>{featuredNearby.title}</strong>
            {distance ? <small>{distance}</small> : null}
          </div>
        ) : null}

        {displayTags.length ? (
          <p>{displayTags.join(" · ")}</p>
        ) : null}

        <div className="price-line">
          <strong>${property.price}</strong> / night
          <span>
            {property.reviews > 0
              ? `${property.reviews} reviews`
              : "Independent stay"}
          </span>
        </div>
      </div>
    </article>
  );
}
