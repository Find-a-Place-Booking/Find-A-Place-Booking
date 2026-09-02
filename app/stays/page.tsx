import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SearchBar } from "@/components/SearchBar";
import { StayResults } from "@/components/StayResults";
import { properties } from "@/data/demo";

function prettyDate(value?: string) {
  if (!value) return "Sep 18";
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function StaysPage({
  searchParams
}: {
  searchParams: Promise<{ where?: string; checkin?: string; checkout?: string; guests?: string }>;
}) {
  const params = await searchParams;
  const where = params.where || "Arkansas & Missouri";
  const checkin = params.checkin || "2026-09-18";
  const checkout = params.checkout || "2026-09-21";
  const guests = params.guests || "4";
  return (
    <>
      <Header />
      <main className="results-main">
        <div className="shell">
          <div className="results-search"><SearchBar compact where={where} checkin={checkin} checkout={checkout} guests={guests} /></div>
          <div className="results-head">
            <div>
              <p className="eyebrow dark">{prettyDate(checkin)}–{prettyDate(checkout)} · {guests} guests</p>
              <h1>{where === "Arkansas & Missouri" ? "Places open for your dates" : `Stays around ${where}`}</h1>
              <p>Search the network by real trip dates, then book the stay you want in one place.</p>
            </div>
            <div className="availability-fresh"><i/> Availability checked just now</div>
          </div>
        </div>
        <StayResults properties={properties} destination={where} guests={Number.parseInt(guests, 10) || 2} />
      </main>
      <Footer />
    </>
  );
}
