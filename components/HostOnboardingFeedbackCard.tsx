"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { HostOnboardingFeedbackForm } from "./HostOnboardingFeedbackForm";
import styles from "./HostOnboardingFeedbackCard.module.css";

export function HostOnboardingFeedbackCard({
  propertyId,
  propertyName,
}: {
  propertyId: string;
  propertyName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  if (submitted) {
    return (
      <section className={`${styles.card} ${styles.thankYou}`} id="onboarding-feedback">
        <div className={styles.check} aria-hidden="true">✓</div>
        <div>
          <p className="eyebrow dark">Feedback received</p>
          <h2>Thank you for helping us improve host setup.</h2>
          <p>
            Your feedback was saved and sent to the Find A Place team. We use
            this to clean up confusing steps, improve help tips and decide what
            should change next.
          </p>
        </div>
        <button
          type="button"
          className="button button-quiet"
          onClick={() => {
            setDismissed(true);
            router.refresh();
          }}
        >
          Close
        </button>
      </section>
    );
  }

  if (!open) {
    return (
      <section className={styles.card} id="onboarding-feedback">
        <div className={styles.inviteIcon} aria-hidden="true">✦</div>
        <div className={styles.inviteCopy}>
          <p className="eyebrow dark">Help us improve · optional</p>
          <h2>How did host setup go?</h2>
          <p>
            Tell us what was confusing, what felt unnecessary and what would
            have made onboarding easier. It takes about 2–3 minutes and helps
            us make the process better for the next host.
          </p>
          <small>
            This is about your setup experience for {propertyName}. Your
            answers are private and do not affect your listing.
          </small>
        </div>
        <button
          type="button"
          className="button"
          onClick={() => setOpen(true)}
        >
          Give onboarding feedback
        </button>
      </section>
    );
  }

  return (
    <section className={`${styles.card} ${styles.expanded}`} id="onboarding-feedback">
      <div className={styles.expandedHead}>
        <div>
          <p className="eyebrow dark">Optional · about 2–3 minutes</p>
          <h2>Help us make host setup easier.</h2>
          <p>
            Be as direct as you want. We want to know what slowed you down,
            what did not need to be there, and what would make the process
            better.
          </p>
        </div>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => setOpen(false)}
        >
          Collapse
        </button>
      </div>

      <HostOnboardingFeedbackForm
        propertyId={propertyId}
        surface="overview"
        onCancel={() => setOpen(false)}
        onSubmitted={() => setSubmitted(true)}
      />
    </section>
  );
}
