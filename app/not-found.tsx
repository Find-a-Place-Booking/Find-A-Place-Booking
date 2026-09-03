import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function NotFound() {
  return <><Header /><main className="shell standalone-empty"><p className="eyebrow dark">Not found</p><h1>That stay isn’t available here.</h1><p>It may not be live yet, or the link may have changed.</p><Link className="button" href="/stays">Search available stays</Link></main><Footer /></>;
}
