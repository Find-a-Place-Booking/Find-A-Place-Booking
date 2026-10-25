"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type AuthAction = "host_signup" | "host_login" | "admin_login" | "password_reset";
type TurnstileApi = {
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

function getTurnstile(): TurnstileApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

export function AuthCaptcha({ action }: { action: AuthAction }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "verified" | "expired" | "error">("loading");

  useEffect(() => {
    const turnstile = getTurnstile();
    if (!loaded || !siteKey || !turnstile || !containerRef.current) return;

    setToken("");
    setStatus("ready");
    const widgetId = turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      callback: (value) => {
        setToken(value);
        setStatus("verified");
      },
      "expired-callback": () => {
        setToken("");
        setStatus("expired");
      },
      "error-callback": () => {
        setToken("");
        setStatus("error");
      },
    });

    return () => {
      try { turnstile.remove(widgetId); } catch { /* Widget may already be gone. */ }
      setToken("");
    };
  }, [action, loaded, siteKey]);

  const message = !siteKey
    ? "Security verification is temporarily unavailable. Please contact Find A Place support."
    : status === "verified"
      ? "Security check complete."
      : status === "error"
        ? "Security check failed to load. Refresh the page and try again."
        : status === "expired"
          ? "Security check expired. Complete it again before continuing."
          : "Complete the security check before continuing.";

  return (
    <div className="auth-form-note" aria-label="Account security verification">
      <input type="hidden" name="captcha_token" value={token} />
      {siteKey ? (
        <>
          <Script
            id="fap-auth-turnstile-script"
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            strategy="afterInteractive"
            onReady={() => setLoaded(true)}
            onError={() => setStatus("error")}
          />
          <div ref={containerRef} />
        </>
      ) : null}
      <small role="status" aria-live="polite">{message}</small>
    </div>
  );
}
