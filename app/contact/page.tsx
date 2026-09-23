import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { FIND_A_PLACE_NETWORK_URL, FIND_A_PLACE_SUPPORT_EMAIL, findAPlaceMailto } from "@/lib/brand-links";
import { copyBlock, loadManagedCopy } from "@/lib/public/managed-copy";
import styles from "./contact.module.css";

const defaults = {
  "contact.hero": { eyebrow: "Contact Find A Place", title: "Tell us what you need help with.", body: "For property details, check-in or an ordinary cancellation request, contact the host from My Trip first. For platform, account, payment-routing or technical support, the Find A Place team is here." },
  "contact.guest": { eyebrow: "For travelers", title: "Guest support", body: "Use My Trip for direct host contact, reservation messages and cancellation requests. Contact Find A Place for account access, technical issues, payment-record questions, fraud or other platform support." },
  "contact.host": { eyebrow: "For property owners", title: "Host support", body: "Help with your host account, listing, calendars, connected Stripe account, policies, reservations, guest communication or onboarding." },
  "contact.advertising": { eyebrow: "Optional promotion", title: "Customized advertising plan", body: "Want more reach beyond the booking marketplace? Ask about a plan built around Find A Place's social media and travel community, your property, location and the guests you want to reach." },
  "contact.network": { eyebrow: "The original Find A Place network", title: "See the travel and social side of Find A Place.", body: "Browse the existing network, partner properties and travel content at Find A Place Arkansas & Beyond." },
};

export default async function ContactPage() {
  const content = await loadManagedCopy(defaults);
  const get = (key: keyof typeof defaults) => copyBlock(content, key);
  const guestMail = findAPlaceMailto("Guest support - Find A Place Booking", "Name:\nBooking confirmation (if applicable):\nProperty:\nHave you contacted the host through My Trip?\nHow can we help?\n");
  const hostMail = findAPlaceMailto("Host support - Find A Place Booking", "Host/business name:\nProperty:\nAccount email:\nHow can we help?\n");
  const advertisingMail = findAPlaceMailto("Custom advertising plan - Find A Place", "Host/business name:\nProperty name and location:\nCurrent listing or website link (if available):\nWhat would you like help promoting?\n");
  const hero = get("contact.hero");
  return <><Header /><main className={styles.page}>
    <section className={`shell ${styles.hero}`}><p className="eyebrow dark">{hero.eyebrow}</p><h1>{hero.title}</h1><p className={styles.heroLead}>{hero.body}</p><div className={styles.directEmail}><span>Direct email</span><a href={`mailto:${FIND_A_PLACE_SUPPORT_EMAIL}`}>{FIND_A_PLACE_SUPPORT_EMAIL}</a></div></section>
    <section className={`shell ${styles.contactGrid}`} aria-label="Contact options">
      {(["contact.guest", "contact.host", "contact.advertising"] as const).map((key) => { const block = get(key); const href = key === "contact.guest" ? guestMail : key === "contact.host" ? hostMail : advertisingMail; const button = key === "contact.guest" ? "Email guest support" : key === "contact.host" ? "Email host support" : "Request an advertising plan"; return <article id={key.split(".")[1]} className={`${styles.card} ${key === "contact.advertising" ? styles.featuredCard : ""}`} key={key}><div><span className={key === "contact.advertising" ? styles.featuredKicker : styles.kicker}>{block.eyebrow}</span><h2>{block.title}</h2><p>{block.body}</p></div><div className={styles.cardFooter}><a className={`button button-small ${key === "contact.advertising" ? styles.featuredButton : ""}`} href={href}>{button}</a><small>{key === "contact.guest" ? "Include your booking confirmation when you have one." : key === "contact.host" ? "Include the email used for your host account." : "Advertising is optional and separate from booking commission."}</small></div></article>; })}
    </section>
    {(() => { const network = get("contact.network"); return <section className={`shell ${styles.networkCard}`}><div><p className="eyebrow dark">{network.eyebrow}</p><h2>{network.title}</h2><p>{network.body}</p></div><a className="button button-quiet" href={FIND_A_PLACE_NETWORK_URL} target="_blank" rel="noreferrer">Visit FindAPlaceAR.com ↗</a></section>; })()}
    <nav className={`shell ${styles.backLinks}`} aria-label="Related links"><Link href="/help">← Back to Help &amp; support</Link><Link href="/stays">Browse stays</Link><Link href="/hosts">Hosting with Find A Place</Link></nav>
  </main><Footer /></>;
}
