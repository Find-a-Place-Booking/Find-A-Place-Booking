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
      ? `About ${money(difference)} below our estimate`
      : "Airbnb-style fee comparison"
    : lowerHere
      ? `Save ${money(difference)} booking direct`
      : difference < 0
        ? `Airbnb is ${money(-difference)} less for these dates`
        : "Both options have the same pre-tax total";
  const subhead = isEstimated
    ? "Modeled against a similar stay, before taxes."
    : "The same listing, dates and guests, before taxes.";
  const details = comparison.breakdown;
  const observed = comparison.observedAt
    ? new Date(comparison.observedAt)
    : null;

  return (
    <aside
      className={`${styles.card} ${compact ? styles.compact : ""}`}
      aria-label={isEstimated ? "Estimated Airbnb-style booking comparison" : "Same-listing Airbnb price comparison"}
    >
      <div className={styles.intro}>
        <div>
          <p className={styles.kicker}>Booking comparison</p>
          <h3 className={styles.headline}>{headline}</h3>
          <p className={styles.subhead}>{subhead}</p>
        </div>
        <span className={styles.label}>
          {isEstimated ? "Estimate, not a quote" : "Same listing"}
        </span>
      </div>

      <div className={styles.prices}>
        <div className={`${styles.price} ${styles.direct}`}>
          <img
            className={styles.brandSeal}
            src="/brand/find-a-place-seal.png"
            width={34}
            height={34}
            alt=""
            aria-hidden="true"
          />
          <span className={styles.priceName}>
            <strong>Find A Place</strong>
            <small>Book directly</small>
          </span>
          <strong className={styles.amount}>{money(comparison.findAPlaceTotalCents)}</strong>
        </div>
        <div className={styles.price}>
          <span className={styles.airbnbWordmark} aria-hidden="true">Airbnb</span>
          <span className={styles.priceName}>
            <strong>{isEstimated ? "Airbnb-style estimate" : "Airbnb"}</strong>
            <small>{isEstimated ? "Similar stay · modeled price" : "Same stay and dates"}</small>
          </span>
          <strong className={styles.amount}>{money(comparison.airbnbTotalCents)}</strong>
        </div>
      </div>

      <details className={styles.details}>
        <summary>{isEstimated ? "How we estimated this" : "View comparison details"}</summary>
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
          {isEstimated && comparison.hostFeeComparison ? (
            <p className={styles.explanation}>
              The modeled Airbnb amount includes an illustrative host-side Airbnb fee of {money(comparison.hostFeeComparison.modeledAirbnbHostFeeCents)}. This is not an additional Find A Place charge.
            </p>
          ) : null}
          <p className={styles.explanation}>
            {isEstimated
              ? "This example assumes an equivalent stay and equal host proceeds with an illustrative 15.5% Airbnb host service fee. It is not an actual Airbnb price or guaranteed savings; host pricing and fees can differ."
              : `Comparison for ${checkIn} to ${checkOut}, ${guests} ${guests === 1 ? "guest" : "guests"}.${observed && !Number.isNaN(observed.getTime()) ? ` Airbnb price checked ${observed.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.` : ""} Actual prices can change.`}
          </p>
          <p className={styles.explanation}>
            Both amounts are before lodging taxes, pets, optional extras and promotions. Your final total appears in checkout before payment.
          </p>
          {!isEstimated && comparison.airbnbListingUrl ? (
            <a className={styles.external} href={comparison.airbnbListingUrl} target="_blank" rel="noopener noreferrer">
              View the same property on Airbnb
            </a>
          ) : null}
        </div>
      </details>
    </aside>
  );
}
