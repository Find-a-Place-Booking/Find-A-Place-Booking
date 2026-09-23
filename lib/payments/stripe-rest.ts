import { createHash } from "node:crypto";

const STRIPE_V1_API = "https://api.stripe.com/v1";
const STRIPE_V2_API = "https://api.stripe.com/v2";

// Accounts v2 merchant configuration is currently served from the preview API.
const STRIPE_V2_VERSION = "2026-08-26.preview";

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
    profile?: {
      business_url?: string | null;
      doing_business_as?: string | null;
      product_description?: string | null;
    } | null;
    responsibilities?: {
      fees_collector?: string | null;
      losses_collector?: string | null;
      requirements_collector?: string | null;
    } | null;
  } | null;
  configuration?: {
    merchant?: {
      capabilities?: {
        card_payments?: {
          status?: string | null;
          status_details?: Array<{
            code?: string | null;
            resolution?: string | null;
          }> | null;
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

type MerchantBusinessProfileInput = {
  displayName: string;
  businessUrl?: string | null;
  productDescription: string;
};

function merchantProfile(input: MerchantBusinessProfileInput) {
  return {
    doing_business_as: input.displayName,
    product_description: input.productDescription,
    ...(input.businessUrl ? { business_url: input.businessUrl } : {}),
  };
}

function accountCreationIdempotencyKey(scope: string, body: unknown) {
  const fingerprint = createHash("sha256")
    .update(scope)
    .update("\n")
    .update(JSON.stringify(body))
    .digest("hex");

  return `fap-connect-account-${fingerprint}`;
}

export async function createEmbeddedMerchantAccount(input: {
  email: string;
  displayName: string;
  country?: string;
  requestScope: string;
  businessUrl?: string | null;
  productDescription: string;
}) {
  const country = (input.country || "US").toLowerCase();

  const body = {
    contact_email: input.email,
    display_name: input.displayName,
    dashboard: "full",
    identity: {
      country,
    },
    configuration: {
      merchant: {
        capabilities: {
          card_payments: {
            requested: true,
          },
        },
      },
    },
    defaults: {
      currency: "usd",
      profile: merchantProfile(input),
      responsibilities: {
        fees_collector: "stripe",
        losses_collector: "stripe",
      },
      locales: ["en-US"],
    },
    include: [
      "configuration.merchant",
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

export async function updateEmbeddedMerchantBusinessProfile(
  accountId: string,
  input: MerchantBusinessProfileInput,
) {
  return stripeV2Request<StripeAccountV2>(
    `/core/accounts/${encodeURIComponent(accountId)}`,
    {
      method: "POST",
      body: {
        display_name: input.displayName,
        defaults: {
          profile: merchantProfile(input),
        },
        include: [
          "configuration.merchant",
          "defaults",
          "identity",
          "requirements",
        ],
      },
    },
  );
}

export async function retrieveEmbeddedMerchantAccount(accountId: string) {
  const query = new URLSearchParams();
  query.append("include[0]", "configuration.merchant");
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
  body.set("components[notification_banner][enabled]", "true");
  body.set("components[account_management][enabled]", "true");

  // Keep Stripe authentication enabled. This allows Stripe's networked
  // onboarding to recognize an existing Stripe user/business and reuse
  // previously verified information instead of asking them to start over.
  body.set(
    "components[account_onboarding][features][disable_stripe_user_authentication]",
    "false",
  );

  // Stripe owns the merchant balance and normal bank payout timing. Find A
  // Place no longer forces a manual payout schedule on connected accounts.
  return stripeV1FormRequest<{ client_secret: string; expires_at: number }>(
    "/account_sessions",
    body,
  );
}
