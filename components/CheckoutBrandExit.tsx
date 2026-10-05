"use client";

import { useState } from "react";

export function CheckoutBrandExit() {
  const [leaving, setLeaving] = useState(false);

  async function goHome() {
    if (leaving) return;
    setLeaving(true);

    const params = new URLSearchParams(window.location.search);
    const reservationId = params.get("reservationId");
    const checkoutToken = params.get("checkoutToken");

    if (reservationId && checkoutToken) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 4_000);

      try {
        await fetch("/api/booking/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId, checkoutToken }),
          credentials: "same-origin",
          cache: "no-store",
          keepalive: true,
          signal: controller.signal,
        });
      } catch {
        // If the explicit release cannot finish, the server-side hold timer
        // remains the fail-safe. Never let navigation get stuck.
      } finally {
        window.clearTimeout(timeout);
      }
    }

    window.location.assign("/");
  }

  return (
    <button
      type="button"
      className="brand"
      aria-label="Find A Place home"
      disabled={leaving}
      onClick={() => void goHome()}
      style={{
        appearance: "none",
        border: 0,
        background: "transparent",
        padding: 0,
        color: "inherit",
        font: "inherit",
        textAlign: "left",
        cursor: leaving ? "wait" : "pointer",
      }}
    >
      <img
        className="brand-seal"
        src="/brand/find-a-place-seal.png"
        alt=""
        aria-hidden="true"
      />
      <span className="brand-copy">
        <strong>Find A Place</strong>
        <small>Booking · Arkansas, Missouri &amp; beyond</small>
      </span>
    </button>
  );
}
