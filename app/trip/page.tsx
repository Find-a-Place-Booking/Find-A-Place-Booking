import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function TripLookupPage(){
  return <><Header /><main className="guest-state-wrap"><section className="shell standalone-empty trip-lookup guest-state-card"><p className="eyebrow dark">Your trips</p><h1>Keep your Find A Place trips together.</h1><p>When online booking opens, use your confirmation number and booking email to pull up the stay, dates and trip details here.</p><div className="lookup-form"><input placeholder="Confirmation number" disabled/><input type="email" placeholder="Booking email" disabled/><button className="button" disabled>Find reservation</button></div><Link className="under-link" href="/stays">Find a stay instead →</Link></section></main><Footer /></>;
}
