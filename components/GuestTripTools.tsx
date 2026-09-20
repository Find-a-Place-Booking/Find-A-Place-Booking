"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Message = {
  id: string;
  sender_type: string;
  body: string;
  created_at: string;
};

type Review = {
  id: string;
  rating: number;
  body: string | null;
  status: string;
  host_response: string | null;
  created_at: string;
};

type CancellationState = {
  confirmationCode: string;
  reservationStatus: string;
  paymentStatus: string;
  checkIn: string;
  cancellationCutoffDate: string;
  payoutEligibleDate: string | null;
  payoutStatus: string | null;
  canCancel: boolean;
  refundAmountCents: number;
  currency: string;
  policy: string;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);
}

export function GuestTripTools({
  reservationId,
  checkoutToken,
  canReview,
}: {
  reservationId: string;
  checkoutToken: string;
  canReview: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [cancellation, setCancellation] = useState<CancellationState | null>(null);
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams({
      reservationId,
      checkoutToken,
    });

    const [messageResponse, reviewResponse, cancellationResponse] = await Promise.all([
      fetch(`/api/trip/messages?${query.toString()}`, { cache: "no-store" }),
      fetch(`/api/trip/review?${query.toString()}`, { cache: "no-store" }),
      fetch(`/api/trip/cancellation?${query.toString()}`, { cache: "no-store" }),
    ]);

    if (messageResponse.ok) {
      const payload = await messageResponse.json();
      setMessages(payload.messages ?? []);
    }

    if (reviewResponse.ok) {
      const payload = await reviewResponse.json();
      setReview(payload.review ?? null);
    }

    if (cancellationResponse.ok) {
      const payload = (await cancellationResponse.json()) as CancellationState;
      setCancellation(payload);
    }
  }, [reservationId, checkoutToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || busy) return;

    setBusy(true);
    setNotice(null);

    const response = await fetch("/api/trip/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId,
        checkoutToken,
        message,
      }),
    });

    const payload = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setNotice(payload?.error || "Message could not be sent.");
      return;
    }

    setMessage("");
    setNotice("Message sent to your host.");
    await load();
  }

  async function cancelReservation() {
    if (!cancellation?.canCancel || cancelBusy) return;

    const confirmed = window.confirm(
      `Cancel reservation ${cancellation.confirmationCode} and refund ${money(
        cancellation.refundAmountCents,
        cancellation.currency,
      )}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setCancelBusy(true);
    setNotice(null);

    const response = await fetch("/api/trip/cancellation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, checkoutToken }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setCancelBusy(false);
      setNotice(payload?.error || "The reservation could not be cancelled.");
      return;
    }

    const params = new URLSearchParams({
      code: payload?.confirmationCode || cancellation.confirmationCode,
      status: payload?.pending ? "pending" : "refunded",
    });
    window.location.assign(`/booking/cancelled?${params.toString()}`);
  }

  async function submitReview(event: FormEvent) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setNotice(null);

    const response = await fetch("/api/trip/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId,
        checkoutToken,
        rating,
        review: reviewBody,
      }),
    });

    const payload = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setNotice(payload?.error || "Review could not be saved.");
      return;
    }

    setNotice("Thanks. Your verified review is now attached to the stay.");
    await load();
  }

  return (
    <>
      <section className="panel">
        <p className="eyebrow dark">Messages</p>
        <h2>Message your host about this booking.</h2>

        {messages.length ? (
          <div className="admin-list compact">
            {messages.map((item) => (
              <div className="admin-list-row static" key={item.id}>
                <span>
                  <strong>{item.sender_type}</strong>
                  <small>{item.body}</small>
                </span>
                <span>
                  <small>{new Date(item.created_at).toLocaleString("en-US")}</small>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No messages yet.</p>
        )}

        <form className="settings-form" onSubmit={sendMessage}>
          <label>
            <span>New message</span>
            <textarea
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              required
            />
          </label>
          <button className="button button-small" type="submit" disabled={busy}>
            Send message
          </button>
        </form>
      </section>

      <section className="panel">
        <p className="eyebrow dark">Cancellation policy</p>
        <h2>
          {cancellation?.canCancel
            ? "This reservation is still inside the cancellation window."
            : "Cancellation window"}
        </h2>

        {cancellation ? (
          <>
            <p>{cancellation.policy}</p>
            <div className="setting-row">
              <span>Normal cancellation closes</span>
              <strong>{cancellation.cancellationCutoffDate}</strong>
            </div>
            {cancellation.canCancel ? (
              <>
                <div className="setting-row">
                  <span>Refund if cancelled now</span>
                  <strong>
                    {money(cancellation.refundAmountCents, cancellation.currency)}
                  </strong>
                </div>
                <button
                  className="button button-small button-quiet"
                  type="button"
                  onClick={cancelReservation}
                  disabled={cancelBusy}
                >
                  {cancelBusy ? "Cancelling…" : "Cancel reservation & refund"}
                </button>
              </>
            ) : null}
          </>
        ) : (
          <p className="muted">Loading cancellation policy…</p>
        )}
      </section>

      <section className="panel">
        <p className="eyebrow dark">Verified review</p>

        {review ? (
          <>
            <h2>{review.rating}/5</h2>
            <p>{review.body || "Rating submitted without written review."}</p>
            {review.host_response ? (
              <div className="review-note-inline">
                <strong>Host response</strong>
                <span>{review.host_response}</span>
              </div>
            ) : null}
          </>
        ) : canReview ? (
          <>
            <h2>How was your stay?</h2>
            <form className="settings-form" onSubmit={submitReview}>
              <label>
                <span>Rating</span>
                <select
                  value={rating}
                  onChange={(event) => setRating(Number(event.target.value))}
                >
                  <option value={5}>5 - Excellent</option>
                  <option value={4}>4 - Very good</option>
                  <option value={3}>3 - Good</option>
                  <option value={2}>2 - Fair</option>
                  <option value={1}>1 - Poor</option>
                </select>
              </label>
              <label>
                <span>Review</span>
                <textarea
                  rows={5}
                  value={reviewBody}
                  onChange={(event) => setReviewBody(event.target.value)}
                  placeholder="What should another traveler know about this stay?"
                />
              </label>
              <button className="button button-small" type="submit" disabled={busy}>
                Submit review
              </button>
            </form>
          </>
        ) : (
          <>
            <h2>Reviews open after checkout.</h2>
            <p className="muted">
              This keeps public reviews tied to guests who actually completed a
              reservation.
            </p>
          </>
        )}

        {notice ? <div className="admin-message success">{notice}</div> : null}
      </section>
    </>
  );
}
