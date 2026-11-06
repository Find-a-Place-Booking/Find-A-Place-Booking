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
  comparisonType?: "VERIFIED" | "ESTIMATED";
  airbnbTotalCents?: number;
  findAPlaceTotalCents?: number;
  savingsCents?: number;
  observedAt?: string;
  airbnbListingUrl?: string;
  currency?: string;
  priceBasis?: "BEFORE_TAXES";
  airbnbHostFeeAssumptionBps?: number;
  fapHostFeeAssumptionBps?: number;
  assumptions?: "SAME_HOST_PROCEEDS_BEFORE_PROCESSING";
  breakdown?: Breakdown | null;
  hostFeeComparison?: {
    fapHostCommissionCents: number;
    modeledAirbnbHostFeeCents: number;
  };
};

function isMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Does not alter the price charged to the guest. Purely informative. */
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
  // Retained for existing call-site compatibility.
  fapTotalCents?: number;
  receiptPreTaxTotalCents?: number;
}) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [checking, setChecking] = useState(false);
  const ready = Boolean(
    unitId && checkIn && checkOut && Number.isInteger(guests) && guests! > 0,
  );

  useEffect(() => {
    setComparison(null);
    if (!ready) { setChecking(false); return; }
    const controller = new AbortController();
    const q = new URLSearchParams({
      unitId: unitId!, checkIn: checkIn!, checkOut: checkOut!,
      guests: String(guests),
    });
    setChecking(true);
    fetch(`/api/booking/airbnb-comparison?${q}`, {
      cache: "no-store", signal: controller.signal,
    })
      .then(async response => response.ok ? await response.json() as Comparison : null)
      .then(result => { if (!controller.signal.aborted) setComparison(result); })
      .catch(() => { /* A comparison failure must never block payment. */ })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, [ready, unitId, checkIn, checkOut, guests]);

  if (checking && ready && !comparison) {
    return (
      <p className={styles.checking} role="status">
        Comparing booking costs…
      </p>
    );
  }

  if (!comparison?.available || comparison.priceBasis !== "BEFORE_TAXES" ||
    !isMoney(comparison.findAPlaceTotalCents) ||
    !isMoney(comparison.airbnbTotalCents) ||
    comparison.findAPlaceTotalCents === 0 || comparison.airbnbTotalCents === 0 ||
    comparison.currency !== currency ||
    (receiptPreTaxTotalCents !== undefined &&
      comparison.findAPlaceTotalCents !== receiptPreTaxTotalCents)) return null;

  const isEstimated = comparison.comparisonType === "ESTIMATED";
  if (isEstimated && (comparison.assumptions !== "SAME_HOST_PROCEEDS_BEFORE_PROCESSING" ||
    comparison.airbnbHostFeeAssumptionBps !== 1550)) return null;
  if (!isEstimated && (comparison.comparisonType !== "VERIFIED" || !comparison.observedAt)) return null;

  const money = (value: number) => new Intl.NumberFormat("en-US", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(value / 100);
  const difference = comparison.airbnbTotalCents - comparison.findAPlaceTotalCents;
  const lowerHere = difference > 0;
  const headline = isEstimated
    ? lowerHere
      ? `Estimated savings: ${money(difference)}`
      : "Airbnb-style fee comparison"
    : lowerHere
      ? `Save ${money(difference)} booking direct`
      : difference < 0
        ? `Airbnb is ${money(-difference)} less for these dates`
        : "Both options have the same pre-tax total";
  const subhead = isEstimated
    ? "A similar stay priced for equal host earnings, not an actual Airbnb quote."
    : "Same Airbnb listing, dates and guest count; recent before-tax price.";
  const details = comparison.breakdown;
  const observed = comparison.observedAt
    ? new Date(comparison.observedAt)
    : null;

  return (
    <aside className={`${styles.card} ${compact ? styles.compact : ""}`}
      aria-label={isEstimated ? "Estimated Airbnb-style booking comparison" : "Same listing Airbnb price comparison"}>
      <div className={styles.topline}>
        <span>Compare your stay</span>
        <span className={styles.kind}>{isEstimated ? "Illustrative estimate" : "Same Airbnb listing"}</span>
      </div>

      <h3 className={styles.headline}>{headline}</h3>
      <p className={styles.subhead}>{subhead}</p>

      <div className={styles.priceRows}>
        <div className={styles.priceRow}>
          <span>Find A Place</span>
          <strong className={styles.ourPrice}>{money(comparison.findAPlaceTotalCents)}</strong>
        </div>
        <div className={styles.priceRow}>
          <span>{isEstimated ? "Similar Airbnb-style stay" : "Airbnb price"}</span>
          <strong>{money(comparison.airbnbTotalCents)}</strong>
        </div>
      </div>

      <details className={styles.details}>
        <summary>See the price breakdown</summary>
        {details ? (
          <div className={styles.breakdown}>
            <span>Nightly lodging subtotal</span><strong>{money(details.lodgingCents)}</strong>
            <span>Cleaning fee</span><strong>{money(details.cleaningCents)}</strong>
            {details.extraGuestCents > 0 ? <><span>Extra guest fees</span><strong>{money(details.extraGuestCents)}</strong></> : null}
            {details.guestServiceFeeCents > 0 ? <><span>Guest service fee</span><strong>{money(details.guestServiceFeeCents)}</strong></> : null}
            {details.includedOtherCents > 0 ? <><span>Other included fees</span><strong>{money(details.includedOtherCents)}</strong></> : null}
            <span className={styles.totalLabel}>Find A Place before taxes</span>
            <strong className={styles.totalLabel}>{money(comparison.findAPlaceTotalCents)}</strong>
          </div>
        ) : null}
        {isEstimated && comparison.hostFeeComparison ? (
          <div className={styles.feeModel}>
            <span>Host-side marketplace fees, not added at checkout</span>
            <div><span>Find A Place host fee</span><strong>{money(comparison.hostFeeComparison.fapHostCommissionCents)}</strong></div>
            <div><span>Modeled Airbnb host fee</span><strong>{money(comparison.hostFeeComparison.modeledAirbnbHostFeeCents)}</strong></div>
          </div>
        ) : null}
        {isEstimated ? (
          <p className={styles.finePrint}>
            Estimated Airbnb-style pricing is modeled from this stay&apos;s required
            pre-tax charges and a 15.5% illustrative Airbnb host service fee,
            assuming the host earns the same amount after marketplace fees.
            It is not a market survey, quote from Airbnb, or guaranteed saving.
            Actual prices, host fee arrangements, and payment costs can differ.
          </p>
        ) : (
          <p className={styles.finePrint}>
            Compared for {checkIn} to {checkOut}, {guests} {guests === 1 ? "guest" : "guests"}.
            {observed && !Number.isNaN(observed.getTime())
              ? ` Airbnb price checked ${observed.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.`
              : ""}
            {" "}Airbnb prices can change.
          </p>
        )}
        <p className={styles.finePrint}>
          Both figures exclude lodging taxes, pets, optional add-ons and promo discounts.
          Your actual checkout total is shown separately above.
        </p>
        {!isEstimated && comparison.airbnbListingUrl ? (
          <a className={styles.external} href={comparison.airbnbListingUrl}
            target="_blank" rel="noreferrer noopener">
            View the same stay on Airbnb
          </a>
        ) : null}
      </details>
    </aside>
  );
}
