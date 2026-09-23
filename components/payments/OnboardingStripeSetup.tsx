"use client";

import { useCallback, useEffect, useState } from "react";

import { EmbeddedStripeOnboarding } from "./EmbeddedStripeOnboarding";

type Props = {
  organizationId: string;
  onReadyChange?: (ready: boolean) => void;
};

type SyncResponse = {
  status?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  error?: string;
};

export function OnboardingStripeSetup({
  organizationId,
  onReadyChange,
}: Props) {
  const publishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState(
    "Checking your Stripe connection…",
  );

  const check = useCallback(async () => {
    if (!publishableKey) {
      setChecking(false);
      setReady(false);
      onReadyChange?.(false);
      setMessage(
        "Stripe setup is temporarily unavailable because the publishable key is not configured.",
      );
      return;
    }

    setChecking(true);

    try {
      const response = await fetch("/api/stripe/connect/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ organizationId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | SyncResponse
        | null;

      if (response.status === 404) {
        setReady(false);
        onReadyChange?.(false);
        setMessage(
          "No Stripe account is connected yet. Choose one of the options below to finish it here.",
        );
        return;
      }

      if (!response.ok) {
        throw new Error(
          payload?.error || "Unable to check Stripe connection status.",
        );
      }

      const nextReady =
        payload?.status === "READY" &&
        Boolean(payload?.chargesEnabled) &&
        Boolean(payload?.payoutsEnabled);

      setReady(nextReady);
      onReadyChange?.(nextReady);
      setMessage(
        nextReady
          ? "Stripe is connected and ready for guest payments. Nothing else is required in Payments & taxes after onboarding."
          : "Stripe has been started but still needs information before guest payments can be accepted.",
      );
    } catch (error) {
      setReady(false);
      onReadyChange?.(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to check Stripe connection status.",
      );
    } finally {
      setChecking(false);
    }
  }, [organizationId, onReadyChange, publishableKey]);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <div className="onboarding-stripe-setup">
      <div
        className={`inline-note ${
          ready ? "onboarding-stripe-ready" : ""
        }`}
      >
        <strong>
          {checking
            ? "Checking Stripe"
            : ready
              ? "Stripe is ready"
              : "Complete Stripe before finishing setup"}
        </strong>
        <span>{message}</span>
      </div>

      {!checking && publishableKey ? (
        <EmbeddedStripeOnboarding
          organizationId={organizationId}
          publishableKey={publishableKey}
          connectedAndReady={ready}
        />
      ) : null}
    </div>
  );
}
