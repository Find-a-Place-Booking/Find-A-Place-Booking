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

export default async function StaysPage({ searchParams }: { searchParams: Promise<{ where?: string; checkin?: string; checkout?: string; guests?: string }> }) {
  const [params, properties] = await Promise.all([searchParams, getPublishedProperties()]);
  const where = params.where || "";
  const checkin = params.checkin || "";
  const checkout = params.checkout || "";
  const guests = params.guests || "2";
  const start = prettyDate(checkin);
  const end = prettyDate(checkout);
  const tripLine = start && end ? `${start}–${end} · ${guests} guests` : `${guests} guests`;

  return (
    <>
      <Header />
      <main className="results-main">
        <div className="shell">
          <div className="results-search"><SearchBar compact where={where} checkin={checkin} checkout={checkout} guests={guests} /></div>
          <div className="results-head">
            <div><p className="eyebrow dark">{tripLine}</p><h1>{where ? `Stays around ${where}` : "Browse published stays"}</h1><p>Browse approved listings by location and trip details. Date availability and reservations remain intentionally disabled until the calendar and booking milestones.</p></div>
            <div className="availability-fresh"><i/> Published inventory is live; date availability is not connected yet</div>
          </div>
        </div>
        <StayResults properties={properties} destination={where} guests={Number.parseInt(guests, 10) || 2} />
      </main>
      <Footer />
    </>
  );
}
