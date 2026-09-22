import { stripeEnvironment } from "@/lib/payments/booking-runtime";

/**
 * Legacy compatibility module.
 *
 * Find A Place no longer owns or schedules host bank transfers. Direct guest
 * charges belong to the host's connected processor account, and Stripe controls
 * balance availability and bank-deposit timing. Historical reservation-payout
 * rows remain in the database only for audit of pre-direct-charge bookings.
 */
export type HostPayoutRow = {
  id: string;
  reservationId: string;
  confirmationCode: string;
  propertyName: string;
  amountCents: number;
  currency: string;
  cancellationCutoffDate: string;
  cancellationCutoffAt: string;
  payoutEligibleDate: string;
  payoutEligibleAt: string;
  status: string;
  initiatedAt: string | null;
  estimatedArrivalAt: string | null;
  paidAt: string | null;
  failedAt: string | null;
  lastError: string | null;
};

export async function getHostPayoutWorkspace() {
  return {
    organizations: [],
    environment: stripeEnvironment(),
    payouts: [] as HostPayoutRow[],
    disabled: true,
  };
}
