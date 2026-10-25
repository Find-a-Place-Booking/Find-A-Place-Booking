"use client";

import { useState } from "react";

export function AdminRecoveryOfferForm({
  reservationId,
  lodgingCents,
  guestTotalCents,
  currency,
  action,
}: {
  reservationId: string;
  lodgingCents: number;
  guestTotalCents: number;
  currency: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [discount, setDiscount] = useState(10);
  const [confirmed, setConfirmed] = useState(false);
  const savings = Math.round(lodgingCents * discount / 100);
  const money = (cents: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency,
  }).format(cents / 100);

  return (
    <form action={action} className="settings-form" style={{ maxWidth: 660 }}>
      <input type="hidden" name="reservationId" value={reservationId} />
      <label>
        <span>Discount on lodging</span>
        <select name="discountPercent" value={discount} onChange={(event) => {
          setDiscount(Number(event.target.value));
          setConfirmed(false);
        }}>
          {[5, 10, 15, 20].map((percent) => (
            <option key={percent} value={percent}>{percent}% off lodging</option>
          ))}
        </select>
      </label>
      <div className="dash-grid metrics" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(155px,1fr))" }}>
        <div><span>Original guest total</span><strong>{money(guestTotalCents)}</strong></div>
        <div><span>Original lodging</span><strong>{money(lodgingCents)}</strong></div>
        <div><span>Guest saves on lodging</span><strong>{money(savings)}</strong></div>
        <div><span>Illustrative total*</span><strong>{money(Math.max(0, guestTotalCents - savings))}</strong></div>
      </div>
      <p className="muted">*Original total minus discount before checkout recalculates taxes and fees. The discount is a one-use code for the selected stay, not an adjustment to an existing payment. Taxes, fees and the final checkout quote are recalculated by the normal booking system. This does not reserve the dates.</p>
      <label style={{ display: "flex", alignItems: "start", gap: 10 }}>
        <input type="checkbox" name="confirm" value="yes" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} style={{ marginTop: 5 }} />
        <span>I approve this one-time offer for my property and understand that the guest will receive an email immediately. Expires in 48 hours.</span>
      </label>
      <button className="button" type="submit" disabled={!confirmed}>
        Send special offer email
      </button>
    </form>
  );
}
