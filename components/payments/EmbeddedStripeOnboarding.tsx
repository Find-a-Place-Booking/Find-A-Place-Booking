"use client";

import { useMemo, useState } from "react";
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from "@stripe/react-connect-js";
import { loadConnectAndInitialize } from "@stripe/connect-js/pure";

import { StripeConnectGuide } from "./StripeConnectGuide";
import styles from "./EmbeddedStripeOnboarding.module.css";

type Props = {
  organizationId: string;
  publishableKey: string;
  connectedAndReady?: boolean;
};

type EntryMode = "existing" | "new";

type AccountSessionResponse = {
  clientSecret?: string;
  paymentAccountId?: string;
  error?: string;
};

async function readJsonResponse(
  response: Response,
): Promise<AccountSessionResponse> {
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
  connectedAndReady = false,
}: Props) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [entryMode, setEntryMode] = useState<EntryMode | null>(null);
  const [managerOpen, setManagerOpen] = useState(!connectedAndReady);
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
        payload.error ||
          "Stripe onboarding did not return a client secret.",
      );
    }

    return payload.clientSecret;
  }

  async function refreshStripeStatus() {
    const endpoint = new URL(
      "/api/stripe/connect/sync",
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

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        payload?.error ||
          "Unable to refresh Stripe account status.",
      );
    }

    return payload;
  }

  function openStripeOnboarding(mode: EntryMode) {
    setEntryMode(mode);

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

  const managerDescription = useMemo(
    () =>
      connectedAndReady
        ? "Review Stripe onboarding details, refresh any new Stripe requirements, or reconnect if the host changes Stripe accounts."
        : "Find A Place needs a Stripe Connect relationship for host booking payments. If you already use Stripe, use your normal Stripe login and Stripe may reuse eligible verified business information. Your unrelated Stripe activity stays separate.",
    [connectedAndReady],
  );

  if (!showOnboarding) {
    if (connectedAndReady) {
      return (
        <div className={styles.readyManager}>
          {!managerOpen ? (
            <button
              className={styles.manageToggle}
              type="button"
              onClick={() => setManagerOpen(true)}
              aria-expanded="false"
            >
              <span>Manage Stripe</span>
              <span aria-hidden="true">⌄</span>
            </button>
          ) : (
            <div className={styles.readyExpanded}>
              <span>{managerDescription}</span>

              <div className={styles.readyActions}>
                <button
                  className="button button-small"
                  type="button"
                  onClick={() => openStripeOnboarding("existing")}
                >
                  Open Stripe
                </button>

                <button
                  className={styles.collapseButton}
                  type="button"
                  onClick={() => setManagerOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className={styles.entryShell}>
        <div className={styles.entryChoices}>
          <button
            className="button button-small"
            type="button"
            onClick={() => openStripeOnboarding("existing")}
          >
            Use my existing Stripe login
          </button>

          <button
            className="button button-small button-quiet"
            type="button"
            onClick={() => openStripeOnboarding("new")}
          >
            I&apos;m new to Stripe
          </button>

          <small className={styles.entryHelp}>{managerDescription}</small>
        </div>

        <StripeConnectGuide />
      </div>
    );
  }

  return (
    <div className={`${styles.shell} stripe-embedded-onboarding`}>
      <div className={styles.heading}>
        <div>
          <span className={styles.kicker}>Stripe Connect</span>

          <strong>
            {entryMode === "existing"
              ? connectedAndReady
                ? "Review or refresh your Stripe connection"
                : "Sign in with Stripe"
              : "Create your Stripe payment account"}
          </strong>

          <p>
            {entryMode === "existing"
              ? connectedAndReady
                ? "Open Stripe's secure onboarding flow to review the current connection, satisfy any new Stripe requirements, or sign in with another Stripe account if you need to replace the connected account."
                : "Sign in with the Stripe login you already use. Stripe can reuse eligible business and verification details it already has, so you do not have to re-enter the same information. If Stripe has an outstanding requirement, it may still ask you to confirm or update it."
              : "Create your Stripe account and complete Stripe's secure onboarding below. Guest booking charges will be created directly on your connected Stripe account."}
          </p>

          <p>
            Find A Place never stores your raw bank-account details,
            identity documents or Stripe password.
          </p>
        </div>

        <button
          className={styles.close}
          type="button"
          onClick={() => {
            setShowOnboarding(false);
            setEntryMode(null);
          }}
        >
          Back
        </button>
      </div>

      <div className={styles.componentFrame}>
        {stripeConnectInstance ? (
          <ConnectComponentsProvider
            connectInstance={stripeConnectInstance}
          >
            <ConnectAccountOnboarding
              onExit={async () => {
                try {
                  await refreshStripeStatus();
                } catch (error) {
                  console.error(
                    "[stripe connect] status refresh failed",
                    error,
                  );
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
