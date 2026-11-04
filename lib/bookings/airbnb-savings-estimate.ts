/**
 * Illustrative Airbnb price comparison, NOT an actual Airbnb listing quote.
 * Airbnb's currently published typical single host fee is 15.5% in the US,
 * but exceptions exist. The model assumes the host sets an Airbnb price to
 * retain the same proceeds after platform fees as a Find A Place reservation.
 * It excludes taxes, optional selections and payment-processing differences.
 */
export const TYPICAL_AIRBNB_HOST_FEE_BPS = 1550;

export type EstimatedAirbnbDifference = {
  airbnbEquivalentTotalCents: number;
  estimatedSavingsCents: number;
  fapPreTaxTotalCents: number;
  assumptions: "SAME_HOST_PROCEEDS_BEFORE_PROCESSING";
};

export function estimateAirbnbDifference(input: {
  fapPreTaxTotalCents: number;
  lodgingBaseCents: number;
  guestServiceFeeCents: number;
  fapHostCommissionBps: number;
  feePayer: "HOST" | "GUEST";
}): EstimatedAirbnbDifference | null {
  const { fapPreTaxTotalCents, lodgingBaseCents, guestServiceFeeCents,
    fapHostCommissionBps, feePayer } = input;

  const money = [fapPreTaxTotalCents, lodgingBaseCents, guestServiceFeeCents];
  if (!money.every((amount) => Number.isSafeInteger(amount) && amount >= 0) ||
      !Number.isSafeInteger(fapHostCommissionBps) ||
      fapHostCommissionBps < 0 || fapHostCommissionBps > 1500 ||
      fapPreTaxTotalCents <= 0 || lodgingBaseCents <= 0 ||
      feePayer !== "HOST" && feePayer !== "GUEST" ||
      guestServiceFeeCents > fapPreTaxTotalCents) return null;

  const accommodationSubtotal = fapPreTaxTotalCents - guestServiceFeeCents;
  if (lodgingBaseCents > accommodationSubtotal) return null;

  const hostCommission = feePayer === "HOST"
    ? Math.round(lodgingBaseCents * fapHostCommissionBps / 10_000)
    : 0;
  const hostProceeds = accommodationSubtotal - hostCommission;
  if (hostProceeds <= 0) return null;

  // Airbnb's assumed price to deliver equivalent host proceeds after its
  // typical single host fee (not a quote from Airbnb or this property's host).
  const airbnbEquivalentTotalCents = Math.round(
    hostProceeds * 10_000 / (10_000 - TYPICAL_AIRBNB_HOST_FEE_BPS),
  );
  if (!Number.isSafeInteger(airbnbEquivalentTotalCents)) return null;

  return {
    airbnbEquivalentTotalCents,
    estimatedSavingsCents: airbnbEquivalentTotalCents - fapPreTaxTotalCents,
    fapPreTaxTotalCents,
    assumptions: "SAME_HOST_PROCEEDS_BEFORE_PROCESSING",
  };
}
