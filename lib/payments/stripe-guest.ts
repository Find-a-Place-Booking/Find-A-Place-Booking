import { createHash } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";

function secretKey() {
  const value = process.env.STRIPE_SECRET_KEY;
  if (!value) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return value;
}

async function stripeRequest<T>(
  path: string,
  init: {
    method?: "GET" | "POST";
    body?: URLSearchParams;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
  };

  if (init.body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (init.idempotencyKey) {
    headers["Idempotency-Key"] = init.idempotencyKey;
  }

  const response = await fetch(`${STRIPE_API}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
    cache: "no-store",
  });

  const raw = await response.text();
  let payload: any = null;

  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(
        `Stripe returned a non-JSON response (HTTP ${response.status}).`,
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Stripe request failed with HTTP ${response.status}.`,
    );
  }

  return payload as T;
}

export type StripePaymentIntent = {
  id: string;
  client_secret: string | null;
  status: string;
  latest_charge: string | { id?: string } | null;
  metadata?: Record<string, string>;
};

type StripeCharge = {
  id: string;
  balance_transaction:
    | string
    | {
        id: string;
        fee: number;
        net: number;
      }
    | null;
};

export function sandboxProcessorFeeEstimate(amountCents: number) {
  const rateBps = Number(
    process.env.STRIPE_SANDBOX_PROCESSING_RATE_BPS || "290",
  );
  const fixedCents = Number(
    process.env.STRIPE_SANDBOX_PROCESSING_FIXED_CENTS || "30",
  );

  if (!Number.isFinite(rateBps) || !Number.isFinite(fixedCents)) {
    throw new Error("Invalid sandbox processing-fee configuration.");
  }

  return Math.max(
    0,
    Math.round((amountCents * rateBps) / 10000) + Math.round(fixedCents),
  );
}

export async function createSandboxDestinationPaymentIntent(input: {
  amountCents: number;
  currency: string;
  connectedAccountId: string;
  applicationFeeCents: number;
  reservationId: string;
  paymentId: string;
}) {
  const body = new URLSearchParams();
  body.set("amount", String(input.amountCents));
  body.set("currency", input.currency.toLowerCase());
  body.set("payment_method_types[0]", "card");
  body.set(
    "transfer_data[destination]",
    input.connectedAccountId,
  );
  body.set(
    "application_fee_amount",
    String(input.applicationFeeCents),
  );
  body.set("metadata[reservation_id]", input.reservationId);
  body.set("metadata[payment_id]", input.paymentId);
  body.set("description", "Find A Place sandbox booking");

  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        reservationId: input.reservationId,
        paymentId: input.paymentId,
        amountCents: input.amountCents,
        applicationFeeCents: input.applicationFeeCents,
        connectedAccountId: input.connectedAccountId,
      }),
    )
    .digest("hex");

  return stripeRequest<StripePaymentIntent>("/payment_intents", {
    method: "POST",
    body,
    idempotencyKey: `fap-sandbox-pi-${fingerprint}`,
  });
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  return stripeRequest<StripePaymentIntent>(
    `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
  );
}

export async function retrieveChargeWithBalanceTransaction(chargeId: string) {
  return stripeRequest<StripeCharge>(
    `/charges/${encodeURIComponent(chargeId)}?expand[]=balance_transaction`,
  );
}

export function chargeProcessorFee(charge: StripeCharge) {
  const balance = charge.balance_transaction;
  if (balance && typeof balance === "object") {
    return Math.max(0, Number(balance.fee || 0));
  }
  return 0;
}
