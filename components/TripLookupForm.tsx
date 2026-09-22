"use client";

import { FormEvent, useState } from "react";

export function TripLookupForm() {
  const [confirmationCode, setConfirmationCode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    const response = await fetch("/api/trip/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationCode, email }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.url) {
      setBusy(false);
      setError(
        payload?.error ||
          "We couldn't match that confirmation number and booking email.",
      );
      return;
    }

    window.location.assign(payload.url);
  }

  return (
    <form className="settings-form" onSubmit={submit}>
      <label>
        <span>Reservation / confirmation number</span>
        <input
          value={confirmationCode}
          onChange={(event) => setConfirmationCode(event.target.value.toUpperCase())}
          placeholder="Example: 70B312564C"
          autoComplete="off"
          required
        />
      </label>

      <label>
        <span>Booking email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email used when booking"
          autoComplete="email"
          required
        />
      </label>

      {error ? <div className="admin-message error">{error}</div> : null}

      <button className="button" type="submit" disabled={busy}>
        {busy ? "Opening trip…" : "Open My Trip"}
      </button>

      <small className="muted">
        For privacy, the confirmation number is matched with the email used for
        the reservation.
      </small>
    </form>
  );
}
