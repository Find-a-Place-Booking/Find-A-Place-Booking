"use client";

import { useMemo, useState } from "react";
import {
  ConnectAccountManagement,
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
        ? "View or update the connected Stripe account's business details, public information and payout bank account. Stripe keeps sensitive account information on Stripe."
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
                  Open Stripe account
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
            {connectedAndReady
              ? "Manage your Stripe account"
              : entryMode === "existing"
                ? "Sign in with Stripe"
                : "Create your Stripe payment account"}
          </strong>

          <p>
            {connectedAndReady
              ? "Review or update supported business details, public information and payout bank information through Stripe's secure embedded account management."
              : entryMode === "existing"
                ? "Sign in with the Stripe login you already use. Stripe can reuse eligible business and verification details it already has, so you do not have to re-enter the same information. If Stripe has an outstanding requirement, it may still ask you to confirm or update it."
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
          onClick={async () => {
            if (connectedAndReady) {
              try {
                await refreshStripeStatus();
              } catch (error) {
                console.error(
                  "[stripe connect] status refresh failed",
                  error,
                );
              }
            }

            setShowOnboarding(false);
            setEntryMode(null);

            if (connectedAndReady) {
              window.location.reload();
            }
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
            {connectedAndReady ? (
              <ConnectAccountManagement />
            ) : (
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
            )}
          </ConnectComponentsProvider>
        ) : null}
      </div>
    </div>
  );
}
