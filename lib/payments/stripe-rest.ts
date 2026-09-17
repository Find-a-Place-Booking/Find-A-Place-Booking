import { createHash } from "node:crypto";

const STRIPE_V1_API = "https://api.stripe.com/v1";
const STRIPE_V2_API = "https://api.stripe.com/v2";

const STRIPE_V2_VERSION = "2025-12-15.clover";

function stripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  return key;
}

async function parseStripeResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();

  if (!raw) {
    throw new Error(`Stripe returned an empty response (HTTP ${response.status}).`);
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`Stripe returned a non-JSON response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        payload?.error?.code ||
        `Stripe request failed with HTTP ${response.status}.`,
    );
  }

  return payload as T;
}

async function stripeV2Request<T>(
  path: string,
  init: {
    method?: "GET" | "POST";
    body?: unknown;
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${stripeSecretKey()}`,
    "Stripe-Version": STRIPE_V2_VERSION,
  };

  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const response = await fetch(`${STRIPE_V2_API}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  return parseStripeResponse<T>(response);
}

async function stripeV1FormRequest<T>(path: string, body: URLSearchParams) {
  const response = await fetch(`${STRIPE_V1_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  return parseStripeResponse<T>(response);
}

export type StripeAccountV2 = {
  id: string;
  object: "v2.core.account";
  dashboard?: "none" | "express" | "full" | null;
  defaults?: {
    currency?: string | null;
    responsibilities?: {
      fees_collector?: string | null;
      losses_collector?: string | null;
      requirements_collector?: string | null;
    } | null;
  } | null;
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          stripe_transfers?: {
            status?: string | null;
            status_details?: Array<{ code?: string | null; resolution?: string | null }> | null;
          } | null;
          payouts?: {
            status?: string | null;
            status_details?: Array<{ code?: string | null; resolution?: string | null }> | null;
          } | null;
        } | null;
      } | null;
    } | null;
  } | null;
  requirements?: {
    entries?: Array<unknown> | null;
    summary?: {
      minimum_deadline?: {
        status?: string | null;
      } | null;
    } | null;
  } | null;
};

function accountCreationIdempotencyKey(scope: string, body: unknown) {
  // Stripe rejects an idempotency key when it is reused with different
  // parameters. Hashing BOTH the organization scope and exact request payload
  // means identical retries reuse the same key, while any payload change gets
  // a fresh key automatically.
  const fingerprint = createHash("sha256")
    .update(scope)
    .update("\n")
    .update(JSON.stringify(body))
    .digest("hex");

  return `fap-connect-account-${fingerprint}`;
}

export async function createEmbeddedRecipientAccount(input: {
  email: string;
  displayName: string;
  country?: string;
  requestScope: string;
}) {
  const country = (input.country || "US").toLowerCase();

  const body = {
    contact_email: input.email,
    display_name: input.displayName,
    dashboard: "none",
    identity: {
      country,
    },
    configuration: {
      recipient: {
        capabilities: {
          stripe_balance: {
            stripe_transfers: {
              requested: true,
            },
          },
        },
      },
    },
    defaults: {
      currency: "usd",
      responsibilities: {
        fees_collector: "application",
        losses_collector: "application",
      },
      locales: ["en-US"],
    },
    include: [
      "configuration.recipient",
      "defaults",
      "identity",
      "requirements",
    ],
  };

  return stripeV2Request<StripeAccountV2>("/core/accounts", {
    method: "POST",
    idempotencyKey: accountCreationIdempotencyKey(input.requestScope, body),
    body,
  });
}

export async function retrieveEmbeddedRecipientAccount(accountId: string) {
  const query = new URLSearchParams();
  query.append("include[0]", "configuration.recipient");
  query.append("include[1]", "defaults");
  query.append("include[2]", "identity");
  query.append("include[3]", "requirements");

  return stripeV2Request<StripeAccountV2>(
    `/core/accounts/${encodeURIComponent(accountId)}?${query.toString()}`,
  );
}

export async function createAccountSession(accountId: string) {
  const body = new URLSearchParams();
  body.set("account", accountId);
  body.set("components[account_onboarding][enabled]", "true");

  return stripeV1FormRequest<{ client_secret: string; expires_at: number }>(
    "/account_sessions",
    body,
  );
}
