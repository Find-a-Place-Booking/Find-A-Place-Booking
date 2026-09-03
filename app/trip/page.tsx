import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function TripLookupPage(){
  return <><Header /><main className="shell standalone-empty trip-lookup"><p className="eyebrow dark">Manage a trip</p><h1>Keep every reservation in one place.</h1><p>Once live reservations are connected, guests will be able to open a trip using the booking confirmation and the email used at checkout.</p><div className="lookup-form"><input placeholder="Confirmation number" disabled/><input type="email" placeholder="Booking email" disabled/><button className="button" disabled>Find reservation</button></div><Link className="under-link" href="/stays">Search stays instead →</Link></main><Footer /></>;
}
