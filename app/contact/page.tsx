import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import {
  FIND_A_PLACE_NETWORK_URL,
  FIND_A_PLACE_SUPPORT_EMAIL,
  findAPlaceMailto,
} from "@/lib/brand-links";

import styles from "./contact.module.css";

export default function ContactPage() {
  const guestMail = findAPlaceMailto(
    "Guest support - Find A Place Booking",
    "Name:\nBooking confirmation (if applicable):\nProperty:\nHave you contacted the host through My Trip?\nHow can we help?\n",
  );
  const hostMail = findAPlaceMailto(
    "Host support - Find A Place Booking",
    "Host/business name:\nProperty:\nAccount email:\nHow can we help?\n",
  );
  const advertisingMail = findAPlaceMailto(
    "Custom advertising plan - Find A Place",
    "Host/business name:\nProperty name and location:\nCurrent listing or website link (if available):\nWhat would you like help promoting?\n",
  );

  return (
    <>
      <Header />
      <main className={styles.page}>
        <section className={`shell ${styles.hero}`}>
          <p className="eyebrow dark">Contact Find A Place</p>
          <h1>Tell us what you need help with.</h1>
          <p className={styles.heroLead}>
            For property details, check-in or an ordinary cancellation request, contact the host from My Trip first. For platform, account, payment-routing or technical support, the Find A Place team is here.
          </p>
          <div className={styles.directEmail}>
            <span>Direct email</span>
            <a href={`mailto:${FIND_A_PLACE_SUPPORT_EMAIL}`}>{FIND_A_PLACE_SUPPORT_EMAIL}</a>
          </div>
        </section>

        <section className={`shell ${styles.contactGrid}`} aria-label="Contact options">
          <article id="guest" className={styles.card}>
            <div>
              <span className={styles.kicker}>For travelers</span>
              <h2>Guest support</h2>
              <p>
                Use My Trip for direct host contact, reservation messages and cancellation requests. Contact Find A Place for account access, technical issues, payment-record questions, fraud or other platform support.
              </p>
            </div>
            <div className={styles.cardFooter}>
              <a className="button button-small" href={guestMail}>Email guest support</a>
              <small>Include your booking confirmation when you have one.</small>
            </div>
          </article>

          <article id="host" className={styles.card}>
            <div>
              <span className={styles.kicker}>For property owners</span>
              <h2>Host support</h2>
              <p>
                Help with your host account, listing, calendars, connected Stripe account, policies, reservations, guest communication or onboarding.
              </p>
            </div>
            <div className={styles.cardFooter}>
              <a className="button button-small" href={hostMail}>Email host support</a>
              <small>Include the email used for your host account.</small>
            </div>
          </article>

          <article id="advertising" className={`${styles.card} ${styles.featuredCard}`}>
            <div>
              <span className={styles.featuredKicker}>Optional promotion</span>
              <h2>Customized advertising plan</h2>
              <p>
                Want more reach beyond the booking marketplace? Ask about a plan built around Find A Place&apos;s social media and travel community, your property, location and the guests you want to reach.
              </p>
            </div>
            <div className={styles.cardFooter}>
              <a className={`button button-small ${styles.featuredButton}`} href={advertisingMail}>Request an advertising plan</a>
              <small>Advertising is optional and separate from booking commission.</small>
            </div>
          </article>
        </section>

        <section className={`shell ${styles.networkCard}`}>
          <div>
            <p className="eyebrow dark">The original Find A Place network</p>
            <h2>See the travel and social side of Find A Place.</h2>
            <p>Browse the existing network, partner properties and travel content at Find A Place Arkansas &amp; Beyond.</p>
          </div>
          <a className="button button-quiet" href={FIND_A_PLACE_NETWORK_URL} target="_blank" rel="noreferrer">Visit FindAPlaceAR.com ↗</a>
        </section>

        <nav className={`shell ${styles.backLinks}`} aria-label="Related links">
          <Link href="/help">← Back to Help &amp; support</Link>
          <Link href="/stays">Browse stays</Link>
          <Link href="/hosts">Hosting with Find A Place</Link>
        </nav>
      </main>
      <Footer />
    </>
  );
}
