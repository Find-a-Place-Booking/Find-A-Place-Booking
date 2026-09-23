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
  const [entryMode, setEntryMode] = useState<EntryMode>("existing");
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
      throw new Error(payload?.error || "Unable to refresh Stripe account status.");
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
        : "Find A Place uses Stripe Connect so guest booking payments can go directly to your host payment account. Use the Stripe login you already have, or create a new Stripe account during setup.",
    [connectedAndReady],
  );

  const selectedTitle =
    entryMode === "existing"
      ? "Already have Stripe? You're not starting over."
      : "New to Stripe? We'll walk you through it.";

  const selectedDescription =
    entryMode === "existing"
      ? "Sign in with your normal Stripe login. Stripe can often reuse business and identity details it already has, though it may still ask you to confirm a few items for this connection."
      : "Create your Stripe account during setup. Stripe will collect the payment details and verification items needed so Find A Place can send your guest booking money straight to your connected host account.";

  const selectedBullets =
    entryMode === "existing"
      ? [
          "Best if you already use Stripe for another business or property.",
          "Your unrelated Stripe activity stays separate from Find A Place.",
          "You may only need to confirm a few details instead of starting from scratch.",
        ]
      : [
          "Best if this is your first Stripe account.",
          "Stripe will guide you through business, identity and payout setup.",
          "You can finish everything without leaving host onboarding.",
        ];

  if (!showOnboarding) {
    if (connectedAndReady) {
      return (
        <div className={styles.readyManager}>
          <div className={styles.readyPanel}>
            <div className={styles.readyCopy}>
              <span className={styles.kicker}>Stripe Connect</span>
              <h3>Manage your Stripe connection</h3>
              <p>{managerDescription}</p>
            </div>

            <div className={styles.readyActions}>
              <button
                className="button button-small"
                type="button"
                onClick={() => openStripeOnboarding("existing")}
              >
                Open Stripe account
              </button>
              {managerOpen ? (
                <button
                  className={styles.collapseButton}
                  type="button"
                  onClick={() => setManagerOpen(false)}
                >
                  Hide details
                </button>
              ) : (
                <button
                  className={styles.collapseButton}
                  type="button"
                  onClick={() => setManagerOpen(true)}
                >
                  Show details
                </button>
              )}
            </div>
          </div>

          {managerOpen ? (
            <div className={styles.readyMeta}>
              <div>
                <strong>What you can manage</strong>
                <p>
                  Business details, public profile details, payout bank information,
                  and any Stripe requirements tied to the connected account.
                </p>
              </div>
              <div>
                <strong>Good to know</strong>
                <p>
                  Find A Place never stores your raw bank-account details,
                  identity documents or Stripe password.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className={styles.entryShell}>
        <div className={styles.entryHeader}>
          <div>
            <span className={styles.kicker}>Stripe Connect</span>
            <h3>Connect how you want to use Stripe</h3>
            <p>{managerDescription}</p>
          </div>
          <span className={styles.recommendedBadge}>Recommended</span>
        </div>

        <div className={styles.toggleRow}>
          <button
            className={`${styles.modeButton} ${entryMode === "existing" ? styles.modeButtonActive : ""}`}
            type="button"
            onClick={() => setEntryMode("existing")}
            aria-pressed={entryMode === "existing"}
          >
            Use my existing Stripe login
          </button>
          <button
            className={`${styles.modeButton} ${entryMode === "new" ? styles.modeButtonActive : ""}`}
            type="button"
            onClick={() => setEntryMode("new")}
            aria-pressed={entryMode === "new"}
          >
            I&apos;m new to Stripe
          </button>
        </div>

        <div className={styles.featureGrid}>
          <aside className={styles.sideNote}>
            <strong>
              {entryMode === "existing"
                ? "Existing Stripe login"
                : "New Stripe setup"}
            </strong>
            <p>
              {entryMode === "existing"
                ? "Sign in with Stripe and let Stripe reuse eligible information where possible."
                : "Create your Stripe account inside the Find A Place host flow."}
            </p>
          </aside>

          <div className={styles.mainCard}>
            <div className={styles.mainCardHead}>
              <div>
                <h4>{selectedTitle}</h4>
                <p>{selectedDescription}</p>
              </div>
              <button
                className="button button-small"
                type="button"
                onClick={() => openStripeOnboarding(entryMode)}
              >
                {entryMode === "existing"
                  ? "Continue with Stripe"
                  : "Create Stripe account"}
              </button>
            </div>

            <ul className={styles.bulletList}>
              {selectedBullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        </div>

        <details className={styles.guideCard}>
          <summary>
            <span>How Stripe setup works</span>
            <span className={styles.guideSummaryText}>View the step-by-step guide</span>
          </summary>
          <div className={styles.guideBody}>
            <StripeConnectGuide />
          </div>
        </details>
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
            Find A Place never stores your raw bank-account details, identity
            documents or Stripe password.
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
                console.error("[stripe connect] status refresh failed", error);
              }
            }

            setShowOnboarding(false);

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
          <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
            {connectedAndReady ? (
              <ConnectAccountManagement />
            ) : (
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
            )}
          </ConnectComponentsProvider>
        ) : null}
      </div>
    </div>
  );
}
