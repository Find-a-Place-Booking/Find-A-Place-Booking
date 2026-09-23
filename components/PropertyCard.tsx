import type { Property } from "@/data/catalog";
import { SaveStayButton } from "@/components/SaveStayButton";
import { TrackedLink } from "@/components/TrackedLink";

export function PropertyCard({
  property,
  wide = false,
  surface = "property_card",
}: {
  property: Property;
  wide?: boolean;
  surface?: string;
}) {
  const href = `/stays/${property.slug}`;

  return (
    <article className={`property-card ${wide ? "property-wide" : ""}`}>
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
          <div className="property-image property-image-empty">
            Photo coming soon
          </div>
        )}
        <span className="property-type">{property.type}</span>
        {property.instantBook && <span className="instant-label">Instant book</span>}
      </TrackedLink>

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
