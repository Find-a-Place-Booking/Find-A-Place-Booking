"use client";
import React from "react";
import { api, cash, dateLabel, openWebsite, today } from "./api";
type Credentials = { reservationId: string; checkoutToken: string };
type Trip = {
  id: string;
  confirmation_code: string;
  propertyName: string;
  status: string;
  check_in: string;
  check_out: string;
  guest_count: number;
  guest_total_cents: number;
  currency: string;
};
type Message = {
  id: string;
  sender_type: string;
  body: string;
  created_at: string;
};
type RequestState = {
  canRequest: boolean;
  policy?: string;
  request: { status: string; hostResponse?: string | null } | null;
};
export function Trips() {
  const [code, setCode] = React.useState(""),
    [email, setEmail] = React.useState(""),
    [credentials, setCredentials] = React.useState<Credentials | null>(null),
    [trip, setTrip] = React.useState<Trip | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]),
    [message, setMessage] = React.useState(""),
    [error, setError] = React.useState(""),
    [notice, setNotice] = React.useState(""),
    [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState<
      "change" | "cancel" | "review" | null
    >(null),
    [text, setText] = React.useState(""),
    [rating, setRating] = React.useState(5);
  const [change, setChange] = React.useState<RequestState | null>(null),
    [cancel, setCancel] = React.useState<RequestState | null>(null),
    [reviewLoaded, setReviewLoaded] = React.useState(false),
    [hasReview, setHasReview] = React.useState(false);
  const generation = React.useRef(0),
    locked = React.useRef(false);
  React.useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const loadMessages = React.useCallback(
    async (c: Credentials, current: number) => {
      const q = new URLSearchParams(c);
      const d = await api<{ messages: Message[] }>(
        `/api/mobile/v1/trip/messages?${q}`,
      );
      if (current === generation.current) setMessages(d.messages);
    },
    [],
  );
  async function loadStates(c: Credentials, current: number) {
    const q = new URLSearchParams(c);
    const [cancelState, changeState, reviewState] = await Promise.all([
      api<RequestState>(`/api/mobile/v1/trip/cancellation?${q}`),
      api<RequestState>(`/api/mobile/v1/trip/change-request?${q}`),
      api<{ review: unknown }>(`/api/mobile/v1/trip/review?${q}`),
    ]);
    if (current !== generation.current) return;
    setCancel(cancelState);
    setChange(changeState);
    setHasReview(Boolean(reviewState.review));
    setReviewLoaded(true);
  }
  function close() {
    generation.current++;
    locked.current = false;
    setBusy(false);
    setTrip(null);
    setCredentials(null);
    setMessages([]);
    setMessage("");
    setAction(null);
    setText("");
    setRating(5);
    setChange(null);
    setCancel(null);
    setReviewLoaded(false);
    setHasReview(false);
    setError("");
    setNotice("");
    setCode("");
    setEmail("");
  }
  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    if (locked.current) return;
    locked.current = true;
    const current = ++generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const found = await api<{ url: string }>(
        "/api/mobile/v1/trip/lookup",
        undefined,
        "POST",
        { confirmationCode: code, email },
      );
      const params = new URL(found.url, window.location.origin).searchParams,
        c = {
          reservationId: params.get("reservationId") || "",
          checkoutToken: params.get("checkoutToken") || "",
        };
      const d = await api<{ reservation: Trip }>(
        "/api/mobile/v1/trip/summary",
        undefined,
        "POST",
        c,
      );
      if (current !== generation.current) return;
      setTrip(d.reservation);
      setCredentials(c);
      setEmail("");
      const results = await Promise.allSettled([
        loadMessages(c, current),
        loadStates(c, current),
      ]);
      if (
        current === generation.current &&
        results.some((r) => r.status === "rejected")
      )
        setError(
          "Your trip opened, but some details could not load. Refresh trip to try again.",
        );
    } catch (e) {
      if (current === generation.current)
        setError(
          e instanceof Error ? e.message : "Unable to find reservation.",
        );
    } finally {
      if (current === generation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  }
  async function refresh() {
    if (!credentials || locked.current) return;
    const c = credentials,
      current = generation.current;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const d = await api<{ reservation: Trip }>(
        "/api/mobile/v1/trip/summary",
        undefined,
        "POST",
        c,
      );
      if (current !== generation.current) return;
      setTrip(d.reservation);
      await Promise.all([loadMessages(c, current), loadStates(c, current)]);
    } catch {
      if (current === generation.current)
        setError(
          "Some trip details could not refresh. Try again before sending another request.",
        );
    } finally {
      if (current === generation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  }
  React.useEffect(() => {
    if (!credentials) return;
    const current = generation.current;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void loadMessages(credentials, current).catch(() => {});
    }, 20000);
    return () => clearInterval(timer);
  }, [credentials, loadMessages]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!credentials || locked.current || !message.trim()) return;
    const c = credentials,
      current = generation.current;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/api/mobile/v1/trip/messages", undefined, "POST", {
        ...c,
        message,
      });
      if (current !== generation.current) return;
      setMessage("");
      setNotice("Message sent.");
      try {
        await loadMessages(c, current);
      } catch {
        if (current === generation.current)
          setError("Message sent, but the conversation could not refresh.");
      }
    } catch (e) {
      if (current === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "Could not confirm delivery. Refresh messages before retrying.",
        );
    } finally {
      if (current === generation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!credentials || !action || locked.current) return;
    const selected = action,
      c = credentials,
      current = generation.current;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const endpoint =
        selected === "change"
          ? "change-request"
          : selected === "cancel"
            ? "cancellation"
            : "review";
      await api(`/api/mobile/v1/trip/${endpoint}`, undefined, "POST", {
        ...c,
        ...(selected === "change"
          ? { requestText: text }
          : selected === "cancel"
            ? { reason: text }
            : { review: text, rating }),
      });
      if (current !== generation.current) return;
      setNotice(
        selected === "review"
          ? "Review submitted."
          : "Request sent to your host. Your booking remains unchanged until it is processed.",
      );
      setAction(null);
      setText("");
      if (selected === "change")
        setChange({ canRequest: false, request: { status: "REQUESTED" } });
      else if (selected === "cancel")
        setCancel((old) => ({
          ...old,
          canRequest: false,
          request: { status: "REQUESTED" },
        }));
      else setHasReview(true);
      try {
        await loadStates(c, current);
      } catch {
        if (current === generation.current)
          setError(
            "Your submission was received, but its status could not refresh. Refresh trip before trying again.",
          );
      }
    } catch (e) {
      if (current === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "Could not confirm your request. Refresh trip before retrying.",
        );
    } finally {
      if (current === generation.current) {
        locked.current = false;
        setBusy(false);
      }
    }
  }
  const canReview =
    trip?.status === "CONFIRMED" &&
    trip.check_out <= today() &&
    reviewLoaded &&
    !hasReview;
  return (
    <section className="stack">
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="panel good">
          {notice}
        </p>
      ) : null}
      {!trip ? (
        <form className="panel stack" onSubmit={lookup}>
          <h2 className="title">Find your reservation</h2>
          <label className="field">
            Confirmation number
            <input
              disabled={busy}
              required
              autoCapitalize="characters"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label className="field">
            Booking email
            <input
              disabled={busy}
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="button dark" disabled={busy}>
            {busy ? "Finding your trip…" : "Open my trip"}
          </button>
          <small className="muted">
            Use the details in your confirmation email. Close trip to clear this
            reservation from the app.
          </small>
        </form>
      ) : (
        <>
          <div className="panel stack">
            <div className="row">
              <h2 className="title">{trip.propertyName}</h2>
              <span className="chip">{trip.status}</span>
            </div>
            <strong>
              {dateLabel(trip.check_in)} – {dateLabel(trip.check_out)}
            </strong>
            <span>
              {trip.guest_count} guests ·{" "}
              {cash(trip.guest_total_cents, trip.currency)}
            </span>
            <span className="muted">Confirmation {trip.confirmation_code}</span>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void refresh()}
            >
              Refresh trip
            </button>
            <button className="button ghost" onClick={close}>
              Close trip
            </button>
          </div>
          {change?.request ? (
            <p className="panel">
              Change request: {change.request.status.toLowerCase()}
              {change.request.hostResponse
                ? ` · ${change.request.hostResponse}`
                : ""}
            </p>
          ) : null}
          {cancel?.request ? (
            <p className="panel">
              Cancellation request: {cancel.request.status.toLowerCase()}
              {cancel.request.hostResponse
                ? ` · ${cancel.request.hostResponse}`
                : ""}
            </p>
          ) : null}
          {hasReview ? (
            <p className="panel good">Your review has been submitted.</p>
          ) : null}
          <div className="flex-wrap">
            {trip.status === "CONFIRMED" ? (
              <>
                <button
                  className="button secondary"
                  disabled={busy || change?.canRequest !== true}
                  onClick={() => {
                    setAction("change");
                    setText("");
                  }}
                >
                  Request change
                </button>
                <button
                  className="button secondary"
                  disabled={busy || cancel?.canRequest !== true}
                  onClick={() => {
                    setAction("cancel");
                    setText("");
                  }}
                >
                  Request cancellation
                </button>
              </>
            ) : null}
            {canReview ? (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  setAction("review");
                  setText("");
                }}
              >
                Leave a review
              </button>
            ) : trip.status === "CONFIRMED" &&
              !hasReview &&
              trip.check_out > today() ? (
              <small className="muted">Reviews open after checkout.</small>
            ) : null}
          </div>
          {action ? (
            <form className="panel stack" onSubmit={submit}>
              <h3>
                {action === "change"
                  ? "What would you like to change?"
                  : action === "cancel"
                    ? "Request a cancellation"
                    : "How was your stay?"}
              </h3>
              {action === "cancel" ? (
                <p className="muted">
                  {cancel?.policy ||
                    "Sending a request does not cancel the stay or guarantee a refund. Your host applies the property policy accepted at booking."}
                </p>
              ) : null}
              {action === "review" ? (
                <label className="field">
                  Rating
                  <select
                    disabled={busy}
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} stars
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="field">
                {action === "review" ? "Review" : "Details"}
                <textarea
                  disabled={busy}
                  required
                  minLength={action === "review" ? 10 : 1}
                  maxLength={
                    action === "cancel"
                      ? 1200
                      : action === "change"
                        ? 1600
                        : 4000
                  }
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <button className="button" disabled={busy}>
                Submit {action === "review" ? "review" : "request"}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Go back
              </button>
            </form>
          ) : null}
          <h2 className="title">Messages with your host</h2>
          <div className="stack" aria-label="Conversation">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`bubble ${m.sender_type === "GUEST" ? "own" : ""}`}
              >
                <small>
                  {m.sender_type.toLowerCase()} ·{" "}
                  {new Date(m.created_at).toLocaleString()}
                </small>
                <p>{m.body}</p>
              </div>
            ))}
          </div>
          <form className="panel stack" onSubmit={send}>
            <label className="field">
              Message
              <textarea
                disabled={busy}
                required
                maxLength={4000}
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <button className="button dark" disabled={busy || !message.trim()}>
              Send message
            </button>
          </form>
        </>
      )}
      <div className="flex-wrap">
        <button
          className="button inline ghost"
          onClick={() => void openWebsite("/privacy")}
        >
          Privacy
        </button>
        <button
          className="button inline ghost"
          onClick={() => void openWebsite("/terms")}
        >
          Terms
        </button>
        <button
          className="button inline ghost"
          onClick={() => void openWebsite("/contact")}
        >
          Get help
        </button>
      </div>
    </section>
  );
}
