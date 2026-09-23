import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { copyBlock, loadManagedCopy } from "@/lib/public/managed-copy";

const defaults = {
  "hosts.hero": { eyebrow: "For independent hosts", title: "Your place should show up when someone is planning the trip.", body: "Find A Place helps the right stay show up around the trip while you keep control of your property, rates, rules, guest relationship and payment account." },
  "hosts.commission": { title: "Platform commission", body: "Commission is calculated from the nightly lodging subtotal after host discounts, not legitimate cleaning fees, pet fees, taxes, refundable deposits or optional add-ons." },
  "hosts.value": { eyebrow: "What Find A Place handles", title: "Built to help travelers find and book the right stay.", body: "Find A Place keeps discovery, booking and host operations together without taking control away from the property owner." },
  "hosts.value.search": { title: "Show up when travelers are searching", body: "Your listing can appear when guests search by destination, dates and group size." },
  "hosts.value.details": { title: "Give guests the details they need", body: "Photos, amenities, house rules, rates and your cancellation/refund terms stay together on one complete property page." },
  "hosts.value.manage": { title: "Manage hosting in one place", body: "Reservations, calendars, rates, fees, guest messages, cancellation requests, reports and listing details stay within your host dashboard." },
  "hosts.dashboard": { eyebrow: "Built for everyday hosting", title: "Keep bookings, availability and guest details within easy reach.", body: "Your host dashboard brings reservations, calendar availability, rates, messages, direct-payment records and listing details together. Stripe handles your balance and normal bank deposits." },
  "hosts.promotion": { eyebrow: "Optional property promotion", title: "Want a custom advertising plan too?", body: "The booking marketplace and the Find A Place social/community side can work together. Advertising is optional and separate from the booking commission." },
  "hosts.steps": { eyebrow: "Getting your place ready", title: "From your property details to a stay travelers can find.", body: "Host setup is broken into practical steps so you can finish a complete listing without one giant form." },
  "hosts.step1": { title: "Tell us who's hosting", body: "Add the business/contact information and who manages the property." },
  "hosts.step2": { title: "Build the stay", body: "Add photos, amenities, occupancy, rates, fees and the house rules and cancellation terms guests need to know." },
  "hosts.step3": { title: "Connect calendars and Stripe", body: "Keep availability aligned and connect the host payment account that will own guest charges." },
  "hosts.step4": { title: "Send it for review", body: "Find A Place checks the listing, then it can appear in traveler searches." },
  "hosts.cta": { eyebrow: "Ready to add your place?", title: "We'll walk through it one piece at a time.", body: "The host setup covers the property, amenities, rates, policies, calendars and payments without dropping everything into one giant form." },
};

export default async function HostsPage() {
  const content = await loadManagedCopy(defaults);
  const get = (key: keyof typeof defaults) => copyBlock(content, key);
  const hero = get("hosts.hero");
  const commission = get("hosts.commission");
  const value = get("hosts.value");
  const dashboard = get("hosts.dashboard");
  const promotion = get("hosts.promotion");
  const steps = get("hosts.steps");
  const cta = get("hosts.cta");

  return (
    <>
      <div className="hosts-hero">
        <Header light />
        <div className="shell hosts-hero-grid">
          <div>
            <p className="eyebrow">{hero.eyebrow}</p><h1>{hero.title}</h1><p>{hero.body}</p>
            <div className="host-hero-actions">
              <Link className="button button-light" href="/host/sign-up?next=%2Fhost%2Fonboarding" prefetch={false}>Start your listing</Link>
              <Link className="host-text-link" href="/host/sign-in" prefetch={false}>Open the host portal →</Link>
            </div>
          </div>
          <div className="host-hero-card">
            <small>{commission.title}</small>
            <strong>7%<span> standard host commission</span></strong>
            <hr /><p>{commission.body}</p>
            <ul><li>Marketplace listing</li><li>Branded booking page</li><li>Availability calendar</li><li>Host-owned payments</li><li>Guest messaging</li><li>Cancellation requests &amp; reporting</li></ul>
          </div>
        </div>
      </div>

      <main>
        <section className="hosts-value shell">
          <div className="section-heading"><div><p className="eyebrow dark">{value.eyebrow}</p><h2>{value.title}</h2></div></div>
          <div className="host-value-grid">
            {(["hosts.value.search", "hosts.value.details", "hosts.value.manage"] as const).map((key) => { const block = get(key); return <article key={key}><h3>{block.title}</h3><p>{block.body}</p></article>; })}
          </div>
        </section>

        <section className="host-preview-section">
          <div className="shell host-preview-grid">
            <div className="host-preview-copy"><p className="eyebrow dark">{dashboard.eyebrow}</p><h2>{dashboard.title}</h2><p>{dashboard.body}</p><Link className="under-link" href="/host/sign-in" prefetch={false}>Open the host portal →</Link></div>
            <div className="host-ui-preview empty-host-preview"><div className="preview-top"><span>Host dashboard</span><strong>Ready when you are</strong></div><div className="preview-calendar">{Array.from({ length: 28 }, (_, i) => <span key={i}>{i + 1}</span>)}</div><div className="preview-booking empty-preview-booking"><div><small>Next step</small><strong>Add your first property</strong><span>Bookings and arrivals will show here as they come in.</span></div></div></div>
          </div>
        </section>

        <section className="host-promotion-band shell"><div><p className="eyebrow dark">{promotion.eyebrow}</p><h2>{promotion.title}</h2><p>{promotion.body}</p></div><div className="host-promotion-actions"><Link className="button" href="/contact#advertising">Ask about advertising</Link><a href="https://www.findaplacear.com" target="_blank" rel="noreferrer">Explore FindAPlaceAR.com ↗</a></div></section>

        <section className="hosts-steps shell"><div><p className="eyebrow dark">{steps.eyebrow}</p><h2>{steps.title}</h2></div><ol>{(["hosts.step1", "hosts.step2", "hosts.step3", "hosts.step4"] as const).map((key, index) => { const block = get(key); return <li key={key}><span>{index + 1}</span><div><strong>{block.title}</strong><p>{block.body}</p></div></li>; })}</ol></section>

        <section className="host-cta"><div className="shell host-cta-inner"><div><p className="eyebrow">{cta.eyebrow}</p><h2>{cta.title}</h2></div><div><p>{cta.body}</p><Link className="button button-light" href="/host/sign-up?next=%2Fhost%2Fonboarding" prefetch={false}>Start host setup →</Link></div></div></section>
      </main>
      <Footer />
    </>
  );
}
