import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { StayResults } from "@/components/StayResults";
import { propertyMatchesDestination } from "@/data/catalog";
import { getPublishedProperties } from "@/lib/public/listings";
import { copyBlock, loadManagedCopy } from "@/lib/public/managed-copy";

function prettyDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const collectionHeadings: Record<string, string> = {
  Cabin: "Cabins",
  "RV Site": "RV stays",
  "Hot tub": "Stays with hot tubs",
  "Pet friendly": "Pet-friendly stays",
  Waterfront: "Waterfront stays",
  "Under $250": "Stays under $250",
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
    filter?: string;
  }>;
}) {
  const params = await searchParams;
  const where = params.where || "";
  const checkin = params.checkin || "";
  const checkout = params.checkout || "";
  const guests = params.guests || "2";
  const guestCount = Number.parseInt(guests, 10) || 2;

  const [allProperties, content] = await Promise.all([
    getPublishedProperties({ checkIn: checkin, checkOut: checkout }),
    loadManagedCopy(defaults),
  ]);

  // Do the fixed destination + guest filtering on the server so the browser
  // only receives the inventory relevant to this search. Interactive chips and
  // sorting still stay client-side without another round trip.
  const properties = allProperties.filter(
    (property) =>
      propertyMatchesDestination(property, where) &&
      property.sleeps >= guestCount,
  );

  const summary = copyBlock(content, "stays.summary");
  const initialFilter =
    params.filter && collectionHeadings[params.filter] ? params.filter : "";
  const start = prettyDate(checkin);
  const end = prettyDate(checkout);
  const tripLine = start && end
    ? `${start}–${end} · ${guests} guests`
    : `${guests} guests`;
  const collectionHeading = initialFilter ? collectionHeadings[initialFilter] : "";
  const heading = where && collectionHeading
    ? `${collectionHeading} near ${where}`
    : where
      ? `Stays near ${where}`
      : collectionHeading || summary.title;

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
              />
            </div>
            <p className="results-trip-line">{tripLine}</p>
          </div>
        </section>

        <section className="shell results-summary-band">
          <div className="results-head">
            <div>
              <h1>{heading}</h1>
              <p>{summary.body}</p>
            </div>
            <div className="availability-fresh">
              <i />
              {start && end
                ? "Availability checked for these dates"
                : "Live availability on each stay"}
            </div>
          </div>
        </section>

        <StayResults
          properties={properties}
          destination=""
          guests={1}
          initialFilter={initialFilter}
          inventoryAvailable={allProperties.length > 0}
        />
      </main>
      <Footer />
    </>
  );
}
