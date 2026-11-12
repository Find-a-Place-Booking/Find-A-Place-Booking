import { estimateAirbnbDifference } from "@/lib/bookings/airbnb-savings-estimate";
import styles from "./NightlySavingsPreview.module.css";

// Illustrative only, based on a one-night lodging price. Use the higher of the
// platform's two common guest-fee tiers, 7%, rather than implying that every
// property qualifies for the partner 5% rate. This is not an external price.
const CONSERVATIVE_GUEST_FEE_BPS = 700;

/** The actual date-specific quote in DirectBookingValue replaces this teaser. */
export function getIllustrativeNightlySavings(nightlyPriceUsd: number): number | null {
  if (!Number.isFinite(nightlyPriceUsd) || nightlyPriceUsd <= 0 || nightlyPriceUsd > 100_000) {
    return null;
  }

  const lodgingCents = Math.round(nightlyPriceUsd * 100);
  const assumedGuestFeeCents = Math.round(lodgingCents * CONSERVATIVE_GUEST_FEE_BPS / 10_000);
  const result = estimateAirbnbDifference({
    fapPreTaxTotalCents: lodgingCents + assumedGuestFeeCents,
    lodgingBaseCents: lodgingCents,
    guestServiceFeeCents: assumedGuestFeeCents,
    fapHostCommissionBps: CONSERVATIVE_GUEST_FEE_BPS,
    feePayer: "GUEST",
  });
  if (!result || result.estimatedSavingsCents <= 0) return null;

  // Round DOWN the illustration to avoid overstating a modeled difference.
  const wholeDollars = Math.floor(result.estimatedSavingsCents / 100);
  return wholeDollars >= 1 ? wholeDollars : null;
}

export function NightlySavingsPreview({
  nightlyPriceUsd,
  minimal = false,
}: {
  nightlyPriceUsd: number;
  minimal?: boolean;
}) {
  const savings = getIllustrativeNightlySavings(nightlyPriceUsd);
  if (savings === null) return null;

  return (
    <div className={`${styles.preview} ${minimal ? styles.minimal : ""}`} aria-label="Illustrative potential savings">
      <strong>Could save about ${savings}/night*</strong>
      <small>
        *Illustrative fee comparison, not a checked price. Assumes up to 7% Find A Place guest fees
        and 15.5% host-side fees elsewhere with equal host proceeds; excludes cleaning, taxes,
        discounts and optional extras. Check dates for a trip comparison.
      </small>
    </div>
  );
}
