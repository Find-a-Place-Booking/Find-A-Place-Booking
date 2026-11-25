import type { Metadata } from "next";
import Link from "next/link";
import { DESTINATIONS } from "@/lib/seo/destinations";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { StayResults } from "@/components/StayResults";
import { normalizeSearchRadiusMiles, searchPublishedStaysNearby } from "@/lib/public/nearby-destination-search";
import { BUFFALO_RIVER_MAX_DISTANCE_MILES, isBuffaloRiverSearch } from "@/lib/public/buffalo-river-discovery";
import { getPublishedProperties } from "@/lib/public/listings";
import { isCampingOrRv } from "@/lib/public/stay-type-order";
import { annotateAndSortPartnerFirst } from "@/lib/public/partner-priority";
import { copyBlock, loadManagedCopy } from "@/lib/public/managed-copy";

export const metadata: Metadata = {
  title: "Find a Stay",
  description:
    "Browse published cabins, cottages, RV stays, lake stays and independent getaways on Find A Place Booking.",
  alternates: { canonical: "/stays" },
  openGraph: {
    title: "Find a Stay",
    description:
      "Browse published cabins, cottages, RV stays, lake stays and independent getaways on Find A Place Booking.",
    url: "/stays",
  },
};

function prettyDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const collectionHeadings: Record<string, string> = {
  Cabin: "Cabins",
  "Sleeps 8+": "Group getaways for eight or more",
  "Luxury stays": "Luxury cabins and premium stays",
  "Unique stays": "Cabooses, treehouses and other one-of-a-kind stays",
  "Buffalo National River": "Stays near the Buffalo National River",
  "RV Site": "RV stays",
  "Hot tub": "Stays with hot tubs",
  "Pet friendly": "Pet-friendly stays",
  Waterfront: "Waterfront stays",
  "ATV access": "Stays with ATV access",
  "Budget Friendly": "Budget-friendly stays under $150",
  "2+ bedrooms": "Stays with room to spread out",
};

const defaults = {
  "stays.summary": {
    title: "Find your next stay",
    body: "Browse published Find A Place stays and compare the places that fit your trip.",
  },
};

export default async function StaysPage({
  searchParams,
}: {
  searchParams: Promise<{
    where?: string;
    checkin?: string;
    checkout?: string;
    guests?: string;
    radius?: string;
    filter?: string;
  }>;
}) {
  const params = await searchParams;
  const where = params.where || "";
  const checkin = params.checkin || "";
  const checkout = params.checkout || "";
  const guests = params.guests || "2";
  const guestCount = Number.parseInt(guests, 10) || 2;
  const radius = normalizeSearchRadiusMiles(params.radius);

  const [allProperties, content] = await Promise.all([
    // Preserve homepage featured-priority bands and their weekly rotation;
    // below we also sort by actual partner verification, which covers verified
    // listings deliberately omitted from homepage featured inventory.
    getPublishedProperties({ checkIn: checkin, checkOut: checkout, featuredPriority: true }),
    loadManagedCopy(defaults),
  ]);

  const search = await searchPublishedStaysNearby(allProperties, where, radius);
  // Put live introductory offers first in recommended results. Preserve
  // partner and cabin/RV ordering inside each group and all search filters.
  const properties = (await annotateAndSortPartnerFirst(
    search.properties
      .filter((property) => property.sleeps >= guestCount)
      .sort((a, b) =>
        Number(isCampingOrRv(a.type, a.name)) - Number(isCampingOrRv(b.type, b.name)),
      ),
  )).sort((a, b) =>
    Number(Number(b.introOfferRemaining || 0) > 0) - Number(Number(a.introOfferRemaining || 0) > 0),
  );

  const summary = copyBlock(content, "stays.summary");
  // Old Under $150 links still open the new Budget Friendly collection.
  const requestedFilter = params.filter === "Under $150" ? "Budget Friendly" : params.filter;
  const initialFilter =
    requestedFilter && collectionHeadings[requestedFilter] ? requestedFilter : "";
  const start = prettyDate(checkin);
  const end = prettyDate(checkout);
  const tripLine = start && end
    ? `${start}–${end} · ${guests} guests`
    : `${guests} guests`;
  const collectionHeading = initialFilter ? collectionHeadings[initialFilter] : "";
  const buffaloRiverSearch = isBuffaloRiverSearch(where) || initialFilter === "Buffalo National River";
  const heading = where && collectionHeading
    ? `${collectionHeading} near ${where}`
    : where
      ? `Stays near ${where}`
      : collectionHeading || summary.title;
  const dateFiltered = Boolean(
    start &&
      end &&
      /^\d{4}-\d{2}-\d{2}$/.test(checkin) &&
      /^\d{4}-\d{2}-\d{2}$/.test(checkout) &&
      checkout > checkin,
  );

  return (
    <>
      <Header />
      <main className="results-main">
        <section className="results-search-band">
          <div className="shell">
            <div className="results-search">
              <SearchBar
                compact
                where={where}
                checkin={checkin}
                checkout={checkout}
                guests={guests}
                radius={String(radius)}
              />
            </div>
            <p className="results-trip-line">{tripLine}</p>
          </div>
        </section>

        <section className="shell results-summary-band">
          <div className="results-head">
            <div>
              <h1>{heading}</h1>
              <p>
                {summary.body}
                {buffaloRiverSearch
                  ? ` Buffalo River stays are within roughly ${Math.min(radius, BUFFALO_RIVER_MAX_DISTANCE_MILES)} straight-line miles of park access points; actual drives may be longer.`
                  : search.usedNearby
                    ? ` Search covers roughly ${radius} miles around ${where}, including smaller nearby communities.`
                    : null}
              </p>
            </div>
            <div className="availability-fresh">
              <i />
              {dateFiltered
                ? "Calendar checked for these dates"
                : "Live availability on each stay"}
            </div>
          </div>
        </section>

        <nav className="shell" aria-label="Explore places to stay by destination" style={{padding:"12px 0 22px"}}>
          <strong style={{display:"block",fontSize:"0.9rem",marginBottom:10}}>Browse stays near popular Arkansas destinations</strong>
          <div style={{display:"flex",flexWrap:"wrap",gap:"8px 19px"}}>
            {DESTINATIONS.map(area => <Link key={area.slug} href={`/destinations/${area.slug}`} style={{fontSize:"0.86rem",textDecoration:"underline",textUnderlineOffset:3}}>{area.name}</Link>)}
          </div>
        </nav>

        <StayResults
          properties={properties}
          radiusMiles={radius}
          destination=""
          guests={1}
          initialFilter={initialFilter}
          inventoryAvailable={allProperties.length > 0}
          availabilityConfirmed={dateFiltered}
        />
      </main>
      <Footer />
    </>
  );
}
