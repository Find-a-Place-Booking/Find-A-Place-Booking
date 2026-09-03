"use client";

import Link from "next/link";
import { useState } from "react";

export function BookingCard({ slug, price, rating }: { slug: string; price: number; rating: number }) {
  const [checkin, setCheckin] = useState("");
  const [checkout, setCheckout] = useState("");
  const [guests, setGuests] = useState("2");
  const ready = Boolean(checkin && checkout);
  const checkoutHref = `/checkout?stay=${encodeURIComponent(slug)}&checkin=${encodeURIComponent(checkin)}&checkout=${encodeURIComponent(checkout)}&guests=${guests}`;

  return (
    <aside className="booking-card">
      <div className="booking-price"><strong>${price}</strong><span>/ night</span><b>★ {rating}</b></div>
      <div className="availability-note"><span>●</span><strong>{ready ? "Availability will be rechecked before checkout" : "Choose dates to check availability"}</strong></div>
      <div className="booking-dates">
        <label><span>Check in</span><input type="date" value={checkin} onChange={(event) => setCheckin(event.target.value)} /></label>
        <label><span>Check out</span><input type="date" min={checkin} value={checkout} onChange={(event) => setCheckout(event.target.value)} /></label>
        <label className="full"><span>Guests</span><select value={guests} onChange={(event) => setGuests(event.target.value)}><option value="2">2 guests</option><option value="4">4 guests</option><option value="6">6 guests</option><option value="8">8 guests</option></select></label>
      </div>
      <div className="price-breakdown"><p><span>Nightly lodging</span><span>Calculated for selected dates</span></p><p><span>Host fees</span><span>Shown before payment</span></p><p><span>Taxes</span><span>Calculated at checkout</span></p></div>
      {ready ? <Link className="button button-full" href={checkoutHref}>Continue to reserve</Link> : <button className="button button-full" type="button" disabled>Select dates to continue</button>}
      <small className="secure-note">You’ll review the host’s selected policies, fees and full total before payment.</small>
    </aside>
  );
}
