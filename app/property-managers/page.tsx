import type { Metadata } from "next";
import Link from "next/link";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import styles from "./property-managers.module.css";

export const metadata: Metadata = {
  title: "For Property Managers",
  description: "Add and manage multiple vacation rentals with Find A Place Booking. Get help with listings, calendars, guest messages and payouts.",
  alternates: { canonical: "/property-managers" },
};

export default function PropertyManagersPage() {
  return (
    <>
      <Header />
      <main className={styles.page}>
        <section className={`${styles.hero} shell`}>
          <div>
            <p className="eyebrow dark">For property managers</p>
            <h1>Have more than one place to list?</h1>
            <p className={styles.lead}>
              Bring your cabins, vacation homes and other stays together in one host workspace.
              Your team keeps control of rates, availability, guest communication and the Stripe account receiving payments.
            </p>
            <div className={styles.actions}>
              <Link className="button" href="/host/sign-up?next=%2Fhost%2Fonboarding">Add your properties</Link>
              <Link className="button button-quiet" href="/contact">Talk with the Find A Place team</Link>
            </div>
          </div>
          <aside className={styles.note}>
            <span>Already hosting?</span>
            <strong>Pick up where you left off.</strong>
            <p>Sign in to finish draft listings, check calendars or ask for help getting a property live.</p>
            <Link href="/host/properties">Open your properties →</Link>
          </aside>
        </section>
        <section className={`${styles.section} shell`}>
          <h2>Practical tools for a busy property manager.</h2>
          <div className={styles.grid}>
            <article><span>01</span><h3>All your listings</h3><p>Update photos, details, policies, rates and publish-ready status in the host dashboard.</p></article>
            <article><span>02</span><h3>Availability in one place</h3><p>Connect supported calendar feeds to reduce manual updates. Sync capabilities depend on the provider, and a healthy import should always be checked before going live.</p></article>
            <article><span>03</span><h3>Booking support</h3><p>Keep reservations and guest messages close by. Need help finishing a property? Contact our team and we can review what is missing.</p></article>
          </div>
        </section>
        <section className={`${styles.bottom} shell`}>
          <div>
            <h2>Four cabins or forty, start with the listings.</h2>
            <p>No need to move your entire operation at once. Add the properties you want to feature, verify their calendars and publish each one when ready.</p>
          </div>
          <Link className="button" href="/host/sign-up?next=%2Fhost%2Fonboarding">Get started</Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
