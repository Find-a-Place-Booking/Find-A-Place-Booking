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
        payload.error ||
          `Unable to start Stripe onboarding (HTTP ${response.status}).`,
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
    try {
      const endpoint = new URL(
        "/api/stripe/connect/sync",
        window.location.origin,
      );

      await fetch(endpoint.toString(), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ organizationId }),
      });
    } catch (error) {
      // Do not trap the host in onboarding just because the local status refresh
      // failed. The webhook will remain the long-term source of truth.
      console.error("[stripe connect] status refresh failed", error);
    }
  }

  function openStripeOnboarding() {
    if (!stripeConnectInstance) {
      const instance = loadConnectAndInitialize({
        publishableKey,
        fetchClientSecret,
        appearance: {
          overlays: "dialog",
        },
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
          <strong>Set up your payout account</strong>
          <p>
            Complete the secure Stripe steps below. Your bank and identity
            details go directly to Stripe and are not stored by Find A Place.
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
                await refreshStripeStatus();
                window.location.reload();
              }}
            />
          </ConnectComponentsProvider>
        ) : null}
      </div>
    </div>
  );
}
