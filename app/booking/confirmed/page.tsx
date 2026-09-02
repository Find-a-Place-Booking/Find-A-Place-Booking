import Link from "next/link";
import { Brand } from "@/components/Brand";
import { properties } from "@/data/demo";

function formatRange(checkin: string, checkout: string) {
  const start = new Date(`${checkin}T12:00:00`);
  const end = new Date(`${checkout}T12:00:00`);
  const startText = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endText = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${startText}–${endText}`;
}

export default async function ConfirmedPage({ searchParams }: { searchParams: Promise<{ stay?: string; checkin?: string; checkout?: string; guests?: string }> }) {
  const params = await searchParams;
  const p = properties.find(x => x.slug === params.stay) || properties[0];
  const checkin = params.checkin || "2026-09-18";
  const checkout = params.checkout || "2026-09-21";
  const guests = params.guests || "4";
  const tripHref = `/trip/FAP-84291?stay=${p.slug}&checkin=${checkin}&checkout=${checkout}&guests=${guests}`;
  return <main className="confirm-page"><header className="checkout-header shell"><Brand /><span>Reservation confirmed</span></header><section className="confirm-card"><div className="confirm-mark">✓</div><p className="eyebrow dark">You’re booked</p><h1>{p.name} is yours.</h1><p>A confirmation has been sent to jordan@example.com. Your trip page keeps the receipt, host details and stay information together.</p><div className="confirmation-info"><div><small>Confirmation</small><strong>FAP-84291</strong></div><div><small>Dates</small><strong>{formatRange(checkin, checkout)}</strong></div><div><small>Guests</small><strong>{guests}</strong></div></div><Link className="button" href={tripHref}>Manage this reservation</Link><Link className="confirm-secondary" href="/">Back to Find A Place Booking</Link></section></main>;
}
