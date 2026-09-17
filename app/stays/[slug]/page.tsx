import { notFound } from "next/navigation";

import { BookingCard } from "@/components/BookingCard";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PropertyActions } from "@/components/PropertyActions";
import { getPublishedListingBySlug } from "@/lib/public/listings";

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getPublishedListingBySlug(slug);
  if (!property) notFound();

  const images = property.images;
  const mainImage = images[0];
  const secondImage = images[1] ?? mainImage;
  const thirdImage = images[2] ?? mainImage;
  const sandboxEnabled = process.env.BOOKING_SANDBOX_ENABLED === "true";

  return (
    <>
      <Header />
      <main className="property-page">
        <div className="shell property-title">
          <div>
            <p className="eyebrow dark">
              {property.state} · {property.type}
            </p>
            <h1>{property.name}</h1>
            <p>{property.location} · New to Find A Place</p>
          </div>
          <PropertyActions />
        </div>

        <div className="shell gallery">
          {mainImage ? (
            <img
              className="gallery-main"
              src={mainImage}
              alt={`${property.name} exterior`}
            />
          ) : (
            <div className="gallery-main gallery-placeholder">Property photo</div>
          )}
          {secondImage ? (
            <img src={secondImage} alt={`${property.name} surroundings`} />
          ) : (
            <div className="gallery-placeholder">Property photo</div>
          )}
          {thirdImage ? (
            <img src={thirdImage} alt={`${property.name} detail`} />
          ) : (
            <div className="gallery-placeholder">Property photo</div>
          )}
          <div className="gallery-detail">
            <span>{images.length}</span>
            <strong>photos</strong>
          </div>
        </div>

        <div className="shell property-content">
          <article className="property-copy">
            <div className="stay-summary">
              <div><strong>{property.sleeps}</strong><span>guests</span></div>
              {property.bedrooms > 0 && (
                <div><strong>{property.bedrooms}</strong><span>bedrooms</span></div>
              )}
              <div><strong>{property.baths}</strong><span>baths</span></div>
              <div><strong>{property.type}</strong><span>stay type</span></div>
            </div>

            <h2>About this stay</h2>
            <p className="lead-copy">{property.description}</p>

            <hr />
            <h3>What this place offers</h3>
            <div className="amenity-grid">
              {property.amenities.length ? (
                property.amenities.map((amenity) => (
                  <span key={amenity}>✓ {amenity}</span>
                ))
              ) : (
                <span>Amenities are being finalized.</span>
              )}
            </div>

            {property.customAmenities ? (
              <p className="listing-custom-copy">{property.customAmenities}</p>
            ) : null}

            <hr />
            <h3>Know before you book</h3>
            <div className="amenity-grid">
              {property.policies.map((policy) => (
                <span key={policy}>✓ {policy}</span>
              ))}
            </div>

            {property.customPolicies ? (
              <p className="listing-custom-copy">{property.customPolicies}</p>
            ) : null}

            <div className="listing-stay-details">
              <span>
                Minimum stay: {property.minimumStayNights} night
                {property.minimumStayNights === 1 ? "" : "s"}
              </span>
              {property.checkIn ? (
                <span>Check-in: {property.checkIn.slice(0, 5)}</span>
              ) : null}
              {property.checkout ? (
                <span>Checkout: {property.checkout.slice(0, 5)}</span>
              ) : null}
            </div>

            {property.cancellationPolicy ? (
              <p><strong>Cancellation:</strong> {property.cancellationPolicy}</p>
            ) : null}

            <hr />
            <div className="host-block">
              <div className="host-avatar">
                {property.hostName
                  .split(" ")
                  .slice(0, 2)
                  .map((word) => word[0])
                  .join("")}
              </div>
              <div>
                <small>Hosted by</small>
                <h3>{property.hostName}</h3>
                <p>Independent host · Listed on Find A Place</p>
              </div>
            </div>
          </article>

          <BookingCard
            slug={property.slug}
            price={property.price}
            rating={0}
            maxGuests={property.sleeps}
            minimumStayNights={property.minimumStayNights}
            sandboxEnabled={sandboxEnabled}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
