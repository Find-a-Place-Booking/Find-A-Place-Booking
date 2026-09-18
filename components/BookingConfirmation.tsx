"use client";

import { useEffect, useState } from "react";

type Props = {
  confirmationCode: string;
  reservationId: string;
  checkoutToken: string;
  testMode: boolean;
};

type BookingStatus = {
  reservationId: string;
  confirmationCode: string;
  status: string;
  paymentStatus: string;
  propertyName: string | null;
  checkIn: string;
  checkOut: string;
  guestName: string;
  guestTotalCents: number;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function BookingConfirmation({
  confirmationCode,
  reservationId,
  checkoutToken,
  testMode,
}: Props) {
  const [booking, setBooking] = useState<BookingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

    async function load() {
      attempts += 1;

      const response = await fetch(
        `/api/booking/status?reservationId=${encodeURIComponent(
          reservationId,
        )}&checkoutToken=${encodeURIComponent(checkoutToken)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        if (!cancelled) {
          const payload = await response.json().catch(() => null);
          setError(payload?.error || "Unable to load this booking.");
        }
        return;
      }

      const payload = (await response.json()) as BookingStatus;

      if (cancelled) return;

      setBooking(payload);

      if (
        payload.confirmationCode === confirmationCode &&
        payload.status !== "CONFIRMED" &&
        attempts < 30
      ) {
        timer = window.setTimeout(load, 1000);
      }
    }

    load();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [confirmationCode, reservationId, checkoutToken]);

  if (error) {
    return (
      <>
        <p className="eyebrow dark">Booking status</p>
        <h1>We couldn’t load this reservation.</h1>
        <p>{error}</p>
      </>
    );
  }

  if (!booking) {
    return <p>Confirming your payment and reservation…</p>;
  }

  if (booking.confirmationCode !== confirmationCode) {
    return <p>This confirmation does not match the reservation.</p>;
  }

  if (booking.status !== "CONFIRMED") {
    return (
      <>
        <p className="eyebrow dark">Payment received</p>
        <h1>We’re finishing your reservation.</h1>
        <p>
          Payment status: {booking.paymentStatus}. This page checks the
          reservation automatically while Stripe’s webhook finishes.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="eyebrow dark">Booking confirmed</p>
      <h1>{booking.propertyName || "Your stay"} is confirmed.</h1>

      <p>
        Confirmation <strong>{booking.confirmationCode}</strong>
      </p>

      <p>
        {booking.checkIn} → {booking.checkOut} ·{" "}
        {money(booking.guestTotalCents)}
      </p>

      {testMode ? (
        <p>This was a Stripe test-mode transaction. No live money moved.</p>
      ) : (
        <p>Your payment has been received and your dates are reserved.</p>
      )}
    </>
  );
}
