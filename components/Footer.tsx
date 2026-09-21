import Link from "next/link";

import {
  FIND_A_PLACE_NETWORK_URL,
  FIND_A_PLACE_SOCIAL_LINKS,
} from "@/lib/brand-links";
import { Brand } from "./Brand";
import { SocialIcon } from "./SocialIcon";

const socialRowStyle = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 18,
} as const;

const socialLinkStyle = {
  width: 34,
  height: 34,
  minWidth: 34,
  minHeight: 34,
  maxWidth: 34,
  maxHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "0 0 34px",
  padding: 0,
  lineHeight: 1,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: "50%",
  color: "rgba(255,255,255,.78)",
  textDecoration: "none",
} as const;

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

          <div className="footer-network-link">
            <a href={FIND_A_PLACE_NETWORK_URL} target="_blank" rel="noreferrer">
              Explore Find A Place Arkansas &amp; Beyond <span aria-hidden="true">↗</span>
            </a>
            <small>Travel inspiration, partner properties and the social community.</small>
          </div>

          <div className="footer-social" style={socialRowStyle} aria-label="Find A Place social media">
            {FIND_A_PLACE_SOCIAL_LINKS.map((social) => (
              <a
                key={social.network}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={`Find A Place on ${social.label}`}
                title={social.label}
                style={socialLinkStyle}
              >
                <SocialIcon network={social.network} />
              </a>
            ))}
          </div>
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
          <Link href="/contact#advertising">Custom advertising</Link>
          <Link href="/host/sign-in">Host portal</Link>
        </div>

        <div>
          <strong>Your trip</strong>
          <Link href="/trip">Manage a trip</Link>
          <Link href="/property-policies">Property policies</Link>
          <Link href="/help">Help &amp; support</Link>
          <Link href="/contact">Contact us</Link>
        </div>
      </div>

      <div className="shell footer-bottom">
        <span>© 2026 Find A Place Booking</span>
        <span>Arkansas, Missouri &amp; beyond</span>
      </div>
    </footer>
  );
}
