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
  const [expanded, setExpanded] = useState<{
    property: boolean;
    platform: boolean;
  }>({
    property: false,
    platform: false,
  });
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

    if (next.ready) {
      await complete();
    }

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
    const alreadyOpened =
      kind === "property"
        ? Boolean(status?.propertyOpened)
        : Boolean(status?.platformOpened);

    setExpanded((current) => ({
      ...current,
      [kind]: !current[kind],
    }));

    if (alreadyOpened) return;

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
      setExpanded((current) => ({
        ...current,
        [kind]: false,
      }));
      setError(
        openError instanceof Error
          ? openError.message
          : "Unable to record policy review.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!agreed || !status?.propertyOpened || !status?.platformOpened) {
      return;
    }

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
    return (
      <div className={styles.card}>
        <strong>Loading booking policies…</strong>
      </div>
    );
  }

  const hostReviewed = status.propertyOpened;
  const platformReviewed = status.platformOpened;
  const reviewComplete = hostReviewed && platformReviewed;

  return (
    <div className={styles.card}>
      <div className={styles.heading}>
        <div>
          <p className="eyebrow dark">Review &amp; agree</p>
          <h2>Know the rules before you pay.</h2>
        </div>
        <span className={styles.status}>Required</span>
      </div>

      <p className={styles.intro}>
        Review the host&apos;s stay rules and cancellation terms, then the Find A
        Place booking terms. The important details stay on this page so you do
        not have to bounce between screens.
      </p>

      <div className={styles.reviewList}>
        <section
          className={`${styles.reviewCard} ${
            hostReviewed ? styles.reviewed : ""
          }`}
        >
          <button
            className={styles.reviewToggle}
            type="button"
            disabled={busy}
            aria-expanded={expanded.property}
            onClick={() => void markOpened("property")}
          >
            <span className={styles.reviewIcon}>
              {hostReviewed ? "✓" : "1"}
            </span>
            <span className={styles.reviewCopy}>
              <strong>Host property policies</strong>
              <small>
                House rules, cancellation terms and check-in / checkout
              </small>
            </span>
            <span className={styles.reviewState}>
              {hostReviewed ? "Reviewed" : "Review"}
            </span>
            <span className={styles.chevron}>
              {expanded.property ? "−" : "+"}
            </span>
          </button>

          {expanded.property ? (
            <div className={styles.reviewBody}>
              <div className={styles.compactFacts}>
                {status.propertyPolicies.checkIn ? (
                  <div>
                    <span>Check-in</span>
                    <strong>
                      {status.propertyPolicies.checkIn.slice(0, 5)}
                    </strong>
                  </div>
                ) : null}
                {status.propertyPolicies.checkout ? (
                  <div>
                    <span>Checkout</span>
                    <strong>
                      {status.propertyPolicies.checkout.slice(0, 5)}
                    </strong>
                  </div>
                ) : null}
              </div>

              {status.propertyPolicies.policies.length ? (
                <div className={styles.policyBlock}>
                  <strong>House rules</strong>
                  <ul>
                    {status.propertyPolicies.policies.map((policy) => (
                      <li key={policy}>{policy}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {status.propertyPolicies.customPolicies ? (
                <div className={styles.policyBlock}>
                  <strong>Additional host rules</strong>
                  <p>{status.propertyPolicies.customPolicies}</p>
                </div>
              ) : null}

              {status.propertyPolicies.cancellationPolicy ? (
                <div className={styles.policyBlock}>
                  <strong>Cancellation / refund terms</strong>
                  <p>{status.propertyPolicies.cancellationPolicy}</p>
                </div>
              ) : null}

              {!status.propertyPolicies.policies.length &&
              !status.propertyPolicies.customPolicies &&
              !status.propertyPolicies.cancellationPolicy ? (
                <p className={styles.muted}>
                  No additional host-written rules are attached to this
                  reservation.
                </p>
              ) : null}

              {status.propertyDocument?.url ? (
                <a
                  className={styles.documentLink}
                  href={status.propertyDocument.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open host policy PDF
                  {status.propertyDocument.originalName
                    ? ` · ${status.propertyDocument.originalName}`
                    : ""}
                </a>
              ) : null}
            </div>
          ) : null}
        </section>

        <section
          className={`${styles.reviewCard} ${
            platformReviewed ? styles.reviewed : ""
          }`}
        >
          <button
            className={styles.reviewToggle}
            type="button"
            disabled={busy}
            aria-expanded={expanded.platform}
            onClick={() => void markOpened("platform")}
          >
            <span className={styles.reviewIcon}>
              {platformReviewed ? "✓" : "2"}
            </span>
            <span className={styles.reviewCopy}>
              <strong>Find A Place booking terms</strong>
              <small>
                Marketplace role, payment routing and booking changes
              </small>
            </span>
            <span className={styles.reviewState}>
              {platformReviewed ? "Reviewed" : "Review"}
            </span>
            <span className={styles.chevron}>
              {expanded.platform ? "−" : "+"}
            </span>
          </button>

          {expanded.platform ? (
            <div className={styles.reviewBody}>
              <div className={styles.platformSummary}>
                <p>
                  Your reservation is with the host. Find A Place provides the
                  booking, payment-routing and communication tools used for the
                  reservation.
                </p>
                <p>
                  The host&apos;s saved cancellation terms govern guest
                  cancellation/refund requests, subject to applicable law.
                  Payment processing is handled by the host&apos;s connected
                  payment provider.
                </p>
              </div>

              <div className={styles.links}>
                <a
                  href={status.platform.termsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Full booking terms
                </a>
                <a
                  href={status.platform.cancellationUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Cancellation policy
                </a>
                <a
                  href={status.platform.privacyUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Privacy notice
                </a>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <div className={styles.acceptArea}>
        <div className={styles.reviewProgress}>
          <span>
            {hostReviewed ? "✓" : "○"} Host policies reviewed
          </span>
          <span>
            {platformReviewed ? "✓" : "○"} Find A Place terms reviewed
          </span>
        </div>

        <label
          className={`${styles.agreement} ${
            reviewComplete ? "" : styles.agreementDisabled
          }`}
        >
          <input
            type="checkbox"
            checked={agreed}
            disabled={!reviewComplete || busy}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>
            I reviewed the host&apos;s property policies and Find A Place
            booking terms and agree to them for this reservation.
          </span>
        </label>

        {error ? <div className={styles.error}>{error}</div> : null}

        <button
          className="button button-full"
          type="button"
          disabled={busy || !agreed || !reviewComplete}
          onClick={accept}
        >
          {busy ? "Saving agreement…" : "Agree & continue to payment"}
        </button>
      </div>
    </div>
  );
}
