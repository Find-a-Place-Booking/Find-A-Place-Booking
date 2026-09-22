"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./GuestPolicyAcceptance.module.css";

type PolicyStatus = {
  ready: boolean;
  propertyOpened: boolean;
  platformOpened: boolean;
  accepted: boolean;
  propertyPolicies: {
    checkIn: string | null;
    checkout: string | null;
    cancellationPolicy: string | null;
    customPolicies: string | null;
    policies: string[];
  };
  propertyDocument: {
    id: string;
    version: number | null;
    originalName: string | null;
    url: string | null;
  } | null;
  platform: {
    termsVersion: string;
    cancellationPolicyVersion: string;
    privacyVersion: string;
    termsUrl: string;
    cancellationUrl: string;
    privacyUrl: string;
  };
};

export function GuestPolicyAcceptance({
  reservationId,
  checkoutToken,
  onAccepted,
}: {
  reservationId: string;
  checkoutToken: string;
  onAccepted: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<PolicyStatus | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completedRef = useRef(false);

  const complete = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    await onAccepted();
  }, [onAccepted]);

  const load = useCallback(async () => {
    const response = await fetch("/api/booking/policies/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, checkoutToken }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Unable to load booking policies.");
    }
    const next = payload as PolicyStatus;
    setStatus(next);
    if (next.ready) await complete();
    return next;
  }, [checkoutToken, complete, reservationId]);

  useEffect(() => {
    void load().catch((loadError) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load booking policies.",
      );
    });
  }, [load]);

  async function markOpened(kind: "property" | "platform") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/booking/policies/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, checkoutToken, kind }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to record policy review.");
      }
      await load();
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Unable to record policy review.",
      );
      throw openError;
    } finally {
      setBusy(false);
    }
  }

  async function openPropertyPolicies() {
    const target = status?.propertyDocument?.url || null;
    const popup = target ? window.open("about:blank", "_blank") : null;
    if (popup) popup.opener = null;

    try {
      await markOpened("property");
      if (target && popup) popup.location.href = target;
      else if (target) window.open(target, "_blank", "noopener,noreferrer");
    } catch {
      popup?.close();
    }
  }

  async function openPlatformTerms() {
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;

    try {
      await markOpened("platform");
      if (popup) popup.location.href = "/terms";
      else window.open("/terms", "_blank", "noopener,noreferrer");
    } catch {
      popup?.close();
    }
  }

  async function accept() {
    if (!agreed || !status?.propertyOpened || !status?.platformOpened) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/booking/policies/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId, checkoutToken }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.accepted) {
        throw new Error(payload.error || "Unable to accept booking policies.");
      }
      await complete();
    } catch (acceptError) {
      setError(
        acceptError instanceof Error
          ? acceptError.message
          : "Unable to accept booking policies.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!status) {
    return <div className={styles.card}><strong>Loading booking policies…</strong></div>;
  }

  return (
    <div className={styles.card}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow dark">Policies &amp; agreements</p>
          <h2>Review before payment</h2>
        </div>
        <span className={styles.status}>Required</span>
      </div>

      <p className={styles.intro}>
        Review the host&apos;s property rules and cancellation terms plus the Find A
        Place platform terms before paying. Your reservation is with the host;
        Find A Place provides the booking, payment-routing and communication tools.
      </p>

      <div className={styles.reviewGrid}>
        <div className={`${styles.reviewCard} ${status.propertyOpened ? styles.reviewed : ""}`}>
          <strong>Host property policies</strong>
          <p>
            Review the host&apos;s house rules, cancellation terms and any policy PDF
            attached to this reservation.
          </p>
          <button
            className="button button-small button-quiet"
            type="button"
            disabled={busy}
            onClick={openPropertyPolicies}
          >
            {status.propertyDocument?.url ? "Open property policy PDF" : "Review property policies"}
          </button>
          {status.propertyOpened ? <small>Opened ✓</small> : null}
        </div>

        <div className={`${styles.reviewCard} ${status.platformOpened ? styles.reviewed : ""}`}>
          <strong>Find A Place terms</strong>
          <p>
            Review Find A Place&apos;s marketplace role, payment-routing terms and
            cancellation-request process.
          </p>
          <button
            className="button button-small button-quiet"
            type="button"
            disabled={busy}
            onClick={openPlatformTerms}
          >
            Open Find A Place terms
          </button>
          {status.platformOpened ? <small>Opened ✓</small> : null}
        </div>
      </div>

      <div className={styles.policyCopy}>
        {status.propertyPolicies.policies.length ? (
          <ul>
            {status.propertyPolicies.policies.map((policy) => (
              <li key={policy}>{policy}</li>
            ))}
          </ul>
        ) : null}
        {status.propertyPolicies.customPolicies ? (
          <p>{status.propertyPolicies.customPolicies}</p>
        ) : null}
        {status.propertyPolicies.cancellationPolicy ? (
          <p><strong>Host cancellation terms:</strong> {status.propertyPolicies.cancellationPolicy}</p>
        ) : null}
        {status.propertyPolicies.checkIn || status.propertyPolicies.checkout ? (
          <p>
            {status.propertyPolicies.checkIn ? `Check-in: ${status.propertyPolicies.checkIn.slice(0, 5)}` : ""}
            {status.propertyPolicies.checkIn && status.propertyPolicies.checkout ? " · " : ""}
            {status.propertyPolicies.checkout ? `Checkout: ${status.propertyPolicies.checkout.slice(0, 5)}` : ""}
          </p>
        ) : null}
      </div>

      <div className={styles.links}>
        <a href={status.platform.termsUrl} target="_blank" rel="noreferrer">Booking terms</a>
        <a href={status.platform.cancellationUrl} target="_blank" rel="noreferrer">Cancellation policy</a>
        <a href={status.platform.privacyUrl} target="_blank" rel="noreferrer">Privacy &amp; identity notice</a>
      </div>

      <label className={styles.agreement}>
        <input
          type="checkbox"
          checked={agreed}
          disabled={!status.propertyOpened || !status.platformOpened || busy}
          onChange={(event) => setAgreed(event.target.checked)}
        />
        <span>
          I have opened and reviewed the host&apos;s property policies and Find A
          Place terms, and I agree to them for this reservation.
        </span>
      </label>

      {error ? <div className={styles.error}>{error}</div> : null}

      <button
        className="button button-full"
        type="button"
        disabled={busy || !agreed || !status.propertyOpened || !status.platformOpened}
        onClick={accept}
      >
        {busy ? "Saving agreement…" : "Agree & continue to payment"}
      </button>
    </div>
  );
}
