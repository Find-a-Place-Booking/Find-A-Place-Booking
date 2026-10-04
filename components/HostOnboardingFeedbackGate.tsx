"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { HostOnboardingFeedbackForm } from "./HostOnboardingFeedbackForm";
import styles from "./HostOnboardingFeedbackGate.module.css";

export function HostOnboardingFeedbackGate() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [submittedNow, setSubmittedNow] = useState(false);

  const propertyMatch = pathname.match(
    /^\/host\/properties\/([^/]+)\/?$/,
  );
  const onboardingComplete =
    searchParams.get("onboarding") === "complete";
  const feedbackState = searchParams.get("feedback");

  if (
    !propertyMatch ||
    !onboardingComplete ||
    feedbackState === "later"
  ) {
    return null;
  }

  const slug = decodeURIComponent(propertyMatch[1]);
  const showThankYou =
    submittedNow || feedbackState === "submitted";

  function replaceParams(next: URLSearchParams) {
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  function maybeLater() {
    const next = new URLSearchParams(searchParams.toString());
    next.set("feedback", "later");
    next.delete("feedback_error");
    replaceParams(next);
  }

  function markSubmitted() {
    setSubmittedNow(true);
    const next = new URLSearchParams(searchParams.toString());
    next.set("feedback", "submitted");
    next.delete("feedback_error");
    replaceParams(next);
  }

  function closeThankYou() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("feedback");
    next.delete("feedback_error");
    next.delete("onboarding");
    replaceParams(next);
    router.refresh();
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="host-onboarding-feedback-title"
      >
        {showThankYou ? (
          <div className={styles.thankYou}>
            <div className={styles.check} aria-hidden="true">✓</div>
            <p>Feedback received</p>
            <h2 id="host-onboarding-feedback-title">
              Thank you for helping us improve host setup.
            </h2>
            <span>
              Your feedback was saved and sent to the Find A Place team. Your
              property setup is complete and nothing else is required here.
            </span>
            <button className="button" type="button" onClick={closeThankYou}>
              Continue to property
            </button>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <div>
                <p>Optional · about 2–3 minutes</p>
                <h2 id="host-onboarding-feedback-title">
                  Help us make host setup easier.
                </h2>
                <span>
                  Your property setup is complete. Tell us what was confusing,
                  what felt unnecessary and what would have made the process
                  better. This does not affect your listing, payments or
                  account.
                </span>
              </div>
              <button
                type="button"
                className={styles.close}
                onClick={maybeLater}
                aria-label="Maybe later"
              >
                ×
              </button>
            </div>

            <div className={styles.formWrap}>
              <HostOnboardingFeedbackForm
                slug={slug}
                surface="onboarding"
                onCancel={maybeLater}
                onSubmitted={markSubmitted}
              />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
