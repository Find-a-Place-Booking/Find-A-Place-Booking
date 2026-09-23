import { notFound } from "next/navigation";

import { BookingCard } from "@/components/BookingCard";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PropertyActions } from "@/components/PropertyActions";
import { PublicHostCard } from "@/components/PublicHostCard";
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

  const checkoutEnabled = process.env.BOOKING_CHECKOUT_ENABLED === "true";
  const testMode = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").startsWith(
    "pk_test_",
  );

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
            <p>
              {property.location}
              {property.reviewCount
                ? ` · ${property.rating}/5 from ${property.reviewCount} verified review${
                    property.reviewCount === 1 ? "" : "s"
                  }`
                : " · New to Find A Place"}
            </p>
          </div>

          <PropertyActions />
        </div>

        <div className="shell gallery">
          {mainImage ? (
            <img
              className="gallery-main"
              src={mainImage}
              alt={`${property.name} exterior`}
              loading="eager"
              decoding="async"
              fetchPriority="high"
            />
          ) : (
            <div className="gallery-main gallery-placeholder">Property photo</div>
          )}

          {secondImage ? (
            <img
              src={secondImage}
              alt={`${property.name} surroundings`}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="gallery-placeholder">Property photo</div>
          )}

          {thirdImage ? (
            <img
              src={thirdImage}
              alt={`${property.name} detail`}
              loading="lazy"
              decoding="async"
            />
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
              <div>
                <strong>{property.sleeps}</strong>
                <span>guests</span>
              </div>

              {property.bedrooms > 0 && (
                <div>
                  <strong>{property.bedrooms}</strong>
                  <span>bedrooms</span>
                </div>
              )}

              <div>
                <strong>{property.baths}</strong>
                <span>baths</span>
              </div>

              <div>
                <strong>{property.type}</strong>
                <span>stay type</span>
              </div>
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

            {property.policyDocument ? (
              <p>
                <a
                  className="under-link"
                  href={property.policyDocument.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Read full property policies (PDF) →
                </a>
              </p>
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
              <p>
                <strong>Cancellation:</strong> {property.cancellationPolicy}
              </p>
            ) : null}

            <hr />

            <PublicHostCard
              propertyId={property.propertyId}
              fallbackHostName={property.hostName}
            />

            <hr />
            <h3>
              {property.reviewCount
                ? `${property.rating}/5 from ${property.reviewCount} verified review${
                    property.reviewCount === 1 ? "" : "s"
                  }`
                : "Guest reviews"}
            </h3>

            {property.reviews.length ? (
              <div className="admin-list compact">
                {property.reviews.map((review) => (
                  <div className="admin-list-row static" key={review.id}>
                    <span>
                      <strong>
                        {review.rating}/5 · {review.guestName}
                      </strong>
                      <small>
                        {review.body || "Rating submitted without written copy."}
                      </small>
                      {review.hostResponse ? (
                        <small>
                          <strong>Host response:</strong> {review.hostResponse}
                        </small>
                      ) : null}
                    </span>
                    <span>
                      <small>
                        {new Date(review.createdAt).toLocaleDateString("en-US")}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No verified guest reviews yet.</p>
            )}
          </article>

          <BookingCard
            unitId={property.unitId}
            slug={property.slug}
            price={property.price}
            rating={property.rating}
            maxGuests={property.sleeps}
            minimumStayNights={property.minimumStayNights}
            checkoutEnabled={checkoutEnabled}
            testMode={testMode}
          />
        </div>
      </main>

      <Footer />
    </>
  );
}
