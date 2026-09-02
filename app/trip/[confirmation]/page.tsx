import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { properties } from "@/data/demo";

function nightsBetween(checkin: string, checkout: string) {
  const start = new Date(`${checkin}T12:00:00`).getTime();
  const end = new Date(`${checkout}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86400000));
}

function fullDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function rangeDate(checkin: string, checkout: string) {
  const start = new Date(`${checkin}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const end = new Date(`${checkout}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return `${start}–${end}`;
}

export default async function TripPage({ params, searchParams }: { params: Promise<{ confirmation: string }>; searchParams: Promise<{ stay?: string; checkin?: string; checkout?: string; guests?: string }> }) {
  const { confirmation } = await params;
  const query = await searchParams;
  const p = properties.find(x => x.slug === query.stay) || properties[0];
  const checkin = query.checkin || "2026-09-18";
  const checkout = query.checkout || "2026-09-21";
  const guests = query.guests || "4";
  const nights = nightsBetween(checkin, checkout);
  const total = p.price * nights + 75 + Math.round((p.price * nights + 75) * 0.09);
  return <><Header /><main className="trip-page"><div className="shell trip-head"><p className="eyebrow dark">Reservation {confirmation}</p><h1>Your {p.region} getaway.</h1><p>Everything you need for this reservation, without digging through email.</p></div><div className="shell trip-layout"><section className="trip-primary"><div className="panel trip-property"><img src={p.image} alt={p.name}/><div><small>{rangeDate(checkin, checkout)} · {guests} guests</small><h2>{p.name}</h2><p>{p.location}</p><span className="trip-status">Confirmed</span></div></div><section className="panel"><p className="eyebrow dark">Before you go</p><h2>Stay details</h2><div className="trip-detail-grid"><div><span>Check-in</span><strong>{fullDate(checkin)} · after 3 PM</strong></div><div><span>Checkout</span><strong>{fullDate(checkout)} · by 11 AM</strong></div><div><span>Host</span><strong>{p.hostName}</strong></div><div><span>Total paid</span><strong>${total}</strong></div></div></section><section className="panel"><p className="eyebrow dark">Need something?</p><h2>Message your host</h2><div className="message-preview"><div className="host-avatar">{p.hostName.split(" ").slice(0,2).map(x=>x[0]).join("")}</div><div><strong>{p.hostName}</strong><p>Hi Jordan, thanks for booking. Check-in details will appear here before your arrival.</p></div></div><button className="button button-quiet">Send a message</button></section></section><aside className="panel trip-actions"><h2>Manage reservation</h2><button>View receipt <span>→</span></button><button>Review host policies <span>→</span></button><button>Request a change <span>→</span></button><button>Cancellation options <span>→</span></button><hr/><small>Booking support</small><p>Find A Place Booking can help with the platform. Property and stay questions go directly to the host.</p><Link href="/stays" className="under-link">Find another stay →</Link></aside></div></main><Footer /></>;
}
