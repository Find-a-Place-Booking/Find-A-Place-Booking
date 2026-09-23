"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";

import { AvailabilityDatePicker } from "@/components/AvailabilityDatePicker";

type Props = {
  unitId: string;
  slug: string;
  price: number;
  rating: number;
  maxGuests: number;
  minimumStayNights: number;
  checkoutEnabled: boolean;
  testMode: boolean;
};

export function BookingCard({
  unitId,
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

      <AvailabilityDatePicker
        unitId={unitId}
        minimumStayNights={minimumStayNights}
        checkIn={checkIn}
        checkOut={checkOut}
        onChange={(dates) => {
          setCheckIn(dates.checkIn);
          setCheckOut(dates.checkOut);
        }}
      />

      <div className="booking-dates">
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
          track("checkout_started", {
            slug,
            mode: testMode ? "test" : "live",
          });

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
