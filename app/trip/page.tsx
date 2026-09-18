import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function TripLookupPage(){
  return <><Header /><main className="guest-state-wrap"><section className="shell standalone-empty trip-lookup guest-state-card"><p className="eyebrow dark">Your trips</p><h1>Open your secure trip link.</h1><p>Confirmed guests receive a reservation-specific trip link after payment. Use that link to view stay details, contact the host, and leave a verified review after checkout.</p><p>If you lost the confirmation link, contact Find A Place support with the booking email and confirmation number so we can verify the reservation safely.</p><Link className="button" href="/stays">Find another stay</Link></section></main><Footer /></>;
}
