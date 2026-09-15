import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default async function TripPage({ params }: { params: Promise<{ confirmation: string }> }) {
  await params;
  return <><Header /><main className="guest-state-wrap"><section className="shell standalone-empty guest-state-card"><p className="eyebrow dark">Your trip</p><h1>We couldn’t find a reservation here yet.</h1><p>Confirmed trip details will live on this page once online booking opens.</p><Link href="/stays" className="button">Find a stay</Link></section></main><Footer /></>;
}
