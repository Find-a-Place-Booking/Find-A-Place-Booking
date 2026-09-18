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
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams({
      reservationId,
      checkoutToken,
    });

    const [messageResponse, reviewResponse] = await Promise.all([
      fetch(`/api/trip/messages?${query.toString()}`, { cache: "no-store" }),
      fetch(`/api/trip/review?${query.toString()}`, { cache: "no-store" }),
    ]);

    if (messageResponse.ok) {
      const payload = await messageResponse.json();
      setMessages(payload.messages ?? []);
    }

    if (reviewResponse.ok) {
      const payload = await reviewResponse.json();
      setReview(payload.review ?? null);
    }
  }, [reservationId, checkoutToken]);

  useEffect(() => {
    load();
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
                  <small>
                    {new Date(item.created_at).toLocaleString("en-US")}
                  </small>
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
              <button
                className="button button-small"
                type="submit"
                disabled={busy}
              >
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
