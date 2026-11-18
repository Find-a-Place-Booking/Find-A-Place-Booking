"use client";

import { useEffect, useState } from "react";

export function GuestSecurityDepositBanner() {
  const [deposit, setDeposit] = useState<{ status: string; amountCents: number } | null>(null);
  const [link, setLink] = useState("");
  useEffect(() => {
    if (window.location.pathname.endsWith("/deposit")) return;
    const path = window.location.pathname;
    const confirmation = path.split("/").filter(Boolean).at(-1) || "";
    const query = new URLSearchParams(window.location.search);
    const reservationId = query.get("reservationId") || "";
    const checkoutToken = query.get("checkoutToken") || "";
    if (!reservationId || !checkoutToken || !confirmation) return;
    setLink(`/trip/${encodeURIComponent(confirmation)}/deposit?reservationId=${encodeURIComponent(reservationId)}&checkoutToken=${encodeURIComponent(checkoutToken)}`);
    let alive = true;
    void fetch("/api/booking/security-deposit/status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, checkoutToken }),
    }).then(r => r.ok ? r.json() : null).then(payload => {
      if (alive && payload && payload.status !== "NOT_REQUIRED" && payload.amountCents > 0) {
        setDeposit({ status: payload.status, amountCents: payload.amountCents });
      }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);
  if (!deposit || !link) return null;
  return <div className="shell" style={{ maxWidth: 900, paddingTop: 16 }}>
    <section className="panel" style={{ padding: 15 }}>
      <strong>{deposit.status === "PAID" ? "Refundable security deposit received" : "Separate refundable security deposit"}</strong>
      <p style={{ marginBlock: 8 }}>Your host's security deposit is ${(deposit.amountCents/100).toFixed(2)}. This is separate from the lodging charge and Find A Place guest fee. Status: {deposit.status.replaceAll("_", " ")}.</p>
      <a href={link}>View deposit terms, payment &amp; refund status →</a>
    </section>
  </div>;
}
