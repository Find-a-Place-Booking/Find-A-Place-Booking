"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import styles from "./ReservationChat.module.css";

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

type CancellationRequest = {
  id: string;
  status: string;
  reason: string | null;
  hostResponse: string | null;
  requestedAt: string;
  respondedAt: string | null;
  completedAt: string | null;
};

type CancellationState = {
  confirmationCode: string;
  reservationStatus: string;
  paymentStatus: string;
  checkIn: string;
  checkOut: string;
  canRequest: boolean;
  request: CancellationRequest | null;
  policy: string;
};

type ChangeRequest = {
  id: string;
  status: string;
  requestText: string;
  hostResponse: string | null;
  requestedAt: string;
  respondedAt: string | null;
  completedAt: string | null;
};

type ChangeState = {
  confirmationCode: string;
  reservationStatus: string;
  checkIn: string;
  checkOut: string;
  canRequest: boolean;
  request: ChangeRequest | null;
};

type RequestMode = "CHANGE" | "CANCEL" | null;

function senderLabel(value: string) {
  if (value === "GUEST") return "You";
  if (value === "HOST") return "Host";
  return "Find A Place";
}

function readable(value: string | null | undefined) {
  return (value || "—")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isLegacyRequestMessage(body: string) {
  const value = body.trim();
  return (
    /^\[change request\]/i.test(value) ||
    /^change request:/i.test(value) ||
    /^i would like to request cancellation of this reservation/i.test(value) ||
    /^cancellation request (approved|declined)/i.test(value) ||
    /^cancellation approved without refund/i.test(value)
  );
}

export function GuestTripTools({
  reservationId,
  checkoutToken,
  confirmationCode,
  hostName,
  hostEmail,
  hostPhone,
  guestName,
  canReview,
}: {
  reservationId: string;
  checkoutToken: string;
  confirmationCode: string;
  hostName: string;
  hostEmail: string | null;
  hostPhone: string | null;
  guestName: string;
  canReview: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [cancellation, setCancellation] = useState<CancellationState | null>(null);
  const [changeRequest, setChangeRequest] = useState<ChangeState | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [requestDraft, setRequestDraft] = useState("");
  const [requestMode, setRequestMode] = useState<RequestMode>(null);
  const [rating, setRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query = new URLSearchParams({ reservationId, checkoutToken });
    const [messageResponse, reviewResponse, cancellationResponse, changeResponse] =
      await Promise.all([
        fetch(`/api/trip/messages?${query.toString()}`, { cache: "no-store" }),
        fetch(`/api/trip/review?${query.toString()}`, { cache: "no-store" }),
        fetch(`/api/trip/cancellation?${query.toString()}`, { cache: "no-store" }),
        fetch(`/api/trip/change-request?${query.toString()}`, { cache: "no-store" }),
      ]);

    if (messageResponse.ok) {
      const payload = await messageResponse.json();
      setMessages((payload.messages ?? []).filter((item: Message) => !isLegacyRequestMessage(item.body)));
    }
    if (reviewResponse.ok) {
      const payload = await reviewResponse.json();
      setReview(payload.review ?? null);
    }
    if (cancellationResponse.ok) {
      setCancellation((await cancellationResponse.json()) as CancellationState);
    }
    if (changeResponse.ok) {
      setChangeRequest((await changeResponse.json()) as ChangeState);
    }
  }, [reservationId, checkoutToken]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!requestMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !requestBusy) {
        setRequestMode(null);
        setRequestDraft("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestMode, requestBusy]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!messageDraft.trim() || busy) return;

    setBusy(true);
    setNotice(null);
    const response = await fetch("/api/trip/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reservationId,
        checkoutToken,
        message: messageDraft.trim(),
      }),
    });
    const payload = await response.json().catch(() => null);
    setBusy(false);

    if (!response.ok) {
      setNotice(payload?.error || "Message could not be sent.");
      return;
    }

    setMessageDraft("");
    setNotice("Message sent. Your host was also notified by email.");
    await load();
  }

  function openRequest(mode: Exclude<RequestMode, null>) {
    setNotice(null);
    setRequestDraft("");
    setRequestMode(mode);
  }

  async function submitRequest(event: FormEvent) {
    event.preventDefault();
    if (!requestMode || !requestDraft.trim() || requestBusy) return;

    setRequestBusy(true);
    setNotice(null);

    const endpoint =
      requestMode === "CHANGE" ? "/api/trip/change-request" : "/api/trip/cancellation";
    const body =
      requestMode === "CHANGE"
        ? {
            reservationId,
            checkoutToken,
            requestText: requestDraft.trim(),
          }
        : {
            reservationId,
            checkoutToken,
            reason: requestDraft.trim(),
          };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    setRequestBusy(false);

    if (!response.ok) {
      setNotice(payload?.error || "Your request could not be sent.");
      return;
    }

    const sentMode = requestMode;
    setRequestMode(null);
    setRequestDraft("");
    setNotice(
      sentMode === "CHANGE"
        ? "Change request sent to your host. They were also notified by email."
        : "Cancellation request sent to your host. The reservation remains active until the host responds.",
    );
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
      body: JSON.stringify({ reservationId, checkoutToken, rating, review: reviewBody }),
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

  const hostEmailHref = hostEmail
    ? `mailto:${hostEmail}?subject=${encodeURIComponent(
        `Find A Place booking ${confirmationCode}`,
      )}&body=${encodeURIComponent(
        `Hi ${hostName},\n\nI'm contacting you about Find A Place reservation ${confirmationCode}.\n\n`,
      )}`
    : null;

  const openChange = changeRequest?.request?.status === "REQUESTED";
  const openCancellation = ["REQUESTED", "APPROVED"].includes(
    cancellation?.request?.status || "",
  );

  return (
    <>
      <section className={styles.requestToolbar} aria-label="Booking requests">
        <div>
          <p className="eyebrow dark">Booking requests</p>
          <h2>Need to change something?</h2>
          <p className="muted">
            Send a structured request to the host. Requests stay separate from your normal message thread.
          </p>
        </div>
        <div className={styles.requestActions}>
          <button
            className={styles.secondaryAction}
            type="button"
            onClick={() => openRequest("CHANGE")}
            disabled={openChange || !changeRequest?.canRequest}
          >
            {openChange ? "Change requested" : "Request a change"}
          </button>
          <button
            className={styles.secondaryAction}
            type="button"
            onClick={() => openRequest("CANCEL")}
            disabled={openCancellation || !cancellation?.canRequest}
          >
            {openCancellation ? "Cancellation requested" : "Request cancellation"}
          </button>
        </div>

        {(changeRequest?.request || cancellation?.request) ? (
          <div className={styles.requestStatusStrip}>
            {changeRequest?.request ? (
              <div>
                <span>Change request</span>
                <strong>{readable(changeRequest.request.status)}</strong>
                {changeRequest.request.hostResponse ? (
                  <small>{changeRequest.request.hostResponse}</small>
                ) : null}
              </div>
            ) : null}
            {cancellation?.request ? (
              <div>
                <span>Cancellation request</span>
                <strong>{readable(cancellation.request.status)}</strong>
                {cancellation.request.hostResponse ? (
                  <small>{cancellation.request.hostResponse}</small>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className={styles.shell} id="messages">
        <div className={styles.chatHeader}>
          <div>
            <p className="eyebrow dark">Booking messages</p>
            <h2>Talk with {hostName}.</h2>
            <p className="muted">
              Use this thread for check-in details, questions and normal conversation about the stay.
            </p>
            <span className={styles.guestIdentity}>Booking guest · {guestName}</span>
          </div>
          <div className={styles.contactLinks}>
            {hostEmailHref ? (
              <a className={styles.actionLink} href={hostEmailHref}>Email host</a>
            ) : null}
            {hostPhone ? (
              <a className={styles.actionLink} href={`tel:${hostPhone}`}>Call host</a>
            ) : null}
            {hostPhone ? (
              <a className={styles.actionLink} href={`sms:${hostPhone}`}>Text host</a>
            ) : null}
          </div>
        </div>

        <div className={styles.thread} aria-live="polite">
          {messages.length ? (
            messages.map((item) => {
              const guest = item.sender_type === "GUEST";
              return (
                <div
                  className={`${styles.messageRow} ${guest ? styles.messageRowGuest : styles.messageRowHost}`}
                  key={item.id}
                >
                  <div className={`${styles.bubble} ${guest ? styles.bubbleGuest : styles.bubbleHost}`}>
                    <div className={styles.bubbleMeta}>
                      <strong>{guest ? `You · ${guestName}` : senderLabel(item.sender_type)}</strong>
                      <span>
                        {new Date(item.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className={styles.bubbleBody}>{item.body}</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className={styles.emptyThread}>
              <div>
                <strong>No messages yet.</strong>
                <p>Send the host a message whenever you have a question about the stay.</p>
              </div>
            </div>
          )}
        </div>

        <form className={styles.composer} onSubmit={sendMessage}>
          <textarea
            value={messageDraft}
            onChange={(event) => setMessageDraft(event.target.value)}
            placeholder={`Message ${hostName} about check-in, arrival details or the property…`}
            required
          />
          <div className={styles.composerFooter}>
            <span className={styles.composerNote}>
              Messages stay with this reservation and also notify the host by email.
            </span>
            <button className={styles.sendButton} type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send message"}
            </button>
          </div>
        </form>
      </section>

      {notice ? <div className={`admin-message success ${styles.pageNotice}`}>{notice}</div> : null}

      <section className={`panel ${styles.reviewPanel}`} id="review">
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
                <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
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
                  rows={4}
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
            <h2>Review after checkout.</h2>
            <p className="muted">Verified reviews open once the stay is complete.</p>
          </>
        )}
      </section>

      {requestMode ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !requestBusy) {
              setRequestMode(null);
              setRequestDraft("");
            }
          }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="trip-request-title">
            <button
              className={styles.modalClose}
              type="button"
              aria-label="Close"
              disabled={requestBusy}
              onClick={() => {
                setRequestMode(null);
                setRequestDraft("");
              }}
            >
              ×
            </button>
            <p className="eyebrow dark">
              {requestMode === "CHANGE" ? "Booking change" : "Cancellation"}
            </p>
            <h2 id="trip-request-title">
              {requestMode === "CHANGE" ? "Request a change from your host" : "Request cancellation from your host"}
            </h2>
            <p className="muted">
              {requestMode === "CHANGE"
                ? "Tell the host exactly what you want changed. Nothing changes until the host responds and the reservation is updated."
                : cancellation?.policy || "Sending a request does not cancel the reservation or guarantee a refund."}
            </p>
            <form onSubmit={submitRequest}>
              <label className={styles.modalField}>
                <span>{requestMode === "CHANGE" ? "What would you like to change?" : "Reason or note for the host"}</span>
                <textarea
                  autoFocus
                  rows={6}
                  value={requestDraft}
                  onChange={(event) => setRequestDraft(event.target.value)}
                  placeholder={
                    requestMode === "CHANGE"
                      ? "Example: Could we move our stay from Oct. 21–24 to Oct. 22–25?"
                      : "Tell the host why you need to cancel or include any circumstances they should know about…"
                  }
                  required
                />
              </label>
              <div className={styles.modalActions}>
                <button
                  className={styles.modalCancel}
                  type="button"
                  disabled={requestBusy}
                  onClick={() => {
                    setRequestMode(null);
                    setRequestDraft("");
                  }}
                >
                  Back
                </button>
                <button className={styles.sendButton} type="submit" disabled={requestBusy}>
                  {requestBusy
                    ? "Sending…"
                    : requestMode === "CHANGE"
                      ? "Send change request"
                      : "Send cancellation request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
