"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

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

function reportTurnstileClientEvent(event: "expired" | "error") {
  void fetch("/api/booking/security-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => {
    // If the browser is offline or the request itself is blocked, there is
    // nothing useful to surface to the guest here.
  });
}

export function TurnstileWidget({
  siteKey,
  resetSignal,
  onToken,
}: {
  siteKey: string;
  resetSignal: number;
  onToken: (token: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || !containerRef.current || !window.turnstile) return;

    onToken("");
    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action: "booking_hold",
      callback: onToken,
      "expired-callback": () => {
        onToken("");
        reportTurnstileClientEvent("expired");
      },
      "error-callback": () => {
        onToken("");
        reportTurnstileClientEvent("error");
      },
    });

    return () => {
      window.turnstile?.remove(widgetId);
    };
  }, [onToken, ready, resetSignal, siteKey]);

  return (
    <>
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <div ref={containerRef} aria-label="Booking security verification" />
    </>
  );
}
