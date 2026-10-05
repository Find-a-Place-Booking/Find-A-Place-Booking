"use client";

import { useState } from "react";

export function CheckoutRecoveryResume({
  reservationId,
  checkoutToken,
}: {
  reservationId: string;
  checkoutToken: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resumeCheckout() {
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/booking/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          reservationId,
          checkoutToken,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        redirectTo?: string;
        error?: string;
      } | null;

      if (payload?.redirectTo) {
        window.location.assign(payload.redirectTo);
        return;
      }

      throw new Error(
        payload?.error || "We could not reopen this checkout. Please try again.",
      );
    } catch (resumeError) {
      setError(
        resumeError instanceof Error
          ? resumeError.message
          : "We could not reopen this checkout. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, width: "100%" }}>
      {error ? (
        <div className="guest-state-card" style={{ padding: 12 }}>
          {error}
        </div>
      ) : null}

      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => void resumeCheckout()}
      >
        {busy ? "Checking your dates…" : "Continue checkout"}
      </button>
    </div>
  );
}
