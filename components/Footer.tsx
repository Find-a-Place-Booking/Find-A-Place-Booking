import Link from "next/link";
import { Brand } from "./Brand";

export function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer-grid">
        <div><Brand compact /><p>Independent stays, regional knowledge and a simpler way to book Arkansas, Missouri and the places beyond.</p></div>
        <div><strong>Explore</strong><Link href="/stays">Available stays</Link><a href="/#regions">Destinations</a><a href="/#story">Why Find A Place</a></div>
        <div><strong>For hosts</strong><Link href="/hosts">Host plan</Link><Link href="/host/onboarding">List a property</Link><Link href="/host">Host portal</Link></div>
        <div><strong>Your booking</strong><Link href="/trip/FAP-84291">Manage a trip</Link><span>Property policies</span><span>Help & support</span></div>
      </div>
      <div className="shell footer-bottom"><span>© 2026 Find A Place Booking</span><span>Stays in Arkansas, Missouri & beyond</span></div>
    </footer>
  );
}
