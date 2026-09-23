import Link from "next/link";

import type { Property } from "@/data/catalog";
import { SaveStayButton } from "@/components/SaveStayButton";

export function PropertyCard({
  property,
  wide = false,
}: {
  property: Property;
  wide?: boolean;
}) {
  return (
    <article className={`property-card ${wide ? "property-wide" : ""}`}>
      <Link
        className="property-image-wrap"
        href={`/stays/${property.slug}`}
        prefetch={false}
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
          <div className="property-image property-image-empty">
            Photo coming soon
          </div>
        )}
        <span className="property-type">{property.type}</span>
        {property.instantBook && <span className="instant-label">Instant book</span>}
      </Link>

      <SaveStayButton propertyName={property.name} />

      <div className="property-body">
        <div className="property-kicker">
          <span>{property.location}</span>
          <span>
            {property.reviews > 0
              ? `★ ${property.rating}`
              : "New on Find A Place"}
          </span>
        </div>
        <Link href={`/stays/${property.slug}`} prefetch={false}>
          <h3>{property.name}</h3>
        </Link>
        <p>{property.tags.slice(0, 3).join(" · ")}</p>
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
