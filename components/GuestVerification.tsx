"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Stripe } from "@stripe/stripe-js";

import styles from "./GuestVerification.module.css";

type Props = {
  reservationId: string;
  checkoutToken: string;
  guestEmail: string;
  stripePromise: PromiseLike<Stripe | null>;
  testMode: boolean;
  onVerified: () => void | Promise<void>;
};

type VerificationStatus = {
  ready: boolean;
  phonePresent: boolean;
  emailVerified: boolean;
  emailVerificationSent: boolean;
  maskedEmail: string;
  identityRequired: boolean;
  identityVerified: boolean;
  identityStatus: string;
  message?: string | null;
};

function friendlyIdentityStatus(status: string) {
  if (status === "VERIFIED") return "Verified";
  if (status === "PROCESSING") return "Processing";
  if (status === "REQUIRES_INPUT") return "Needs your attention";
  if (status === "CANCELED") return "Canceled";
  return "Not started";
}

export function GuestVerification({
  reservationId,
  checkoutToken,
  guestEmail,
  stripePromise,
  testMode,
  onVerified,
}: Props) {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testCode, setTestCode] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const completedRef = useRef(false);

  const complete = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    await onVerified();
  }, [onVerified]);

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/booking/verification/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, checkoutToken }),
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Unable to load verification status.");
    }

    const next = payload as VerificationStatus;
    setStatus(next);

    if (next.ready) {
      await complete();
    }

    return next;
  }, [checkoutToken, complete, reservationId]);

  const sendEmailCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/booking/verification/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, checkoutToken }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to send the verification code.");
      }

      if (payload.verified) {
        setMessage("Email already verified.");
        await loadStatus();
        return;
      }

      setStatus((current) =>
        current
          ? {
              ...current,
              emailVerificationSent: true,
              maskedEmail: payload.maskedEmail || current.maskedEmail,
            }
          : current,
      );
      setTestCode(payload.testCode || null);
      setMessage(
        `We sent a six-digit code to ${payload.maskedEmail || guestEmail}.`,
      );
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send the verification code.",
      );
    } finally {
      setBusy(false);
    }
  }, [checkoutToken, guestEmail, loadStatus, reservationId]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const current = await loadStatus();
        if (
          !current.ready &&
          !current.emailVerified &&
          !current.emailVerificationSent
        ) {
          await sendEmailCode();
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to start guest verification.",
        );
      } finally {
        setBusy(false);
      }
    })();
  }, [loadStatus, sendEmailCode]);

  async function confirmEmail() {
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the six-digit code from your email.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/booking/verification/email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId,
          checkoutToken,
          code: code.trim(),
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.verified) {
        throw new Error(payload.error || "Email verification failed.");
      }

      setCode("");
      setTestCode(null);
      const current = await loadStatus();
      setMessage(
        current.identityRequired
          ? "Email verified. Next, verify your identity."
          : "Email verified. Continuing to the booking policies…",
      );
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Email verification failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function pollIdentity() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = await loadStatus();
      if (current.ready) return;
      if (current.identityStatus === "REQUIRES_INPUT") return;
      if (current.identityStatus === "CANCELED") return;
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }

    setMessage(
      "Stripe is still processing the identity check. You can leave this page open and check again in a moment.",
    );
  }

  async function verifyIdentity() {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(
        "/api/booking/verification/identity/session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId, checkoutToken }),
        },
      );
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to start identity verification.");
      }

      if (payload.verified) {
        await loadStatus();
        return;
      }

      if (payload.processing) {
        setMessage("Stripe is processing your identity verification…");
        await pollIdentity();
        return;
      }

      if (!payload.clientSecret) {
        throw new Error("Stripe Identity session is unavailable.");
      }

      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Stripe Identity is still loading. Try again in a moment.");
      }

      const result = await stripe.verifyIdentity(payload.clientSecret);
      if (result.error) {
        throw new Error(
          result.error.message || "Stripe could not complete identity verification.",
        );
      }

      setMessage("Identity submitted. Checking verification…");
      await pollIdentity();
    } catch (identityError) {
      setError(
        identityError instanceof Error
          ? identityError.message
          : "Identity verification failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return (
      <div className={styles.card}>
        <strong>Preparing email verification…</strong>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow dark">Guest verification</p>
          <h2>
            {status.identityRequired
              ? "Verify before payment"
              : "Verify your email before payment"}
          </h2>
        </div>
        <span className={styles.secure}>Secure</span>
      </div>

      <p className={styles.intro}>
        {status.identityRequired
          ? "A phone number is required for the reservation. We verify your email first, then your identity, before payment."
          : "A phone number is required for the reservation. We send a one-time code to your email so booking confirmations and important reservation updates go to the right person."}
      </p>

      <div className={styles.stepPanel}>
        <div className={styles.stepRow}>
          <span className={styles.stepNumber}>1</span>
          <div className={styles.stepCopy}>
            <strong>Email verification</strong>
            <span>
              {status.emailVerified
                ? `${status.maskedEmail || guestEmail} has been verified.`
                : `Enter the six-digit code sent to ${status.maskedEmail || guestEmail}.`}
            </span>
          </div>
        </div>

        {status.emailVerified ? (
          <span className={styles.donePill}>Verified</span>
        ) : null}

        {!status.emailVerified ? (
          <div className={styles.actionBox}>
            <label>
              <span>Email verification code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="123456"
              />
            </label>

                        {testMode && testCode ? (
              <small className={styles.testCode}>
                Test mode code: <strong>{testCode}</strong>
              </small>
            ) : null}

            <p className={styles.helperText}>
              Didn&apos;t get it yet? You can request another code and we&apos;ll
              resend it to the same email address.
            </p>

            <div className={styles.actions}>
              <button
                className="button button-small"
                type="button"
                disabled={busy || code.length !== 6}
                onClick={confirmEmail}
              >
                {busy ? "Checking…" : "Verify email"}
              </button>
              <button
                className="button button-small button-quiet"
                type="button"
                disabled={busy}
                onClick={sendEmailCode}
              >
                Send another code
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {status.identityRequired && !status.identityVerified ? (
        <div className={styles.identityPanel}>
          <strong>Identity verification</strong>
          <p>
            Status: {friendlyIdentityStatus(status.identityStatus)}. Stripe
            Identity will ask for a government-issued photo ID and a matching
            selfie. Find A Place stores the verification result, not a copy of
            your ID.
          </p>
          <div className={styles.identityActions}>
            <button
              className="button"
              type="button"
              disabled={busy || status.identityStatus === "PROCESSING"}
              onClick={verifyIdentity}
            >
              {status.identityStatus === "PROCESSING"
                ? "Identity verification processing…"
                : busy
                  ? "Opening verification…"
                  : status.identityStatus === "REQUIRES_INPUT"
                    ? "Continue identity verification"
                    : "Verify identity"}
            </button>
            {status.identityStatus === "PROCESSING" ? (
              <button
                className="button button-quiet"
                type="button"
                disabled={busy}
                onClick={() => void pollIdentity()}
              >
                Check status
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {status.emailVerified && !status.identityRequired ? (
        <div className={styles.ready}>
          <strong>Email verified</strong>
          <span>Loading booking policies…</span>
        </div>
      ) : null}

      {message ? <div className={styles.message}>{message}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
    </div>
  );
}
