import { createHmac, timingSafeEqual } from "node:crypto";

const STRIPE_API = "https://api.stripe.com/v1";

export type StripeConnectedAccount = {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted?: boolean;
  country?: string;
  default_currency?: string;
  requirements?: {
    currently_due?: string[];
    eventually_due?: string[];
    past_due?: string[];
    disabled_reason?: string | null;
  };
};

type StripeAccountLink = {
  object: "account_link";
  created: number;
  expires_at: number;
  url: string;
};

type StripeCheckoutSession = {
  id: string;
  object: "checkout.session";
  url: string | null;
  payment_intent: string | null;
  payment_status: string;
};

type StripeRefund = {
  id: string;
  status: string | null;
};

type StripeEvent = {
  id: string;
  type: string;
  account?: string;
  data: {
    object: Record<string, unknown>;
  };
};

function secretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return key;
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

  if (init.body) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const response = await fetch(`${STRIPE_API}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
    cache: "no-store",
  });

  const payload = (await response.json()) as
    | T
    | { error?: { message?: string; code?: string; type?: string } };

  if (!response.ok) {
    const stripeError = "error" in (payload as object)
      ? (payload as { error?: { message?: string; code?: string; type?: string } }).error
      : undefined;
    throw new Error(
      stripeError?.message ||
        `Stripe request failed with HTTP ${response.status}.`,
    );
  }

  return payload as T;
}

export async function createExpressConnectedAccount(
  email?: string | null,
): Promise<StripeConnectedAccount> {
  const body = new URLSearchParams();
  body.set("type", "express");
  body.set("country", "US");
  body.set("capabilities[card_payments][requested]", "true");
  body.set("capabilities[transfers][requested]", "true");
  if (email) body.set("email", email);

  return stripeRequest<StripeConnectedAccount>("/accounts", {
    method: "POST",
    body,
  });
}

export async function retrieveConnectedAccount(
  accountId: string,
): Promise<StripeConnectedAccount> {
  return stripeRequest<StripeConnectedAccount>(`/accounts/${encodeURIComponent(accountId)}`);
}

export async function createConnectedAccountLink(input: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<StripeAccountLink> {
  const body = new URLSearchParams();
  body.set("account", input.accountId);
  body.set("refresh_url", input.refreshUrl);
  body.set("return_url", input.returnUrl);
  body.set("type", "account_onboarding");

  return stripeRequest<StripeAccountLink>("/account_links", {
    method: "POST",
    body,
  });
}

export async function createDestinationCheckoutSession(input: {
  connectedAccountId: string;
  reservationId: string;
  paymentId?: string | null;
  amountCents: number;
  applicationFeeCents: number;
  currency: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}) {
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("success_url", input.successUrl);
  body.set("cancel_url", input.cancelUrl);
  body.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
  body.set(
    "line_items[0][price_data][product_data][name]",
    "Find A Place booking",
  );
  body.set(
    "line_items[0][price_data][unit_amount]",
    String(input.amountCents),
  );
  body.set("line_items[0][quantity]", "1");
  body.set(
    "payment_intent_data[application_fee_amount]",
    String(input.applicationFeeCents),
  );
  body.set(
    "payment_intent_data[transfer_data][destination]",
    input.connectedAccountId,
  );
  body.set("metadata[reservation_id]", input.reservationId);
  body.set(
    "payment_intent_data[metadata][reservation_id]",
    input.reservationId,
  );

  if (input.paymentId) {
    body.set("metadata[payment_id]", input.paymentId);
    body.set("payment_intent_data[metadata][payment_id]", input.paymentId);
  }
  if (input.customerEmail) {
    body.set("customer_email", input.customerEmail);
  }

  return stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
    method: "POST",
    body,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function createStripeRefund(input: {
  paymentIntentId: string;
  amountCents: number;
  refundApplicationFee: boolean;
  reverseTransfer: boolean;
  idempotencyKey: string;
}) {
  const body = new URLSearchParams();
  body.set("payment_intent", input.paymentIntentId);
  body.set("amount", String(input.amountCents));
  body.set("refund_application_fee", input.refundApplicationFee ? "true" : "false");
  body.set("reverse_transfer", input.reverseTransfer ? "true" : "false");

  return stripeRequest<StripeRefund>("/refunds", {
    method: "POST",
    body,
    idempotencyKey: input.idempotencyKey,
  });
}

function parseStripeSignature(header: string) {
  const parts = header.split(",");
  const timestamp = parts
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  return { timestamp, signatures };
}

export function verifyStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  toleranceSeconds = 300,
): StripeEvent {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  if (!signatureHeader) throw new Error("Missing Stripe-Signature header.");

  const { timestamp, signatures } = parseStripeSignature(signatureHeader);
  if (!timestamp || !signatures.length) {
    throw new Error("Invalid Stripe-Signature header.");
  }

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) {
    throw new Error("Invalid Stripe webhook timestamp.");
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestampNumber);
  if (age > toleranceSeconds) {
    throw new Error("Stripe webhook timestamp is outside the allowed tolerance.");
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const valid = signatures.some((signature) => {
    try {
      const candidate = Buffer.from(signature, "hex");
      return (
        candidate.length === expectedBuffer.length &&
        timingSafeEqual(candidate, expectedBuffer)
      );
    } catch {
      return false;
    }
  });

  if (!valid) throw new Error("Stripe webhook signature verification failed.");
  return JSON.parse(rawBody) as StripeEvent;
}
