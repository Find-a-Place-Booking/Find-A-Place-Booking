"use client";

import { useEffect, useState } from "react";

import styles from "./DirectBookingValue.module.css";

type Breakdown = {
  lodgingCents: number;
  cleaningCents: number;
  extraGuestCents: number;
  guestServiceFeeCents: number;
  includedOtherCents: number;
  preTaxTotalCents: number;
};

type Comparison = {
  available: boolean;
  comparisonType?: "VERIFIED" | "ESTIMATED" | "DIRECT_UNAVAILABLE";
  comparisonTotalCents?: number;
  // Backward compatibility with an earlier API response.
  airbnbTotalCents?: number;
  findAPlaceTotalCents?: number;
  currency?: string;
  priceBasis?: "BEFORE_TAXES";
  observedAt?: string;
  assumptions?: "SAME_HOST_PROCEEDS_BEFORE_PROCESSING";
  comparisonFeeAssumptionBps?: number;
  airbnbHostFeeAssumptionBps?: number;
  breakdown?: Breakdown | null;
  hostFeeComparison?: {
    fapHostCommissionCents: number;
    modeledAirbnbHostFeeCents: number;
  };
};

function validCents(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Informational comparison only. Never adjusts the booking quote or checkout amount. */
export function DirectBookingValue({
  unitId,
  checkIn,
  checkOut,
  guests,
  currency = "USD",
  compact = false,
  receiptPreTaxTotalCents,
}: {
  unitId?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  currency?: string;
  compact?: boolean;
  fapTotalCents?: number; // Legacy call-site prop, not used for comparison.
  receiptPreTaxTotalCents?: number;
}) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [checking, setChecking] = useState(false);
  const ready = Boolean(
    unitId && checkIn && checkOut && Number.isInteger(guests) && guests! > 0,
  );

  useEffect(() => {
    setComparison(null);
    if (!ready) {
      setChecking(false);
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({
      unitId: unitId!, checkIn: checkIn!, checkOut: checkOut!, guests: String(guests),
    });
    setChecking(true);
    fetch(`/api/booking/airbnb-comparison?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async response => response.ok ? await response.json() as Comparison : null)
      .then(value => { if (!controller.signal.aborted) setComparison(value); })
      .catch(() => { /* Comparisons must never prevent a reservation. */ })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [ready, unitId, checkIn, checkOut, guests]);

  if (checking && ready && !comparison) {
    return <p className={styles.checking} role="status">Checking booking costs for these dates…</p>;
  }

  if (comparison?.comparisonType === "DIRECT_UNAVAILABLE") {
    return (
      <aside className={`${styles.card} ${compact ? styles.compact : ""}`} aria-label="Other booking platform comparison status">
        <p className={styles.kicker}>Same-stay price check</p>
        <h3 className={styles.headline}>Exact comparison price unavailable</h3>
        <p className={styles.subhead}>
          This stay is also listed elsewhere, but a current price could not be verified for these dates.
          We won&apos;t show an unverified savings amount as a direct quote.
        </p>
      </aside>
    );
  }

  const otherTotal = comparison?.comparisonTotalCents ?? comparison?.airbnbTotalCents;
  if (!comparison?.available || comparison.priceBasis !== "BEFORE_TAXES" ||
      !validCents(comparison.findAPlaceTotalCents) || !validCents(otherTotal) ||
      comparison.findAPlaceTotalCents === 0 || otherTotal === 0 ||
      comparison.currency !== currency ||
      (receiptPreTaxTotalCents !== undefined && comparison.findAPlaceTotalCents !== receiptPreTaxTotalCents)) {
    return null;
  }

  const estimated = comparison.comparisonType === "ESTIMATED";
  const verified = comparison.comparisonType === "VERIFIED" && Boolean(comparison.observedAt);
  if (!estimated && !verified) return null;
  if (estimated && (
    comparison.assumptions !== "SAME_HOST_PROCEEDS_BEFORE_PROCESSING" ||
    (comparison.comparisonFeeAssumptionBps ?? comparison.airbnbHostFeeAssumptionBps) !== 1550
  )) return null;

  const money = (value: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(value / 100);
  const difference = otherTotal - comparison.findAPlaceTotalCents;
  const headline = difference > 0
    ? estimated
      ? `Could save about ${money(difference)} on this stay`
      : `You could save ${money(difference)} booking here`
    : difference === 0
      ? "Both prices match before taxes"
      : estimated
        ? "Our estimate shows no savings for these dates"
        : "Another booking platform currently has a lower price";
  const observed = comparison.observedAt ? new Date(comparison.observedAt) : null;
  const checkedDate = observed && !Number.isNaN(observed.getTime())
    ? observed.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : null;
  const details = comparison.breakdown;

  return (
    <aside
      className={`${styles.card} ${compact ? styles.compact : ""}`}
      aria-label={estimated ? "Illustrative booking price estimate" : "Checked same-stay booking price comparison"}
    >
      <div className={styles.intro}>
        <div>
          <p className={styles.kicker}>Compare your booking price</p>
          <h3 className={styles.headline}>{headline}</h3>
          <p className={styles.subhead}>
            {estimated
              ? "Illustrative estimate for an equivalent booking, not a live price elsewhere."
              : "Checked price for this same stay, dates and guest count."}
          </p>
        </div>
        <span className={styles.label}>{estimated ? "Illustrative estimate" : "Checked price"}</span>
      </div>

      <div className={styles.prices}>
        <div className={`${styles.price} ${styles.direct}`}>
          <img className={styles.brandSeal} src="/brand/find-a-place-seal.png" width={34} height={34} alt="" aria-hidden="true" />
          <span className={styles.priceName}>
            <strong>Find A Place</strong>
            <small>Your price before taxes</small>
          </span>
          <strong className={styles.amount}>{money(comparison.findAPlaceTotalCents)}</strong>
        </div>
        <div className={styles.price}>
          <span aria-hidden="true" style={{ flex: "0 0 34px", width: 34, height: 34, display: "inline-grid", placeItems: "center", borderRadius: "50%", border: "1px solid #cdd6cf", background: "#eef2ee", color: "#4a6858", fontWeight: 700 }}>↗</span>
          <span className={styles.priceName}>
            <strong>{estimated ? "Other booking platforms" : "Another booking platform"}</strong>
            <small>{estimated ? "Illustrative price model" : "Same property · checked price"}</small>
          </span>
          <strong className={styles.amount}>{money(otherTotal)}</strong>
        </div>
      </div>

      <details className={styles.details}>
        <summary>{estimated ? "How this estimate works" : "How this price was checked"}</summary>
        <div className={styles.expanded}>
          {details ? (
            <div className={styles.breakdown}>
              <span>Lodging</span><strong>{money(details.lodgingCents)}</strong>
              {details.cleaningCents > 0 ? <><span>Cleaning</span><strong>{money(details.cleaningCents)}</strong></> : null}
              {details.extraGuestCents > 0 ? <><span>Additional guests</span><strong>{money(details.extraGuestCents)}</strong></> : null}
              {details.guestServiceFeeCents > 0 ? <><span>Find A Place guest service fee</span><strong>{money(details.guestServiceFeeCents)}</strong></> : null}
              {details.includedOtherCents > 0 ? <><span>Other required charges</span><strong>{money(details.includedOtherCents)}</strong></> : null}
              <span className={styles.total}>Find A Place before taxes</span>
              <strong className={styles.total}>{money(comparison.findAPlaceTotalCents)}</strong>
            </div>
          ) : null}
          <p className={styles.explanation}>
            {estimated
              ? "This is a fee-based illustration for an equivalent stay, assuming equal host proceeds and a hypothetical 15.5% host-side fee on another booking service. It is not an actual price quote, a market average, or a guarantee of savings. Different hosts and platforms may charge differently."
              : `This is a checked price for the same property, dates and guests${checkedDate ? `, observed ${checkedDate}` : ""}. Prices and availability can change; this comparison is not affiliated with any other booking service.`}
          </p>
          <p className={styles.explanation}>
            Both amounts are before taxes. Pets, optional extras and promotions can change the final total.
            The complete Find A Place booking price is confirmed before payment.
          </p>
        </div>
      </details>
    </aside>
  );
}
