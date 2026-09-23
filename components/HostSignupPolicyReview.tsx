"use client";

import { useState } from "react";
import styles from "./HostSignupPolicyReview.module.css";

type PolicyKey =
  | "hostAgreement"
  | "platformTerms"
  | "cancellationPolicy"
  | "privacyNotice";

const policies: Array<{
  key: PolicyKey;
  label: string;
  description: string;
  href: string;
  field: string;
}> = [
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

  const allOpened = policies.every((policy) => opened[policy.key]);

  function openPolicy(policy: (typeof policies)[number]) {
    const popup = window.open(policy.href, "_blank", "noopener,noreferrer");
    if (popup) popup.opener = null;

    setOpened((current) => ({
      ...current,
      [policy.key]: true,
    }));
  }

  return (
    <section className={styles.card} aria-labelledby="host-policy-review-title">
      <div className={styles.heading}>
        <div>
          <p className="eyebrow dark">Platform agreements</p>
          <h2 id="host-policy-review-title">Review before creating your host account</h2>
        </div>
        <span className={styles.required}>Required</span>
      </div>

      <p className={styles.intro}>
        Open each Find A Place policy below before agreeing. We record the
        policy versions and time of acceptance with your host account.
      </p>

      <div className={styles.policyGrid}>
        {policies.map((policy) => (
          <div
            className={`${styles.policyCard} ${
              opened[policy.key] ? styles.reviewed : ""
            }`}
            key={policy.key}
          >
            <div>
              <strong>{policy.label}</strong>
              <p>{policy.description}</p>
            </div>
            <button
              className={styles.openButton}
              type="button"
              onClick={() => openPolicy(policy)}
            >
              {opened[policy.key] ? "Opened ✓" : `Open ${policy.label}`}
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
          Open all four documents to enable the agreement checkbox.
        </p>
      ) : (
        <p className={styles.reviewComplete}>All required policies opened ✓</p>
      )}

      <label className={styles.agreement}>
        <input
          name="host_terms_accepted"
          type="checkbox"
          required
          disabled={!allOpened}
        />
        <span>
          I have opened and reviewed the current Host Agreement, Terms of
          Service, cancellation and refund policy, and Privacy Notice, and I
          agree to them as a Find A Place host.
        </span>
      </label>
    </section>
  );
}
