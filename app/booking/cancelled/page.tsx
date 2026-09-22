import Link from "next/link";

import { Brand } from "@/components/Brand";

export default async function CancelledBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; status?: string }>;
}) {
  const params = await searchParams;
  const status = (params.status || "cancelled").toLowerCase();
  const refundPending = status === "pending" || status === "refund_pending";
  const requested = status === "requested";
  const declined = status === "declined";
  const noRefund = status === "no_refund" || status === "cancelled_no_refund";

  const eyebrow = requested
    ? "Request sent"
    : refundPending
      ? "Refund processing"
      : declined
        ? "Request declined"
        : "Cancellation update";

  const title = requested
    ? "Your host received the cancellation request."
    : refundPending
      ? "The host-approved refund is processing."
      : declined
        ? "The reservation is still confirmed."
        : noRefund
          ? "The reservation was cancelled without a refund."
          : "The reservation was cancelled.";

  const copy = requested
    ? "Sending a request does not cancel the reservation by itself. The host will review the property terms accepted at booking and can respond through the reservation."
    : refundPending
      ? "The host approved the refund and Find A Place transmitted the instruction to the connected payment processor. Do not submit a duplicate request while the processor finishes the refund."
      : declined
        ? "The host declined the cancellation request. Open My Trip or your booking message thread if you need to discuss the reservation with the host."
        : noRefund
          ? "The host cancelled the reservation without a refund under the property terms recorded for the booking. The cancellation record remains available with the reservation."
          : "The cancellation was recorded for this reservation. Any refund status is tracked separately with the booking and payment processor.";

  return (
    <main className="confirm-page">
      <header className="checkout-header shell">
        <Brand />
        <span>Reservation update</span>
      </header>

      <section className="confirm-card guest-state-card">
        <p className="eyebrow dark">{eyebrow}</p>
        <h1>{title}</h1>
        {params.code ? (
          <p>
            Confirmation <strong>{params.code}</strong>
          </p>
        ) : null}
        <p>{copy}</p>
        <p className="muted">
          Ordinary cancellation decisions are handled by the host under the
          property terms accepted at booking, subject to applicable law. Find A
          Place records the request, communication and payment status.
        </p>
        <Link className="button" href="/trip">Open My Trip</Link>
        <Link className="confirm-secondary" href="/stays">Find another stay</Link>
      </section>
    </main>
  );
}
