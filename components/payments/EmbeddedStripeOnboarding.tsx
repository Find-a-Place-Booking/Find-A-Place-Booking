"use client";

import { useState } from "react";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import { loadConnectAndInitialize } from "@stripe/connect-js/pure";

import styles from "./EmbeddedStripeOnboarding.module.css";

type Props = {
  organizationId: string;
  publishableKey: string;
};

type AccountSessionResponse = {
  clientSecret?: string;
  paymentAccountId?: string;
  error?: string;
};

async function readJsonResponse(response: Response): Promise<AccountSessionResponse> {
  const raw = await response.text();

  if (!raw) {
    throw new Error(
      `Find A Place received an empty response while starting Stripe onboarding (HTTP ${response.status}).`,
    );
  }

  try {
    return JSON.parse(raw) as AccountSessionResponse;
  } catch {
    throw new Error(
      `Find A Place received an invalid response while starting Stripe onboarding (HTTP ${response.status}).`,
    );
  }
}

export function EmbeddedStripeOnboarding({
  organizationId,
  publishableKey,
}: Props) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [stripeConnectInstance, setStripeConnectInstance] = useState<
    ReturnType<typeof loadConnectAndInitialize> | null
  >(null);

  async function fetchClientSecret() {
    const endpoint = new URL(
      "/api/stripe/connect/account-session",
      window.location.origin,
    );

    const response = await fetch(endpoint.toString(), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ organizationId }),
    });

    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        payload.error || `Unable to start Stripe onboarding (HTTP ${response.status}).`,
      );
    }

    if (!payload.clientSecret) {
      throw new Error(
        payload.error || "Stripe onboarding did not return a client secret.",
      );
    }

    return payload.clientSecret;
  }

  async function refreshStripeStatus() {
    const endpoint = new URL("/api/stripe/connect/sync", window.location.origin);
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ organizationId }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || "Unable to refresh Stripe account status.");
    }
    return payload;
  }

  function openStripeOnboarding() {
    if (!stripeConnectInstance) {
      const instance = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret,
        appearance: { overlays: "dialog" },
      });
      setStripeConnectInstance(instance);
    }
    setShowOnboarding(true);
  }

  if (!showOnboarding) {
    return (
      <button
        className="button button-small"
        type="button"
        onClick={openStripeOnboarding}
      >
        Connect Stripe
      </button>
    );
  }

  return (
    <div className={`${styles.shell} stripe-embedded-onboarding`}>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>Stripe Connect</span>
          <strong>Set up your payment account</strong>
          <p>
            Complete Stripe&apos;s secure setup below. Guest booking charges will
            be created directly on your connected Stripe account. Find A Place
            never stores your raw bank or identity information.
          </p>
        </div>

        <button
          className={styles.close}
          type="button"
          onClick={() => setShowOnboarding(false)}
        >
          Close setup
        </button>
      </div>

      <div className={styles.componentFrame}>
        {stripeConnectInstance ? (
          <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
            <ConnectAccountOnboarding
              onExit={async () => {
                try {
                  await refreshStripeStatus();
                } catch (error) {
                  console.error("[stripe connect] status refresh failed", error);
                }
                window.location.reload();
              }}
            />
          </ConnectComponentsProvider>
        ) : null}
      </div>
    </div>
  );
}
