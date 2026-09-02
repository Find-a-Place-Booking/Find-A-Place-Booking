"use client";

import Link from "next/link";
import { useState } from "react";
import type { Property } from "@/data/demo";

export function PropertyCard({ property, wide = false }: { property: Property; wide?: boolean }) {
  const [saved, setSaved] = useState(false);
  return (
    <article className={`property-card ${wide ? "property-wide" : ""}`}>
      <Link className="property-image-wrap" href={`/stays/${property.slug}`}>
        <img className="property-image" src={property.image} alt={`${property.name} in ${property.location}`} />
        <span className="property-type">{property.type}</span>
        {property.instantBook && <span className="instant-label">Instant book</span>}
      </Link>
      <button
        className={`heart ${saved ? "saved" : ""}`}
        aria-label={saved ? `Remove ${property.name} from saved stays` : `Save ${property.name}`}
        aria-pressed={saved}
        onClick={() => setSaved((value) => !value)}
        type="button"
      >{saved ? "♥" : "♡"}</button>
      <div className="property-body">
        <div className="property-kicker"><span>{property.location}</span><span>★ {property.rating}</span></div>
        <Link href={`/stays/${property.slug}`}><h3>{property.name}</h3></Link>
        <p>{property.tags.slice(0, 3).join(" · ")}</p>
        <div className="price-line"><strong>${property.price}</strong> / night <span>{property.reviews} reviews</span></div>
      </div>
    </article>
  );
}
