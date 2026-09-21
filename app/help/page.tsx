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
            Use the links below to get to the part of Find A Place that matches
            what you need help with. If you still need a person, you can contact
            the Find A Place team directly.
          </p>

          <div className="help-contact-panel">
            <div>
              <span>Need to reach us?</span>
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
            Open My Trip to review your reservation, booking details, messages,
            cancellation status and other trip information tied to your
            confirmation.
          </p>
          <p>
            <Link className="button button-small" href="/trip">
              Open My Trip
            </Link>
          </p>

          <h2>Questions about property rules?</h2>
          <p>
            Property-specific house rules are tied to the individual stay and are
            reviewed during checkout. You can also read how Find A Place handles
            property policies before booking.
          </p>
          <p>
            <Link href="/property-policies">Read about property policies →</Link>
          </p>

          <h2>Cancellation or refund question?</h2>
          <p>
            Review the Find A Place cancellation and refund rules, including the
            standard 14-day cutoff and the situations where an exception may
            require review.
          </p>
          <p>
            <Link href="/cancellation-policy">
              Read the Cancellation &amp; Refund Policy →
            </Link>
          </p>

          <h2>Are you a host?</h2>
          <p>
            Sign in to the host portal for reservations, guest messages,
            calendars, payouts, reports and property settings. For an account,
            listing, payout or setup issue, host support is also available from
            the contact page.
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
              Ask about a custom advertising plan
            </Link>
            <a href={FIND_A_PLACE_NETWORK_URL} target="_blank" rel="noreferrer">
              See the Find A Place network ↗
            </a>
          </p>

          <div className={legalStyles.links}>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/privacy">Privacy Notice</Link>
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
