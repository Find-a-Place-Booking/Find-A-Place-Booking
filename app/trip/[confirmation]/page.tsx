import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default async function TripPage({ params }: { params: Promise<{ confirmation: string }> }) {
  await params;
  return <><Header /><main className="trip-page"><div className="shell standalone-empty"><p className="eyebrow dark">Trip management</p><h1>No reservation record is available.</h1><p>Trip pages will be populated from confirmed reservations in the production database. No sample guest, host, payment or stay information is shown in this shell.</p><Link href="/stays" className="button">Find a stay</Link></div></main><Footer /></>;
}
