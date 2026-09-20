const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2026-07-29.dahlia";

function secretKey() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return key;
}

async function connectedStripeRequest<T>(
  connectedAccountId: string,
  path: string,
  init: {
    method?: "GET" | "POST";
    body?: URLSearchParams;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
    "Stripe-Account": connectedAccountId,
    "Stripe-Version": STRIPE_VERSION,
  };

  if (init.body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const response = await fetch(`${STRIPE_API}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  const payload = (await response.json().catch(() => ({}))) as
    | T
    | { error?: { message?: string; code?: string; type?: string } };

  if (!response.ok) {
    const error = (payload as { error?: { message?: string; code?: string } }).error;
    const message = error?.message || `Stripe returned HTTP ${response.status}.`;
    const wrapped = new Error(message) as Error & { stripeCode?: string; status?: number };
    wrapped.stripeCode = error?.code;
    wrapped.status = response.status;
    throw wrapped;
  }

  return payload as T;
}

export type StripeBalanceSettings = {
  payments?: {
    payouts?: {
      schedule?: {
        interval?: string | null;
      } | null;
      status?: string | null;
    } | null;
  } | null;
};

export type StripeConnectedBalance = {
  available?: Array<{
    amount: number;
    currency: string;
    source_types?: Record<string, number>;
  }>;
  pending?: Array<{
    amount: number;
    currency: string;
  }>;
};

export type StripeConnectedPayout = {
  id: string;
  amount: number;
  currency: string;
  status: "pending" | "in_transit" | "paid" | "failed" | "canceled" | string;
  arrival_date?: number | null;
  failure_code?: string | null;
  failure_message?: string | null;
  created?: number;
};

export async function ensureManualPayoutSchedule(connectedAccountId: string) {
  const body = new URLSearchParams();
  body.set("payments[payouts][schedule][interval]", "manual");

  const result = await connectedStripeRequest<StripeBalanceSettings>(
    connectedAccountId,
    "/balance_settings",
    { method: "POST", body },
  );

  const interval = result.payments?.payouts?.schedule?.interval ?? null;
  if (interval !== "manual") {
    throw new Error("Stripe did not confirm a manual payout schedule for this host account.");
  }

  return result;
}

export async function retrieveConnectedBalance(connectedAccountId: string) {
  return connectedStripeRequest<StripeConnectedBalance>(
    connectedAccountId,
    "/balance",
  );
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

export async function createConnectedPayout(input: {
  connectedAccountId: string;
  amountCents: number;
  currency: string;
  payoutRecordId: string;
  reservationId: string;
  confirmationCode: string;
}) {
  const body = new URLSearchParams();
  body.set("amount", String(input.amountCents));
  body.set("currency", input.currency.toLowerCase());
  body.set("method", "standard");
  body.set("description", `Find A Place ${input.confirmationCode}`.slice(0, 200));
  body.set("metadata[payout_record_id]", input.payoutRecordId);
  body.set("metadata[reservation_id]", input.reservationId);
  body.set("metadata[confirmation_code]", input.confirmationCode);
  body.set("metadata[payout_policy]", "CHECKIN_MINUS_13_DAYS");

  return connectedStripeRequest<StripeConnectedPayout>(
    input.connectedAccountId,
    "/payouts",
    {
      method: "POST",
      body,
      idempotencyKey: `fap-payout-${input.payoutRecordId}`,
    },
  );
}

export async function retrieveConnectedPayout(
  connectedAccountId: string,
  payoutId: string,
) {
  return connectedStripeRequest<StripeConnectedPayout>(
    connectedAccountId,
    `/payouts/${encodeURIComponent(payoutId)}`,
  );
}
