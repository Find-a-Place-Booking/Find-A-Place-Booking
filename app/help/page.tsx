import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { legalStyles } from "@/components/LegalDocument";
import {
  FIND_A_PLACE_NETWORK_URL,
  FIND_A_PLACE_SUPPORT_EMAIL,
} from "@/lib/brand-links";

export default function HelpPage() {
  return (
    <>
      <Header />
      <main className={legalStyles.wrap}>
        <article className={`shell ${legalStyles.article}`}>
          <p className="eyebrow dark">Find A Place support</p>
          <h1>Help &amp; support</h1>
          <p>
            Find A Place provides the booking platform, payment-routing and
            communication tools. The host operates the property and handles
            stay-specific questions, requested booking changes and ordinary
            cancellation decisions under the property terms accepted at booking.
          </p>

          <div className="help-contact-panel">
            <div>
              <span>Need platform help?</span>
              <strong>Contact the Find A Place team</strong>
              <p>
                Guests, hosts and property owners can reach us at{" "}
                <a href={`mailto:${FIND_A_PLACE_SUPPORT_EMAIL}`}>
                  {FIND_A_PLACE_SUPPORT_EMAIL}
                </a>.
              </p>
            </div>
            <div className="help-contact-actions">
              <Link className="button button-small" href="/contact#guest">
                Guest support
              </Link>
              <Link className="button button-small button-quiet" href="/contact#host">
                Host support
              </Link>
            </div>
          </div>

          <h2>Already booked a stay?</h2>
          <p>
            Open My Trip to review your reservation, see host contact details,
            message the host and send any cancellation request directly to the
            host. The reservation stays active unless the host approves a
            cancellation or another legally required change is made.
          </p>
          <p>
            <Link className="button button-small" href="/trip">
              Open My Trip
            </Link>
          </p>

          <h2>Questions about the property or check-in?</h2>
          <p>
            Use the host email, phone or reservation message thread shown on your
            secure trip page. The host is responsible for the property, arrival
            information and other stay-specific details.
          </p>

          <h2>Cancellation request or refund question?</h2>
          <p>
            The host&apos;s cancellation and refund terms are shown before payment
            and saved with the reservation. A request sent from My Trip goes to
            the host; it does not automatically cancel the booking or create a
            refund. If the host approves a refund through Find A Place, the
            platform transmits that host-authorized refund to the connected
            payment processor and keeps the reservation record synchronized.
          </p>
          <p>
            <Link href="/cancellation-policy">
              Read about cancellation requests &amp; refunds →
            </Link>
          </p>

          <h2>When should you contact Find A Place?</h2>
          <p>
            Contact us for account access, technical problems, payment-record
            issues, suspected fraud, a host or guest who cannot be reached, or
            another platform issue. Find A Place may also act when required by
            applicable law, payment-provider rules or platform safety rules.
          </p>

          <h2>Are you a host?</h2>
          <p>
            Sign in to the host portal for reservations, guest messages,
            calendars, direct-payment records, reports and property settings.
            Stripe controls your connected balance and bank-deposit timing.
          </p>
          <p className="help-inline-actions">
            <Link className="button button-small button-quiet" href="/host/sign-in">
              Host sign in
            </Link>
            <Link href="/contact#host">Contact host support →</Link>
          </p>

          <h2>Want help promoting your property?</h2>
          <p>
            Find A Place can also put together a customized advertising and social
            media promotion plan for hosts. Promotion is optional and separate
            from the booking platform commission.
          </p>
          <p className="help-inline-actions">
            <Link className="button button-small" href="/contact#advertising">
              Ask about advertising
            </Link>
            <a href={FIND_A_PLACE_NETWORK_URL} target="_blank" rel="noreferrer">
              See the Find A Place network ↗
            </a>
          </p>

          <div className={legalStyles.links}>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/privacy">Privacy Notice</Link>
            <Link href="/property-policies">Property policies</Link>
            <Link href="/stays">Browse stays</Link>
            <Link href="/about">About Find A Place</Link>
            <a href={FIND_A_PLACE_NETWORK_URL} target="_blank" rel="noreferrer">
              FindAPlaceAR.com ↗
            </a>
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
