"use client";
import React from "react";
import { api } from "./api";
import type { Reservation } from "./HostWebApp";
type Message = {
  id: string;
  sender_type: string;
  body: string;
  created_at: string;
  read_by_host_at?: string | null;
};
export function Messages({
  token,
  organizationId,
  reservation,
}: {
  token: string;
  organizationId: string;
  reservation: Reservation;
}) {
  const [messages, setMessages] = React.useState<Message[]>([]),
    [body, setBody] = React.useState(""),
    [error, setError] = React.useState(""),
    [busy, setBusy] = React.useState(false);
  const mounted = React.useRef(true);
  const version = React.useRef(0);
  const load = React.useCallback(async () => {
    if (!mounted.current) return;
    const current = ++version.current;
    const d = await api<{ messages: Message[] }>(
      `/api/mobile/v1/host/messages?reservationId=${encodeURIComponent(reservation.id)}`,
      token,
      "GET",
      undefined,
      organizationId,
    );
    if (current !== version.current) return;
    setMessages(d.messages);
    if (
      d.messages.some(
        (m) => m.sender_type === "GUEST" && m.read_by_host_at == null,
      ) &&
      document.visibilityState === "visible"
    )
      await api(
        "/api/mobile/v1/host/messages",
        token,
        "POST",
        { reservationId: reservation.id, action: "read" },
        organizationId,
      );
  }, [token, organizationId, reservation.id]);
  React.useEffect(() => {
    mounted.current = true;
    let active = true;
    const refresh = () => {
      if (document.visibilityState === "visible")
        void load().catch((e) => {
          if (active) setError(e.message);
        });
    };
    refresh();
    const timer = setInterval(refresh, 20000);
    return () => {
      active = false;
      mounted.current = false;
      version.current++;
      clearInterval(timer);
    };
  }, [load]);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(
        "/api/mobile/v1/host/messages",
        token,
        "POST",
        { reservationId: reservation.id, message: body },
        organizationId,
      );
      setBody("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="stack">
      <h2 className="title">{reservation.guest_name || "Guest"}</h2>
      <small className="muted">
        Reservation {reservation.confirmation_code}
      </small>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="stack" aria-label="Conversation">
        {messages.map((m) => (
          <div
            className={`bubble ${m.sender_type === "HOST" ? "own" : ""}`}
            key={m.id}
          >
            <small>
              {m.sender_type.toLowerCase()} ·{" "}
              {new Date(m.created_at).toLocaleString()}
            </small>
            <p>{m.body}</p>
          </div>
        ))}
        {!messages.length ? (
          <p className="panel muted">No messages yet.</p>
        ) : null}
      </div>
      <form className="panel stack" onSubmit={send}>
        <label className="field">
          Message your guest
          <textarea
            disabled={busy}
            required
            maxLength={4000}
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <button className="button dark" disabled={busy || !body.trim()}>
          {busy ? "Sending…" : "Send message"}
        </button>
      </form>
    </section>
  );
}
