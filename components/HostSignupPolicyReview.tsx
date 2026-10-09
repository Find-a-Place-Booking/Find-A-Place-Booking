"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./HostSignupPolicyReview.module.css";

type PolicyKey =
  | "hostAgreement"
  | "platformTerms"
  | "cancellationPolicy"
  | "privacyNotice";

type Policy = {
  key: PolicyKey;
  label: string;
  description: string;
  href: string;
  field: string;
};

const policies: Policy[] = [
  {
    key: "hostAgreement",
    label: "Host Agreement",
    description:
      "Your responsibilities as a host, Find A Place's marketplace role, commissions, property-listing responsibilities and account obligations.",
    href: "/host-agreement",
    field: "host_agreement_opened",
  },
  {
    key: "platformTerms",
    label: "Terms of Service",
    description:
      "The general Find A Place platform terms that apply to use of the marketplace, booking tools and account services.",
    href: "/terms",
    field: "platform_terms_opened",
  },
  {
    key: "cancellationPolicy",
    label: "Cancellation & refund policy",
    description:
      "How cancellation requests, host decisions, refunds and Find A Place fees are handled through the platform.",
    href: "/cancellation-policy",
    field: "cancellation_policy_opened",
  },
  {
    key: "privacyNotice",
    label: "Privacy Notice",
    description:
      "How Find A Place handles account, booking, identity and platform data.",
    href: "/privacy",
    field: "privacy_notice_opened",
  },
];

export function HostSignupPolicyReview() {
  const [opened, setOpened] = useState<Record<PolicyKey, boolean>>({
    hostAgreement: false,
    platformTerms: false,
    cancellationPolicy: false,
    privacyNotice: false,
  });
  const [activePolicyKey, setActivePolicyKey] = useState<PolicyKey | null>(null);

  const activePolicy = useMemo(
    () => policies.find((policy) => policy.key === activePolicyKey) ?? null,
    [activePolicyKey],
  );

  const allOpened = policies.every((policy) => opened[policy.key]);
  const reviewedCount = policies.filter((policy) => opened[policy.key]).length;

  useEffect(() => {
    if (!activePolicy) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activePolicy]);

  function finishReview() {
    if (!activePolicy) return;
    const nextOpened = { ...opened, [activePolicy.key]: true };
    setOpened(nextOpened);
    const nextPolicy = policies.find((policy) => !nextOpened[policy.key]);
    setActivePolicyKey(nextPolicy?.key ?? null);
  }

  return (
    <>
      <section className={styles.card} aria-labelledby="host-policy-review-title">
        <div className={styles.heading}>
          <div>
            <p className="eyebrow dark">Platform agreements</p>
            <h2 id="host-policy-review-title">Review before creating your host account</h2>
          </div>
          <span className={styles.required}>Required</span>
        </div>

        <p className={styles.intro}>
          Review each document here without leaving this signup page. Your name,
          email and other account details stay in place while you read.
        </p>

        <div className={styles.progressText}>
          {reviewedCount} of {policies.length} reviewed
        </div>

        <div className={styles.policyGrid}>
          {policies.map((policy) => (
            <div
              className={`${styles.policyCard} ${opened[policy.key] ? styles.reviewed : ""}`}
              key={policy.key}
            >
              <div>
                <strong>{policy.label}</strong>
                <p>{policy.description}</p>
              </div>
              <button
                className={styles.openButton}
                type="button"
                onClick={() => setActivePolicyKey(policy.key)}
              >
                {opened[policy.key] ? "Review again" : `Review ${policy.label}`}
              </button>
              <input
                type="hidden"
                name={policy.field}
                value={opened[policy.key] ? "yes" : ""}
              />
            </div>
          ))}
        </div>

        {!allOpened ? (
          <p className={styles.reviewNote}>
            Review all four documents to enable the agreement checkbox.
          </p>
        ) : (
          <p className={styles.reviewComplete}>All required policies reviewed ✓</p>
        )}

        <label className={styles.agreement}>
          <input
            name="host_terms_accepted"
            type="checkbox"
            required
            disabled={!allOpened}
          />
          <span>
            I have reviewed the current Host Agreement, Terms of Service,
            cancellation and refund policy, and Privacy Notice, and I agree to
            them as a Find A Place host.
          </span>
        </label>
      </section>

      {activePolicy ? (
        <div
          className={styles.reviewOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="policy-review-title"
        >
          <div className={styles.reviewPanel}>
            <header className={styles.reviewHeader}>
              <div>
                <small>Required policy review</small>
                <strong id="policy-review-title">{activePolicy.label}</strong>
              </div>
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setActivePolicyKey(null)}
                aria-label="Close policy review"
              >
                ×
              </button>
            </header>

            <iframe
              className={styles.policyFrame}
              src={activePolicy.href}
              title={activePolicy.label}
            />

            <footer className={styles.reviewFooter}>
              <a
                href={activePolicy.href}
                target="_blank"
                rel="noreferrer"
                className={styles.externalLink}
              >
                Open separately
              </a>
              <button
                type="button"
                className={styles.doneButton}
                onClick={finishReview}
              >
                {policies.some(
                  (policy) => policy.key !== activePolicy.key && !opened[policy.key],
                )
                  ? "Done reviewing · next →"
                  : "Done reviewing ✓"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
