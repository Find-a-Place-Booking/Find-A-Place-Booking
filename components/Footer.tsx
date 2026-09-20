import Link from "next/link";
import { Brand } from "./Brand";

export function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer-grid">
        <div className="footer-brand">
          <Brand compact />
          <p>
            Find a stay near the places you already want to go. Independent
            cabins, cottages, RV stays and one-of-a-kind places across Arkansas,
            Missouri and beyond.
          </p>
        </div>

        <div>
          <strong>Explore</strong>
          <Link href="/stays">Find a stay</Link>
          <a href="/#regions">Destinations</a>
          <Link href="/about">About Find A Place</Link>
        </div>

        <div>
          <strong>For hosts</strong>
          <Link href="/hosts">How hosting works</Link>
          <Link href="/host/sign-up?next=%2Fhost%2Fonboarding">
            List a property
          </Link>
          <Link href="/host/sign-in">Host portal</Link>
        </div>

        <div>
          <strong>Your trip</strong>
          <Link href="/trip">Manage a trip</Link>
          <Link href="/property-policies">Property policies</Link>
          <Link href="/help">Help &amp; support</Link>
        </div>
      </div>

      <div className="shell footer-bottom">
        <span>© 2026 Find A Place Booking</span>
        <span>Arkansas, Missouri & beyond</span>
      </div>
    </footer>
  );
}
