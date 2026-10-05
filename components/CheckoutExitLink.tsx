"use client";

import type { ReactNode } from "react";
import { useState } from "react";

export function CheckoutExitLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const [leaving, setLeaving] = useState(false);

  async function leaveCheckout() {
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
        // The server-side hold timer remains the fail-safe if release cannot
        // complete before navigation.
      } finally {
        window.clearTimeout(timeout);
      }
    }

    window.location.assign(href);
  }

  return (
    <button
      type="button"
      className="checkout-exit-link"
      disabled={leaving}
      style={{
        appearance: "none",
        border: 0,
        background: "transparent",
        padding: 0,
        color: "inherit",
        font: "inherit",
        fontWeight: 700,
        cursor: leaving ? "wait" : "pointer",
        textDecoration: "underline",
        textUnderlineOffset: "3px",
      }}
      onClick={() => void leaveCheckout()}
    >
      {leaving ? "Releasing dates…" : children}
    </button>
  );
}
