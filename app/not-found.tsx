import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function NotFound() {
  return <><Header /><main className="guest-state-wrap"><section className="shell standalone-empty guest-state-card"><p className="eyebrow dark">Not found</p><h1>That place isn’t here.</h1><p>The stay may have moved, may not be live yet, or the link may have changed.</p><Link className="button" href="/stays">Browse stays</Link></section></main><Footer /></>;
}
