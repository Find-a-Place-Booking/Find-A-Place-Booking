"use client";

import { useEffect, useState } from "react";

import { BookingReceipt } from "@/components/BookingReceipt";
import { PrintReceiptButton } from "@/components/PrintReceiptButton";
import type { GuestTaxLine } from "@/lib/bookings/financial-display";
import styles from "./BookingConfirmation.module.css";

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
  pricingSnapshot: unknown;
  preTaxTotalCents: number;
  taxTotalCents: number;
  taxLines: GuestTaxLine[];
  guestTotalCents: number;
  currency: string;
};

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(cents || 0) / 100);
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
      <div className={styles.errorState}>
        <p className="eyebrow dark">Booking status</p>
        <h1>We couldn&apos;t load this reservation.</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className={styles.pending}>
        <p className="eyebrow dark">Almost done</p>
        <h1>Confirming your reservation…</h1>
        <p>
          We are checking the payment result and finalizing the booking.
        </p>
      </div>
    );
  }

  if (booking.confirmationCode !== confirmationCode) {
    return (
      <div className={styles.errorState}>
        <h1>This confirmation does not match the reservation.</h1>
      </div>
    );
  }

  if (booking.status !== "CONFIRMED") {
    return (
      <div className={styles.pending}>
        <p className="eyebrow dark">Payment processing</p>
        <h1>We&apos;re finishing your reservation.</h1>
        <p>
          We are waiting for payment confirmation. This page will update
          automatically when the reservation is ready.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.state}>
      <div className={styles.statusTop}>
        <span className={styles.check}>✓</span>
        <p className="eyebrow dark">Booking confirmed</p>
        <h1>{booking.propertyName || "Your stay"} is booked.</h1>
        <p>
          Your dates are reserved. Keep the confirmation number below for quick
          access to your trip.
        </p>
      </div>

      <div className={styles.confirmationGrid}>
        <div>
          <span>Confirmation</span>
          <strong>{booking.confirmationCode}</strong>
        </div>
        <div>
          <span>Stay dates</span>
          <strong>
            {booking.checkIn} → {booking.checkOut}
          </strong>
        </div>
        <div>
          <span>Total paid</span>
          <strong>{money(booking.guestTotalCents, booking.currency)}</strong>
        </div>
      </div>

      <div className={styles.nextSteps}>
        <strong>Everything for the reservation is in My Trip.</strong>
        <span>
          Use My Trip to contact the host, review booking details, request a
          booking change or send a cancellation request to the host.
        </span>
      </div>

      <div className={`panel ${styles.receipt}`}>
        <p className="eyebrow dark">Receipt</p>
        <h2>Payment breakdown</h2>
        <BookingReceipt
          pricingSnapshot={booking.pricingSnapshot}
          preTaxTotalCents={booking.preTaxTotalCents}
          taxTotalCents={booking.taxTotalCents}
          guestTotalCents={booking.guestTotalCents}
          currency={booking.currency}
          taxLines={booking.taxLines}
        />
        <PrintReceiptButton />
      </div>

      <p className={styles.modeNote}>
        {testMode
          ? "Stripe test mode was used. No live money moved."
          : "Payment was processed securely on the host's connected payment account."}
      </p>
    </div>
  );
}
