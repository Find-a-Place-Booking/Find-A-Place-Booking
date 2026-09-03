import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function ConfirmedPage() {
  return <main className="confirm-page"><header className="checkout-header shell"><Brand /><span>Reservation status</span></header><section className="confirm-card"><p className="eyebrow dark">No reservation loaded</p><h1>There isn’t a confirmed booking to show.</h1><p>Confirmation pages will only render from a real reservation record once the booking system is connected. The production shell no longer creates sample confirmation numbers or guest details.</p><Link className="button" href="/stays">Search stays</Link><Link className="confirm-secondary" href="/">Back to Find A Place Booking</Link></section></main>;
}
