"use client";

import { useEffect, useState } from "react";

type Comparison = {
  available: boolean;
  comparisonType?: "VERIFIED" | "ESTIMATED";
  airbnbTotalCents?: number;
  findAPlaceTotalCents?: number;
  savingsCents?: number;
  observedAt?: string;
  airbnbListingUrl?: string;
  currency?: string;
  priceBasis?: "BEFORE_TAXES";
  airbnbHostFeeAssumptionBps?: number;
  assumptions?: "SAME_HOST_PROCEEDS_BEFORE_PROCESSING";
};

/**
 * VERIFIED: the exact Airbnb listing, dates, and party size with a recent quote.
 * ESTIMATED: a non-Airbnb-connected listing, modeled from published fees.
 * Missing / unmatched linked Airbnb quotes NEVER become estimated savings.
 * Does not change the price charged at checkout.
 */
export function DirectBookingValue({
  unitId, checkIn, checkOut, guests, currency = "USD", compact = false,
  receiptPreTaxTotalCents,
}: {
  unitId?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  currency?: string;
  compact?: boolean;
  // Accepted for compatibility with existing checkout and receipt call sites.
  fapTotalCents?: number;
  /** On receipts, only render a comparison if today's exact-dates quote agrees
   * with the actual reservation snapshot. Otherwise hide the comparison. */
  receiptPreTaxTotalCents?: number;
}) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [checking, setChecking] = useState(false);
  const ready = Boolean(unitId && checkIn && checkOut && Number.isInteger(guests) && guests! > 0);

  useEffect(() => {
    setComparison(null);
    if (!ready) { setChecking(false); return; }
    const controller = new AbortController();
    const params = new URLSearchParams({
      unitId: unitId!, checkIn: checkIn!, checkOut: checkOut!, guests: String(guests),
    });
    setChecking(true);
    fetch(`/api/booking/airbnb-comparison?${params.toString()}`, {
      cache: "no-store", signal: controller.signal,
    })
      .then(async (response) => response.ok ? await response.json() as Comparison : null)
      .then((payload) => { if (!controller.signal.aborted) setComparison(payload); })
      .catch(() => { /* An unavailable price provider must not interrupt checkout. */ })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [ready, unitId, checkIn, checkOut, guests]);

  const validTotals = comparison?.available &&
    comparison.priceBasis === "BEFORE_TAXES" &&
    (comparison.comparisonType === "VERIFIED" || comparison.comparisonType === "ESTIMATED") &&
    Number.isSafeInteger(comparison.airbnbTotalCents) &&
    Number.isSafeInteger(comparison.findAPlaceTotalCents) &&
    Number(comparison.airbnbTotalCents) > 0 &&
    Number(comparison.findAPlaceTotalCents) > 0 &&
    comparison.currency === currency &&
    (receiptPreTaxTotalCents === undefined ||
      comparison.findAPlaceTotalCents === receiptPreTaxTotalCents);

  if (!validTotals || !comparison) {
    return ready && checking ? (
      <div role="status" style={{ margin: compact ? "8px 0" : "12px 0", fontSize: 13, opacity: .72 }}>
        Checking direct-booking value…
      </div>
    ) : null;
  }

  const isEstimated = comparison.comparisonType === "ESTIMATED";
  // The model is only shown with its explicit assumptions. Older cached
  // payloads that omit the model basis cannot be rendered as estimates.
  if (isEstimated && (
    comparison.assumptions !== "SAME_HOST_PROCEEDS_BEFORE_PROCESSING" ||
    comparison.airbnbHostFeeAssumptionBps !== 1550
  )) return null;
  if (!isEstimated && !comparison.observedAt) return null;

  const fapCents = comparison.findAPlaceTotalCents!;
  const airbnbCents = comparison.airbnbTotalCents!;
  const differenceCents = airbnbCents - fapCents;
  const money = (cents: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency,
  }).format(cents / 100);
  const observed = comparison.observedAt
    ? new Date(comparison.observedAt).toLocaleString("en-US", {
        dateStyle: "medium", timeStyle: "short",
      })
    : null;

  const title = isEstimated
    ? differenceCents > 0
      ? `Estimated savings: ${money(differenceCents)}`
      : "Estimated Airbnb fee comparison"
    : differenceCents > 0
      ? `Save ${money(differenceCents)} booking here`
      : differenceCents < 0
        ? `Airbnb is ${money(-differenceCents)} less for these dates`
        : "The quoted price is the same on Airbnb";

  return (
    <aside aria-label={isEstimated ? "Estimated Airbnb fee comparison" : "Verified Airbnb listing price comparison"}
      style={{
        margin: compact ? "9px 0 13px" : "14px 0 18px",
        padding: compact ? "12px 14px" : "18px 20px",
        border: "1px solid rgba(133,111,85,.28)",
        background: "#f8f5ee", borderRadius: 9, color: "#392f28",
      }}>
      <p style={{ margin: "0 0 9px", fontSize: compact ? 15 : 17, fontWeight: 700 }}>
        {title}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", columnGap: 12, rowGap: 8 }}>
        <span>Find A Place</span>
        <strong>{money(fapCents)}</strong>
        <span>{isEstimated ? "Modeled Airbnb-equivalent price" : "Airbnb quoted price"}</span>
        <strong>{money(airbnbCents)}</strong>
      </div>
      {isEstimated ? (
        <small style={{ display: "block", opacity: .8, lineHeight: 1.5, marginTop: 11 }}>
          Illustration only, not an Airbnb price quote or guaranteed savings.
          Assumes a host sets an Airbnb price to keep the same earnings after
          Airbnb&apos;s typical 15.5% host service fee. Actual host pricing,
          payment-processing costs and Airbnb fees can vary. Comparing the
          selected stay before taxes, with no optional pets, add-ons or discounts.
        </small>
      ) : (
        <small style={{ display: "block", opacity: .8, lineHeight: 1.5, marginTop: 11 }}>
          Same property, {checkIn} to {checkOut}, {guests} {guests === 1 ? "guest" : "guests"}.
          Before taxes, without optional pets or add-ons. Airbnb prices can change.
          {observed ? ` Price checked ${observed}.` : ""}
        </small>
      )}
      {!isEstimated && comparison.airbnbListingUrl ? (
        <a href={comparison.airbnbListingUrl} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-block", marginTop: 7, fontSize: 13,
            textDecoration: "underline", color: "inherit" }}>
          Check this listing on Airbnb
        </a>
      ) : null}
    </aside>
  );
}
