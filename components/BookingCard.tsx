"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function nightsBetween(checkin: string, checkout: string) {
  const start = new Date(`${checkin}T12:00:00`).getTime();
  const end = new Date(`${checkout}T12:00:00`).getTime();
  return Math.max(1, Math.round((end - start) / 86400000));
}

export function BookingCard({ slug, price, rating }: { slug: string; price: number; rating: number }) {
  const [checkin, setCheckin] = useState("2026-09-18");
  const [checkout, setCheckout] = useState("2026-09-21");
  const [guests, setGuests] = useState("4");
  const nights = useMemo(() => nightsBetween(checkin, checkout), [checkin, checkout]);
  const cleaning = 75;
  const taxes = Math.round((price * nights + cleaning) * 0.09);
  const total = price * nights + cleaning + taxes;
  const checkoutHref = `/checkout?stay=${slug}&checkin=${checkin}&checkout=${checkout}&guests=${guests}`;
  return (
    <aside className="booking-card">
      <div className="booking-price"><strong>${price}</strong><span>/ night</span><b>★ {rating}</b></div>
      <div className="availability-note"><span>●</span><strong>Available for these dates</strong></div>
      <div className="booking-dates">
        <label><span>Check in</span><input type="date" value={checkin} onChange={(event) => setCheckin(event.target.value)} /></label>
        <label><span>Check out</span><input type="date" min={checkin} value={checkout} onChange={(event) => setCheckout(event.target.value)} /></label>
        <label className="full"><span>Guests</span><select value={guests} onChange={(event) => setGuests(event.target.value)}><option value="2">2 guests</option><option value="4">4 guests</option><option value="6">6 guests</option><option value="8">8 guests</option></select></label>
      </div>
      <div className="price-breakdown"><p><span>${price} × {nights} {nights === 1 ? "night" : "nights"}</span><span>${price*nights}</span></p><p><span>Cleaning fee</span><span>${cleaning}</span></p><p><span>Estimated taxes</span><span>${taxes}</span></p><hr/><p className="total"><strong>Total</strong><strong>${total}</strong></p></div>
      <Link className="button button-full" href={checkoutHref}>Continue to reserve</Link>
      <small className="secure-note">You’ll review the host’s terms and full total before payment.</small>
    </aside>
  );
}
