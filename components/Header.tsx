import Link from "next/link";
import { Brand } from "./Brand";

export function Header({ light = false }: { light?: boolean }) {
  return (
    <header className={`site-header ${light ? "header-light" : ""}`}>
      <div className="shell header-inner">
        <Brand />
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/stays">Find a stay</Link>
          <Link href="/#regions">Destinations</Link>
          <Link href="/hosts">For hosts</Link>
          <Link href="/#story">Why Find A Place</Link>
        </nav>
        <div className="header-actions">
          <Link className="text-link" href="/trip/FAP-84291">My trip</Link>
          <Link className="text-link" href="/host">Host sign in</Link>
          <Link className="button button-small button-outline" href="/host/onboarding">List your property</Link>
        </div>
      </div>
    </header>
  );
}
