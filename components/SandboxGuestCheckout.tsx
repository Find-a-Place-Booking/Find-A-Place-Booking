"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";

import styles from "./SandboxGuestCheckout.module.css";

type PropertySummary = {
  unitId: string;
  slug: string;
  name: string;
  location: string;
  image?: string | null;
  maxGuests: number;
};

type Props = {
  property: PropertySummary;
  checkIn: string;
  checkOut: string;
  guests: number;
  publishableKey: string;
  initialReservationId?: string | null;
};

type Hold = {
  reservationId: string;
  confirmationCode: string;
  holdExpiresAt: string;
  guestTotalCents: number;
  platformCommissionCents: number;
  commissionRateBps: number;
};

type BookingStatus = {
  reservationId: string;
  confirmationCode: string;
  status: string;
  paymentStatus: string;
  holdExpiresAt?: string | null;
  guestTotalCents: number;
  platformCommissionCents: number;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function persistReservationInUrl(reservationId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("reservationId", reservationId);
  window.history.replaceState({}, "", url.toString());
}

function StripePaymentForm({
  reservationId,
  confirmationCode,
}: {
  reservationId: string;
  confirmationCode: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || busy) return;

    setBusy(true);
    setError(null);

    const confirmedUrl =
      `${window.location.origin}/booking/confirmed` +
      `?reservationId=${encodeURIComponent(reservationId)}` +
      `&code=${encodeURIComponent(confirmationCode)}`;

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: confirmedUrl,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setError(
        result.error.message || "Stripe could not complete the test payment.",
      );
      setBusy(false);
      return;
    }

    try {
      const finalize = await fetch("/api/booking/sandbox/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId }),
      });

      const payload = await finalize.json();

      if (!finalize.ok) {
        throw new Error(
          payload.error ||
            "Payment succeeded but booking finalization is still processing.",
        );
      }

      window.location.assign(confirmedUrl);
    } catch (finalizeError) {
      setError(
        finalizeError instanceof Error
          ? finalizeError.message
          : "Payment succeeded but booking finalization is still processing.",
      );
      setBusy(false);
    }
  }

  return (
    <form className={styles.paymentForm} onSubmit={submit}>
      <PaymentElement />
      {error ? <div className={styles.error}>{error}</div> : null}
      <button
        className="button button-full"
        type="submit"
        disabled={!stripe || busy}
      >
        {busy ? "Processing test payment…" : "Pay with Stripe test card"}
      </button>
      <small>
        Use Stripe sandbox card 4242 4242 4242 4242. No live money moves.
      </small>
    </form>
  );
}

