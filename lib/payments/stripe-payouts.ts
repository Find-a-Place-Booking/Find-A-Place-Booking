/**
 * Legacy manual-payout API compatibility module.
 *
 * The direct-charge model leaves host proceeds in the host's connected Stripe
 * account. Find A Place must not force manual payout schedules or create host bank
 * transfers.
 */
export type StripeBalanceSettings = Record<string, never>;
export type StripeConnectedBalance = {
  available?: Array<{ amount: number; currency: string; source_types?: Record<string, number> }>;
  pending?: Array<{ amount: number; currency: string }>;
};
export type StripeConnectedPayout = {
  id: string;
  amount: number;
  currency: string;
  status: string;
};

function retired(): never {
  throw new Error(
    "Manual Find A Place host payouts are disabled. Stripe controls the host balance and bank deposits in the direct-charge model.",
  );
}

export async function ensureManualPayoutSchedule(_connectedAccountId: string) {
  return retired();
}

export async function retrieveConnectedBalance(_connectedAccountId: string) {
  return retired();
}

export function availableBalanceCents(
  balance: StripeConnectedBalance,
  currency: string,
) {
  const normalized = currency.toLowerCase();
  return (balance.available ?? [])
    .filter((item) => item.currency?.toLowerCase() === normalized)
    .reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0)), 0);
}

export async function createConnectedPayout(_input: {
  connectedAccountId: string;
  amountCents: number;
  currency: string;
  payoutRecordId: string;
  reservationId: string;
  confirmationCode: string;
}) {
  return retired();
}

export async function retrieveConnectedPayout(
  _connectedAccountId: string,
  _payoutId: string,
) {
  return retired();
}
