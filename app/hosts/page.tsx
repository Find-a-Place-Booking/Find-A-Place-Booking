import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import styles from "./hosts.module.css";

export default function HostsPage() {
  return (
    <>
      <div className={`hosts-hero ${styles.videoHero}`}>
        <video
          className={styles.video}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/media/find-a-place-host-fall-poster.jpg"
          aria-hidden="true"
        >
          <source
            src="/media/find-a-place-host-fall-loop.mp4"
            type="video/mp4"
          />
        </video>
        <div className={styles.shade} aria-hidden="true" />

        <Header light />

        <div className={`shell hosts-hero-grid ${styles.content}`}>
          <div>
            <p className="eyebrow">For independent hosts</p>

            <h1>
              Your place should show up when someone is planning the trip.
            </h1>

            <p>
              Find A Place helps the right stay show up around the trip
              while you keep control of your property, rates, rules,
              guest relationship and payment account.
            </p>

            <div className="host-hero-actions">
              <Link
                className="button button-light"
                href="/host/sign-up?next=%2Fhost%2Fonboarding"
                prefetch={false}
              >
                Start your listing
              </Link>

              <Link
                className="host-text-link"
                href="/host/sign-in"
                prefetch={false}
              >
                Open the host portal →
              </Link>
            </div>
          </div>

          <div className="host-hero-card">
            <small>Platform commission</small>

            <strong>
              7%
              <span> standard host commission</span>
            </strong>

            <hr />

            <p>
              Commission is calculated from the nightly lodging subtotal
              after host discounts, not legitimate cleaning fees, pet
              fees, taxes, refundable deposits or optional add-ons.
            </p>

            <ul>
              <li>Marketplace listing</li>
              <li>Branded booking page</li>
              <li>Availability calendar</li>
              <li>Host-owned payments</li>
              <li>Guest messaging</li>
              <li>Cancellation requests &amp; reporting</li>
            </ul>
          </div>
        </div>
      </div>

      <main>
        <section className="hosts-value shell">
          <div className="section-heading">
            <div>
              <p className="eyebrow dark">
                What Find A Place handles
              </p>
              <h2>
                Built to help travelers find and book the right stay.
              </h2>
            </div>
          </div>

          <div className="host-value-grid">
            <article>
              <h3>Show up when travelers are searching</h3>
              <p>
                Your listing can appear when guests search by
                destination, dates and group size.
              </p>
            </article>

            <article>
              <h3>Give guests the details they need</h3>
              <p>
                Photos, amenities, house rules, rates and your
                cancellation/refund terms stay together on one complete
                property page.
              </p>
            </article>

            <article>
              <h3>Manage hosting in one place</h3>
              <p>
                Reservations, calendars, rates, fees, guest messages,
                cancellation requests, reports and listing details stay
                within your host dashboard.
              </p>
            </article>
          </div>
        </section>

        <section className="host-preview-section">
          <div className="shell host-preview-grid">
            <div className="host-preview-copy">
              <p className="eyebrow dark">
                Built for everyday hosting
              </p>

              <h2>
                Keep bookings, availability and guest details within
                easy reach.
              </h2>

              <p>
                Your host dashboard brings reservations, calendar
                availability, rates, messages, direct-payment records
                and listing details together. Stripe handles your
                balance and normal bank deposits.
              </p>

              <Link
                className="under-link"
                href="/host/sign-in"
                prefetch={false}
              >
                Open the host portal →
              </Link>
            </div>

            <div className="host-ui-preview empty-host-preview">
              <div className="preview-top">
                <span>Host dashboard</span>
                <strong>Ready when you are</strong>
              </div>

              <div className="preview-calendar">
                {Array.from({ length: 28 }, (_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>

              <div className="preview-booking empty-preview-booking">
                <div>
                  <small>Next step</small>
                  <strong>Add your first property</strong>
                  <span>
                    Bookings and arrivals will show here as they come
                    in.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="host-promotion-band shell">
          <div>
            <p className="eyebrow dark">
              Optional property promotion
            </p>
            <h2>Want a custom advertising plan too?</h2>
            <p>
              The booking marketplace and the Find A Place
              social/community side can work together. Advertising is
              optional and separate from the booking commission.
            </p>
          </div>

          <div className="host-promotion-actions">
            <Link className="button" href="/contact#advertising">
              Ask about advertising
            </Link>

            <a
              href="https://www.findaplacear.com"
              target="_blank"
              rel="noreferrer"
            >
              Explore FindAPlaceAR.com ↗
            </a>
          </div>
        </section>

        <section className="hosts-steps shell">
          <div>
            <p className="eyebrow dark">
              Getting your place ready
            </p>
            <h2>
              From your property details to a stay travelers can find.
            </h2>
          </div>

          <ol>
            <li>
              <span>1</span>
              <div>
                <strong>Tell us who&apos;s hosting</strong>
                <p>
                  Add the business/contact information and who manages
                  the property.
                </p>
              </div>
            </li>

            <li>
              <span>2</span>
              <div>
                <strong>Build the stay</strong>
                <p>
                  Add photos, amenities, occupancy, rates, fees and the
                  house rules and cancellation terms guests need to
                  know.
                </p>
              </div>
            </li>

            <li>
              <span>3</span>
              <div>
                <strong>Connect calendars and Stripe</strong>
                <p>
                  Keep availability aligned and connect the host payment
                  account that will own guest charges.
                </p>
              </div>
            </li>

            <li>
              <span>4</span>
              <div>
                <strong>Send it for review</strong>
                <p>
                  Find A Place checks the listing, then it can appear in
                  traveler searches.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="host-cta">
          <div className="shell host-cta-inner">
            <div>
              <p className="eyebrow">Ready to add your place?</p>
              <h2>
                We&apos;ll walk through it one piece at a time.
              </h2>
            </div>

            <div>
              <p>
                The host setup covers the property, amenities, rates,
                policies, calendars and payments without dropping
                everything into one giant form.
              </p>

              <Link
                className="button button-light"
                href="/host/sign-up?next=%2Fhost%2Fonboarding"
                prefetch={false}
              >
                Start host setup →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
