"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  slug: string;
  price: number;
  rating: number;
  maxGuests: number;
  minimumStayNights: number;
  checkoutEnabled: boolean;
  testMode: boolean;
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export function BookingCard({
  slug,
  price,
  maxGuests,
  minimumStayNights,
  checkoutEnabled,
  testMode,
}: Props) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const checkoutMin = checkIn
    ? addDays(checkIn, Math.max(1, minimumStayNights))
    : today;

  if (!checkoutEnabled) {
    return (
      <aside className="booking-card booking-card-disabled">
        <div className="booking-price">
          <strong>${price}</strong>
          <span>/ night</span>
          <b>Listed on Find A Place</b>
        </div>

        <div className="availability-note">
          <span>●</span>
          <strong>Online booking opens soon</strong>
        </div>

        <div className="booking-coming-soon">
          <strong>Save this one for later.</strong>
          <p>Online dates and secure checkout will open soon.</p>
        </div>

        <button className="button button-full" type="button" disabled>
          Online booking coming soon
        </button>
      </aside>
    );
  }

  return (
    <aside className="booking-card">
      <div className="booking-price">
        <strong>${price}</strong>
        <span>/ night</span>
        <b>{testMode ? "Test booking" : "Book on Find A Place"}</b>
      </div>

      <div className="availability-note">
        <span>●</span>
        <strong>
          {testMode ? "Test checkout enabled" : "Secure online booking"}
        </strong>
      </div>

      <div className="booking-dates">
        <label>
          <span>Check in</span>
          <input
            type="date"
            min={today}
            value={checkIn}
            onChange={(event) => {
              const value = event.target.value;
              setCheckIn(value);

              if (
                checkOut &&
                checkOut < addDays(value, minimumStayNights)
              ) {
                setCheckOut("");
              }
            }}
          />
        </label>

        <label>
          <span>Check out</span>
          <input
            type="date"
            min={checkoutMin}
            value={checkOut}
            onChange={(event) => setCheckOut(event.target.value)}
          />
        </label>

        <label className="full">
          <span>Guests</span>
          <select
            value={guests}
            onChange={(event) => setGuests(Number(event.target.value))}
          >
            {Array.from({ length: Math.max(1, maxGuests) }, (_, index) => (
              <option value={index + 1} key={index + 1}>
                {index + 1} guest{index ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        className="button button-full"
        type="button"
        disabled={!checkIn || !checkOut}
        onClick={() => {
          const query = new URLSearchParams({
            stay: slug,
            checkIn,
            checkOut,
            guests: String(guests),
          });

          router.push(`/checkout?${query.toString()}`);
        }}
      >
        Continue to checkout
      </button>

      <small className="secure-note">
        {testMode
          ? "Stripe test mode. No live money will move."
          : "Secure payment processing by Stripe."}
      </small>
    </aside>
  );
}
