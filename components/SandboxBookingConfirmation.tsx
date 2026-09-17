"use client";

import { useEffect, useState } from "react";

type Props = {
  confirmationCode: string;
  reservationId: string;
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

export function SandboxBookingConfirmation({
  confirmationCode,
  reservationId,
}: Props) {
  const [booking, setBooking] = useState<BookingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function load() {
      attempts += 1;

      const response = await fetch(
        `/api/booking/sandbox/status?reservationId=${encodeURIComponent(
          reservationId,
        )}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        if (!cancelled) setError("Unable to load this sandbox booking.");
        return;
      }

      const payload = (await response.json()) as BookingStatus;

      if (cancelled) return;

      setBooking(payload);

      if (
        payload.confirmationCode === confirmationCode &&
        payload.status !== "CONFIRMED" &&
        attempts < 10
      ) {
        window.setTimeout(load, 700);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [confirmationCode, reservationId]);

  if (error) return <p>{error}</p>;

  if (!booking) {
    return <p>Confirming your Stripe sandbox payment…</p>;
  }

  if (booking.confirmationCode !== confirmationCode) {
    return <p>This confirmation does not match the sandbox reservation.</p>;
  }

  if (booking.status !== "CONFIRMED") {
    return (
      <>
        <p className="eyebrow dark">Payment processing</p>
        <h1>We’re confirming the test booking.</h1>
        <p>
          Stripe payment status: {booking.paymentStatus}. This page will refresh
          the booking state automatically.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="eyebrow dark">Sandbox booking confirmed</p>
      <h1>{booking.propertyName || "Your stay"} is confirmed.</h1>
      <p>
        Confirmation <strong>{booking.confirmationCode}</strong>
      </p>
      <p>
        {booking.checkIn} → {booking.checkOut} · {money(booking.guestTotalCents)}
      </p>
      <p>
        This was a Stripe sandbox transaction. No live money moved.
      </p>
    </>
  );
}
