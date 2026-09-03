import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SearchBar } from "@/components/SearchBar";
import { StayResults } from "@/components/StayResults";
import { properties } from "@/data/catalog";

function prettyDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function StaysPage({ searchParams }: { searchParams: Promise<{ where?: string; checkin?: string; checkout?: string; guests?: string }> }) {
  const params = await searchParams;
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
            <div><p className="eyebrow dark">{tripLine}</p><h1>{where ? `Stays around ${where}` : "Find an available stay"}</h1><p>Search the network by location and real trip dates, then book the stay you want in one place.</p></div>
            <div className="availability-fresh"><i/> Live availability will appear with connected inventory</div>
          </div>
        </div>
        <StayResults properties={properties} destination={where} guests={Number.parseInt(guests, 10) || 2} />
      </main>
      <Footer />
    </>
  );
}