export function SandboxGuestCheckout({
  property,
  checkIn,
  checkOut,
  guests,
  publishableKey,
  initialReservationId,
}: Props) {
  const [guestName, setGuestName] = useState("Test Guest");
  const [guestEmail, setGuestEmail] = useState("testguest@example.com");
  const [guestPhone, setGuestPhone] = useState("");
  const [pets, setPets] = useState(0);
  const [hold, setHold] = useState<Hold | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] =
    useState<PromiseLike<Stripe | null> | null>(null);
  const [busy, setBusy] = useState(Boolean(initialReservationId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStripePromise(loadStripe(publishableKey));
  }, [publishableKey]);

  useEffect(() => {
    if (!initialReservationId) return;

    const reservationId = initialReservationId;
    let cancelled = false;

    async function resumeExistingReservation() {
      setBusy(true);
      setError(null);

      try {
        // First see whether the reservation is already confirmed.
        const statusResponse = await fetch(
          `/api/booking/sandbox/status?reservationId=${encodeURIComponent(
            reservationId,
          )}`,
          { cache: "no-store" },
        );
        const statusPayload = await statusResponse.json();

        if (!statusResponse.ok) {
          throw new Error(
            statusPayload.error || "Unable to recover this sandbox booking.",
          );
        }

        const status = statusPayload as BookingStatus;

        if (status.status === "CONFIRMED") {
          window.location.replace(
            `/booking/confirmed?reservationId=${encodeURIComponent(
              status.reservationId,
            )}&code=${encodeURIComponent(status.confirmationCode)}`,
          );
          return;
        }

        // If Stripe already succeeded before the page refresh, finalize it now.
        const finalizeResponse = await fetch("/api/booking/sandbox/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId }),
        });
        const finalizePayload = await finalizeResponse.json();

        if (finalizeResponse.ok) {
          const code =
            finalizePayload.confirmationCode || status.confirmationCode;

          window.location.replace(
            `/booking/confirmed?reservationId=${encodeURIComponent(
              reservationId,
            )}&code=${encodeURIComponent(code)}`,
          );
          return;
        }

        // A 409 with a non-succeeded Stripe intent just means checkout still
        // needs payment. Resume the existing PaymentIntent instead of creating
        // another reservation or another charge.
        if (finalizeResponse.status !== 409) {
          throw new Error(
            finalizePayload.error ||
              "Unable to recover the existing Stripe payment.",
          );
        }

        const paymentResponse = await fetch(
          "/api/booking/sandbox/payment-intent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reservationId }),
          },
        );
        const paymentPayload = await paymentResponse.json();

        if (!paymentResponse.ok || !paymentPayload.clientSecret) {
          throw new Error(
            paymentPayload.error ||
              "Unable to resume the existing Stripe test payment.",
          );
        }

        if (cancelled) return;

        setHold({
          reservationId: status.reservationId || reservationId,
          confirmationCode: status.confirmationCode,
          holdExpiresAt: status.holdExpiresAt || new Date().toISOString(),
          guestTotalCents: status.guestTotalCents,
          platformCommissionCents: status.platformCommissionCents,
          commissionRateBps: 0,
        });
        setClientSecret(paymentPayload.clientSecret);
      } catch (resumeError) {
        if (!cancelled) {
          setError(
            resumeError instanceof Error
              ? resumeError.message
              : "Unable to recover this sandbox booking.",
          );
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    resumeExistingReservation();

    return () => {
      cancelled = true;
    };
  }, [initialReservationId]);

  const nights = useMemo(() => {
    const start = new Date(`${checkIn}T12:00:00`);
    const end = new Date(`${checkOut}T12:00:00`);
    return Math.max(
      0,
      Math.round((end.getTime() - start.getTime()) / 86400000),
    );
  }, [checkIn, checkOut]);

  async function createHold() {
    setBusy(true);
    setError(null);

    try {
      const holdResponse = await fetch("/api/booking/sandbox/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: property.unitId,
          checkIn,
          checkOut,
          guests,
          pets,
          guestName,
          guestEmail,
          guestPhone,
        }),
      });

      const holdPayload = await holdResponse.json();

      if (!holdResponse.ok) {
        throw new Error(holdPayload.error || "Unable to hold these dates.");
      }

      const nextHold = holdPayload as Hold;

      // Put the canonical reservation UUID in the URL immediately. A browser
      // refresh can now recover this exact checkout instead of losing it.
      persistReservationInUrl(nextHold.reservationId);
      setHold(nextHold);

      const paymentResponse = await fetch(
        "/api/booking/sandbox/payment-intent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId: nextHold.reservationId }),
        },
      );

      const paymentPayload = await paymentResponse.json();

      if (!paymentResponse.ok || !paymentPayload.clientSecret) {
        throw new Error(
          paymentPayload.error || "Unable to start Stripe test payment.",
        );
      }

      setClientSecret(paymentPayload.clientSecret);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to start sandbox checkout.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.layout}>
      <section className={styles.checkoutCard}>
        <p className="eyebrow dark">Sandbox booking test</p>
        <h1>Complete your test booking</h1>

        {busy && initialReservationId && !clientSecret ? (
          <p>Recovering your existing sandbox booking…</p>
        ) : !clientSecret ? (
          <>
            <div className={styles.guestGrid}>
              <label>
                <span>Name</span>
                <input
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                />
              </label>

              <label>
                <span>Email</span>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(event) => setGuestEmail(event.target.value)}
                />
              </label>

              <label>
                <span>Phone</span>
                <input
                  value={guestPhone}
                  onChange={(event) => setGuestPhone(event.target.value)}
                />
              </label>

              <label>
                <span>Pets</span>
                <select
                  value={pets}
                  onChange={(event) => setPets(Number(event.target.value))}
                >
                  {[0, 1, 2, 3, 4].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {error ? <div className={styles.error}>{error}</div> : null}

            <button
              className="button button-full"
              type="button"
              onClick={createHold}
              disabled={
                busy ||
                !guestName.trim() ||
                !guestEmail.trim() ||
                !checkIn ||
                !checkOut
              }
            >
              {busy ? "Checking dates…" : "Hold dates & continue to payment"}
            </button>
          </>
        ) : stripePromise && hold ? (
          <>
            <div className={styles.holdNotice}>
              <strong>Dates held for test checkout</strong>
              <span>
                Reservation {hold.confirmationCode}
              </span>
            </div>

            <Elements
              stripe={stripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: "stripe",
                },
              }}
            >
              <StripePaymentForm
                reservationId={hold.reservationId}
                confirmationCode={hold.confirmationCode}
              />
            </Elements>
          </>
        ) : (
          <>
            {error ? <div className={styles.error}>{error}</div> : null}
            <p>Loading Stripe test payment…</p>
          </>
        )}
      </section>

      <aside className={styles.summary}>
        {property.image ? (
          <img src={property.image} alt={property.name} />
        ) : null}

        <strong>{property.name}</strong>
        <span>{property.location}</span>

        <div className={styles.summaryRows}>
          <div><span>Check in</span><b>{checkIn}</b></div>
          <div><span>Check out</span><b>{checkOut}</b></div>
          <div><span>Nights</span><b>{nights}</b></div>
          <div><span>Guests</span><b>{guests}</b></div>
          {hold ? (
            <div className={styles.total}>
              <span>Test total</span>
              <b>{money(hold.guestTotalCents)}</b>
            </div>
          ) : null}
        </div>

        <small>
          Sandbox only. Taxes are still intentionally not calculated in this
          test milestone.
        </small>
      </aside>
    </div>
  );
}
