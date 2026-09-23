import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { legalStyles } from "@/components/LegalDocument";
import { FIND_A_PLACE_NETWORK_URL, FIND_A_PLACE_SUPPORT_EMAIL } from "@/lib/brand-links";
import { copyBlock, loadManagedCopy } from "@/lib/public/managed-copy";

const defaults = {
  "help.hero": { eyebrow: "Find A Place support", title: "Help & support", body: "Find A Place provides the booking platform, payment-routing and communication tools. The host operates the property and handles stay-specific questions, requested booking changes and ordinary cancellation decisions under the property terms accepted at booking." },
  "help.booked": { title: "Already booked a stay?", body: "Open My Trip to review your reservation, see host contact details, message the host and send any cancellation request directly to the host. The reservation stays active unless the host approves a cancellation or another legally required change is made." },
  "help.property": { title: "Questions about the property or check-in?", body: "Use the host email, phone or reservation message thread shown on your secure trip page. The host is responsible for the property, arrival information and other stay-specific details." },
  "help.cancellation": { title: "Cancellation request or refund question?", body: "The host's cancellation and refund terms are shown before payment and saved with the reservation. A request sent from My Trip goes to the host; it does not automatically cancel the booking or create a refund. If the host approves a refund, Find A Place sends that host-authorized refund against the host's connected payment charge and keeps the reservation record synchronized.\n\nFind A Place's host-paid platform commission remains earned and non-refundable when a booking is cancelled, refunded, shortened or changed. The host is responsible for any guest refund it approves." },
  "help.platform": { title: "When should you contact Find A Place?", body: "Contact us for account access, technical problems, payment-record issues, suspected fraud, a host or guest who cannot be reached, or another platform issue. Find A Place may also act when required by applicable law, payment-provider rules or platform safety rules." },
  "help.host": { title: "Are you a host?", body: "Sign in to the host portal for reservations, guest messages, calendars, direct-payment records, reports and property settings. Stripe controls your connected balance and bank-deposit timing." },
  "help.promotion": { title: "Want help promoting your property?", body: "Find A Place can also put together a customized advertising and social media promotion plan for hosts. Promotion is optional and separate from the booking platform commission." },
};

export default async function HelpPage() {
  const content = await loadManagedCopy(defaults);
  const get = (key: keyof typeof defaults) => copyBlock(content, key);
  const hero = get("help.hero");
  return <><Header /><main className={legalStyles.wrap}><article className={`shell ${legalStyles.article}`}>
    <p className="eyebrow dark">{hero.eyebrow}</p><h1>{hero.title}</h1><p>{hero.body}</p>
    <div className="help-contact-panel"><div><span>Need platform help?</span><strong>Contact the Find A Place team</strong><p>Guests, hosts and property owners can reach us at <a href={`mailto:${FIND_A_PLACE_SUPPORT_EMAIL}`}>{FIND_A_PLACE_SUPPORT_EMAIL}</a>.</p></div><div className="help-contact-actions"><Link className="button button-small" href="/contact#guest">Guest support</Link><Link className="button button-small button-quiet" href="/contact#host">Host support</Link></div></div>
    {(["help.booked", "help.property", "help.cancellation", "help.platform", "help.host", "help.promotion"] as const).map((key) => { const block = get(key); return <section key={key}><h2>{block.title}</h2>{String(block.body || "").split(/\n\s*\n/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}{key === "help.booked" ? <p><Link className="button button-small" href="/trip">Open My Trip</Link></p> : null}{key === "help.cancellation" ? <p><Link href="/cancellation-policy">Read about cancellation requests &amp; refunds →</Link></p> : null}{key === "help.host" ? <p className="help-inline-actions"><Link className="button button-small button-quiet" href="/host/sign-in" prefetch={false}>Host sign in</Link><Link href="/contact#host">Contact host support →</Link></p> : null}{key === "help.promotion" ? <p className="help-inline-actions"><Link className="button button-small" href="/contact#advertising">Ask about advertising</Link><a href={FIND_A_PLACE_NETWORK_URL} target="_blank" rel="noreferrer">See the Find A Place network ↗</a></p> : null}</section>; })}
    <div className={legalStyles.links}><Link href="/terms">Terms of Service</Link><Link href="/privacy">Privacy Notice</Link><Link href="/property-policies">Property policies</Link><Link href="/stays">Browse stays</Link><Link href="/about">About Find A Place</Link><a href={FIND_A_PLACE_NETWORK_URL} target="_blank" rel="noreferrer">FindAPlaceAR.com ↗</a></div>
  </article></main><Footer /></>;
}
