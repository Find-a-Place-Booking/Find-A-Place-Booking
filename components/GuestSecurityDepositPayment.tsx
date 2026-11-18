"use client";

import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";

function DepositCard({ reservationId, checkoutToken }: { reservationId: string; checkoutToken: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function pay() {
    if (busy || !stripe || !elements) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}${window.location.pathname}${window.location.search}` },
        redirect: "if_required",
      });
      if (result.error) throw new Error(result.error.message || "Payment unsuccessful");
      const response = await fetch("/api/booking/security-deposit/status", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, checkoutToken }),
      });
      const status = await response.json();
      if (!response.ok) throw new Error(status.error || "Payment could not be confirmed");
      setMessage(status.status === "PAID" ? "Deposit paid successfully. The host will handle its return after checkout." : "Your deposit payment is processing. Refresh this page to check its status.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to process payment");
    } finally { setBusy(false); }
  }
  return <div className="panel" style={{ display: "grid", gap: 12 }}>
    <PaymentElement />
    {message ? <p role="status">{message}</p> : null}
    <button type="button" className="button" disabled={!stripe || busy} onClick={() => void pay()}>
      {busy ? "Processing deposit…" : "Pay refundable deposit"}
    </button>
  </div>;
}

export function GuestSecurityDepositPayment({ reservationId, checkoutToken, amountCents, publishableKey }: {
  reservationId: string; checkoutToken: string; amountCents: number; publishableKey: string;
}) {
  const [session, setSession] = useState<{ clientSecret: string; connectedAccountId: string } | null>(null);
  const [stripePromise, setStripePromise] = useState<PromiseLike<Stripe | null> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function start() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/booking/security-deposit/intent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, checkoutToken }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Couldn't open deposit payment");
      if (body.status === "PAID") { setMessage("This deposit has been paid."); return; }
      setStripePromise(loadStripe(publishableKey, { stripeAccount: body.connectedAccountId }));
      setSession({ clientSecret: body.clientSecret, connectedAccountId: body.connectedAccountId });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create payment session");
    } finally { setBusy(false); }
  }
  return <div>
    <p>Deposit amount: <strong>${(amountCents / 100).toFixed(2)}</strong>. This is a separate refundable charge made directly to your host's Stripe account. Find A Place does not add a platform fee or lodging tax to this deposit. The host's stated deposit terms apply.</p>
    {message ? <p role="status">{message}</p> : null}
    {session && stripePromise ? (
      <Elements key={session.clientSecret} stripe={stripePromise} options={{ clientSecret: session.clientSecret }}>
        <DepositCard reservationId={reservationId} checkoutToken={checkoutToken} />
      </Elements>
    ) : <button type="button" className="button" disabled={busy} onClick={() => void start()}>
      {busy ? "Opening secure payment…" : "Continue to separate deposit payment"}
    </button>}
  </div>;
}
