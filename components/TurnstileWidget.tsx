"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";

import styles from "./TurnstileWidget.module.css";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          action: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

type SecurityState =
  | "loading"
  | "ready"
  | "verified"
  | "expired"
  | "error";

function reportTurnstileClientEvent(event: "expired" | "error") {
  void fetch("/api/booking/security-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => {
    // Nothing useful to surface if the browser is offline.
  });
}

export function TurnstileWidget({
  siteKey,
  resetSignal,
  onToken,
  analyticsSlug,
  analyticsMode,
}: {
  siteKey: string;
  resetSignal: number;
  onToken: (token: string) => void;
  analyticsSlug?: string;
  analyticsMode?: "test" | "live";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const [securityState, setSecurityState] =
    useState<SecurityState>("loading");

  useEffect(() => {
    if (ready || window.turnstile) return;

    const timeout = window.setTimeout(() => {
      if (!window.turnstile) setSecurityState("error");
    }, 8000);

    return () => window.clearTimeout(timeout);
  }, [ready, renderAttempt]);

  useEffect(() => {
    if (!ready || !containerRef.current || !window.turnstile) return;

    setSecurityState("ready");
    onToken("");

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action: "booking_hold",
      callback: (token) => {
        setSecurityState("verified");
        onToken(token);
      },
      "expired-callback": () => {
        setSecurityState("expired");
        onToken("");
        reportTurnstileClientEvent("expired");
        track("checkout_turnstile_expired", {
          stay: analyticsSlug || "unknown",
          mode: analyticsMode || "live",
        });
      },
      "error-callback": () => {
        setSecurityState("error");
        onToken("");
        reportTurnstileClientEvent("error");
        track("checkout_turnstile_error", {
          stay: analyticsSlug || "unknown",
          mode: analyticsMode || "live",
        });
      },
    });

    return () => {
      window.turnstile?.remove(widgetId);
    };
  }, [
    analyticsMode,
    analyticsSlug,
    onToken,
    ready,
    renderAttempt,
    resetSignal,
    siteKey,
  ]);

  function retry() {
    onToken("");
    setSecurityState("loading");

    if (window.turnstile) {
      setReady(false);
      window.setTimeout(() => {
        setRenderAttempt((value) => value + 1);
        setReady(true);
      }, 50);
      return;
    }

    setRenderAttempt((value) => value + 1);
    setSecurityState("error");
  }

  const message =
    securityState === "verified"
      ? "Security check complete."
      : securityState === "expired"
        ? "The security check expired. Complete it again before continuing."
        : securityState === "error"
          ? "The security check could not load. Retry it, or temporarily disable a privacy blocker and try again."
          : securityState === "ready"
            ? "Complete the security check to continue."
            : "Loading the security check…";

  return (
    <div className={styles.wrap}>
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => {
          setReady(true);
          setSecurityState("ready");
        }}
        onError={() => setSecurityState("error")}
      />

      <div
        ref={containerRef}
        aria-label="Booking security verification"
      />

      <div
        className={`${styles.status} ${styles[securityState]}`}
        aria-live="polite"
      >
        <span>{message}</span>

        {securityState === "error" ? (
          <button type="button" onClick={retry}>
            Retry security check
          </button>
        ) : null}
      </div>
    </div>
  );
}
