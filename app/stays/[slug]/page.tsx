import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";

import { BackToStayResults } from "@/components/BackToStayResults";
import { BookingCard } from "@/components/BookingCard";
import { Footer } from "@/components/Footer";
import { GuestStayRecommendations } from "@/components/GuestStayRecommendations";
import { Header } from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import { PropertyActions } from "@/components/PropertyActions";
import { PropertyGallery } from "@/components/PropertyGallery";
import { PropertyReviews } from "@/components/PropertyReviews";
import { PublicHostCard } from "@/components/PublicHostCard";
import { PublicNearbyExperiences } from "@/components/PublicNearbyExperiences";
import { getPublishedListingBySlug } from "@/lib/public/listings";
import { absoluteUrl, seoDescription } from "@/lib/seo";
import { createAdminClient } from "@/lib/supabase/admin";

const getProperty = cache(getPublishedListingBySlug);

type BedConfigurationEntry = {
  type: string;
  count: number;
};

function parseBedConfiguration(value: unknown): BedConfigurationEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const type = typeof row.type === "string" ? row.type.trim() : "";
    const count = Number(row.count || 0);
    if (!type || !Number.isInteger(count) || count < 1 || count > 20) return [];
    return [{ type, count }];
  });
}

function bedLabel(entry: BedConfigurationEntry) {
  const singularPlural: Record<string, [string, string]> = {
    King: ["king bed", "king beds"],
    Queen: ["queen bed", "queen beds"],
    "Full / double": ["full / double bed", "full / double beds"],
    "Twin / single": ["twin / single bed", "twin / single beds"],
    "Bunk bed": ["bunk bed", "bunk beds"],
    "Sofa bed": ["sofa bed", "sofa beds"],
    Futon: ["futon", "futons"],
    "Murphy bed": ["Murphy bed", "Murphy beds"],
    Crib: ["crib", "cribs"],
  };
  const labels =
    singularPlural[entry.type] ?? [
      entry.type.toLowerCase(),
      entry.type.toLowerCase(),
    ];
  return `${entry.count} ${entry.count === 1 ? labels[0] : labels[1]}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const property = await getProperty(slug);

  if (!property) {
    return {
      title: "Stay not found",
      robots: { index: false, follow: false },
    };
  }

  const description = seoDescription(
    property.description,
    `${property.name} in ${property.location}. View details and availability on Find A Place Booking.`,
  );
  const canonical = `/stays/${property.slug}`;
  const socialImage = property.images[0]
    ? absoluteUrl(
        `/api/public/stay-social-image/${encodeURIComponent(
          property.slug,
        )}`,
      )
    : absoluteUrl("/brand/find-a-place-seal.png");

  return {
    title: property.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title: property.name,
      description,
      url: canonical,
      images: [{ url: socialImage, alt: property.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: property.name,
      description,
      images: [socialImage],
    },
  };
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const property = await getProperty(slug);
  if (!property) notFound();

  let bedConfiguration: BedConfigurationEntry[] = [];
  try {
    const admin = createAdminClient();
    const { data: unitBedData, error: unitBedError } = await admin
      .from("property_units")
      .select("bed_configuration")
      .eq("id", property.unitId)
      .maybeSingle();

    if (!unitBedError) {
      bedConfiguration = parseBedConfiguration(
        unitBedData?.bed_configuration,
      );
    }
  } catch (error) {
    console.error("[public stay] bed configuration unavailable", error);
  }

  const legacyBedAmenities = new Set([
    "King bed",
    "Queen bed",
    "Full / double bed",
    "Twin bed",
    "Bunk beds",
    "Sofa bed",
  ]);
  const visibleAmenities = bedConfiguration.length
    ? property.amenities.filter(
        (amenity) => !legacyBedAmenities.has(amenity),
      )
    : property.amenities;

  const lodgingSchema = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: property.name,
    description: seoDescription(property.description),
    url: absoluteUrl(`/stays/${property.slug}`),
    address: {
      "@type": "PostalAddress",
      addressLocality: property.city || undefined,
      addressRegion: property.state || undefined,
      addressCountry: "US",
    },
    priceRange:
      property.price > 0 ? `$${property.price}+` : undefined,
    amenityFeature: property.amenities
      .slice(0, 20)
      .map((amenity) => ({
        "@type": "LocationFeatureSpecification",
        name: amenity,
        value: true,
      })),
    ...(property.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: property.rating,
            reviewCount: property.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  const checkoutEnabled =
    process.env.BOOKING_CHECKOUT_ENABLED === "true";
  const testMode = (
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ""
  ).startsWith("pk_test_");

  return (
    <>
      <JsonLd data={lodgingSchema} />
      <Header />

      <main className="property-page">
        <div className="shell stay-back-row">
          <BackToStayResults />
        </div>

        <div className="shell property-title">
          <div>
            <p className="eyebrow dark">
              {property.state} · {property.type}
            </p>
            <h1>{property.name}</h1>
            <p>
              {property.location}
              {property.reviewCount
                ? ` · ${property.rating.toFixed(1)}/5 from ${
                    property.reviewCount
                  } verified review${
                    property.reviewCount === 1 ? "" : "s"
                  }`
                : " · New to Find A Place"}
            </p>
          </div>

          <PropertyActions
            propertyName={property.name}
            propertySlug={property.slug}
          />
        </div>

        <PropertyGallery
          propertyName={property.name}
          images={property.images}
        />

        <div className="shell">
          <PublicNearbyExperiences propertyId={property.propertyId} />
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

              {property.beds > 0 && (
                <div>
                  <strong>{property.beds}</strong>
                  <span>beds</span>
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

            {bedConfiguration.length ? (
              <>
                <hr />
                <h3>Sleeping arrangements</h3>
                <div className="sleeping-arrangements">
                  {bedConfiguration.map((entry) => (
                    <span key={entry.type}>{bedLabel(entry)}</span>
                  ))}
                </div>
              </>
            ) : null}

            <hr />
            <h3>What this place offers</h3>

            <div className="amenity-grid">
              {visibleAmenities.length ? (
                visibleAmenities.map((amenity) => (
                  <span key={amenity}>✓ {amenity}</span>
                ))
              ) : (
                <span>No additional amenities listed.</span>
              )}
            </div>

            {property.customAmenities ? (
              <p className="listing-custom-copy">
                {property.customAmenities}
              </p>
            ) : null}

            <hr />
            <h3>Know before you book</h3>

            <div className="amenity-grid">
              {property.policies.map((policy) => (
                <span key={policy}>✓ {policy}</span>
              ))}
            </div>

            {property.customPolicies ? (
              <p className="listing-custom-copy">
                {property.customPolicies}
              </p>
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
                <span>
                  Check-in: {property.checkIn.slice(0, 5)}
                </span>
              ) : null}

              {property.checkout ? (
                <span>
                  Checkout: {property.checkout.slice(0, 5)}
                </span>
              ) : null}
            </div>

            {property.cancellationPolicy ? (
              <p>
                <strong>Cancellation:</strong>{" "}
                {property.cancellationPolicy}
              </p>
            ) : null}

            <hr />

            <PublicHostCard
              propertyId={property.propertyId}
              fallbackHostName={property.hostName}
            />

            <hr />

            <PropertyReviews
              rating={property.rating}
              reviewCount={property.reviewCount}
              reviews={property.reviews}
            />
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

        <Suspense fallback={null}>
          <GuestStayRecommendations
            propertyId={property.propertyId}
            slug={property.slug}
            city={property.city}
            state={property.state}
            type={property.type}
            location={property.location}
            price={property.price}
          />
        </Suspense>
      </main>

      <Footer />
    </>
  );
}
