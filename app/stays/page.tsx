import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SearchBar } from "@/components/SearchBar";
import { StayResults } from "@/components/StayResults";
import { getPublishedProperties } from "@/lib/public/listings";

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
  "2+ bedrooms": "Stays with room to spread out"
};

export default async function StaysPage({ searchParams }: { searchParams: Promise<{ where?: string; checkin?: string; checkout?: string; guests?: string; filter?: string }> }) {
  const params = await searchParams;
  const where = params.where || "";
  const checkin = params.checkin || "";
  const checkout = params.checkout || "";
  const properties = await getPublishedProperties({ checkIn: checkin, checkOut: checkout });
  const guests = params.guests || "2";
  const initialFilter = params.filter && collectionHeadings[params.filter] ? params.filter : "";
  const start = prettyDate(checkin);
  const end = prettyDate(checkout);
  const tripLine = start && end ? `${start}–${end} · ${guests} guests` : `${guests} guests`;
  const collectionHeading = initialFilter ? collectionHeadings[initialFilter] : "";
  const heading = where && collectionHeading ? `${collectionHeading} near ${where}` : where ? `Stays near ${where}` : collectionHeading || "Find your next stay";

  return (
    <>
      <Header />
      <main className="results-main">
        <section className="results-search-band">
          <div className="shell">
            <div className="results-search"><SearchBar compact where={where} checkin={checkin} checkout={checkout} guests={guests} /></div>
            <p className="results-trip-line">{tripLine}</p>
          </div>
        </section>
        <section className="shell results-summary-band">
          <div className="results-head">
            <div><h1>{heading}</h1><p>Browse published Find A Place stays and compare the places that fit your trip.</p></div>
            <div className="availability-fresh"><i/> {start && end ? "Availability checked for these dates" : "Live availability on each stay"}</div>
          </div>
        </section>
        <StayResults properties={properties} destination={where} guests={Number.parseInt(guests, 10) || 2} initialFilter={initialFilter} />
      </main>
      <Footer />
    </>
  );
}
