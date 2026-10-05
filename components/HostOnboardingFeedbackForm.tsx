"use client";

import { useState, type FormEvent } from "react";

import styles from "./HostOnboardingFeedbackForm.module.css";

const DIFFICULTY_AREAS = [
  "Property details",
  "Location",
  "Amenities",
  "Photos",
  "Rates & fees",
  "Taxes",
  "Policies",
  "Calendar / availability",
  "Airbnb / Vrbo iCal",
  "ThinkReservations / ResNexus / PMS",
  "Stripe / payments",
  "Publishing",
  "Other",
];

type Props = {
  propertyId?: string;
  slug?: string;
  surface: "onboarding" | "overview";
  onSubmitted: () => void;
  onCancel?: () => void;
};

type SurveyState = {
  overallEase: number;
  difficultyAreas: string[];
  hardestPart: string;
  explainBetter: string;
  unnecessaryPart: string;
  missingFeature: string;
  humanHelp: "NO" | "A_LITTLE" | "YES_SEVERAL" | "";
  humanHelpDetails: string;
  addPropertyConfidence: number;
  oneChange: string;
  additionalComments: string;
  dontGoEmptyInterest: boolean | null;
};

const initialSurvey: SurveyState = {
  overallEase: 0,
  difficultyAreas: [],
  hardestPart: "",
  explainBetter: "",
  unnecessaryPart: "",
  missingFeature: "",
  humanHelp: "",
  humanHelpDetails: "",
  addPropertyConfidence: 0,
  oneChange: "",
  additionalComments: "",
  dontGoEmptyInterest: null,
};

function Scale({
  value,
  onChange,
  low,
  high,
}: {
  value: number;
  onChange: (value: number) => void;
  low: string;
  high: string;
}) {
  return (
    <div>
      <div className={styles.scoreRow}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            aria-pressed={value === score}
            className={value === score ? styles.scoreSelected : ""}
            onClick={() => onChange(score)}
          >
            {score}
          </button>
        ))}
      </div>
      <div className={styles.scoreLabels}>
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

export function HostOnboardingFeedbackForm({
  propertyId,
  slug,
  surface,
  onSubmitted,
  onCancel,
}: Props) {
  const [survey, setSurvey] = useState(initialSurvey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SurveyState>(
    key: K,
    value: SurveyState[K],
  ) {
    setSurvey((current) => ({ ...current, [key]: value }));
    setError(null);
  }

  function toggleDifficulty(label: string) {
    setSurvey((current) => ({
      ...current,
      difficultyAreas: current.difficultyAreas.includes(label)
        ? current.difficultyAreas.filter((item) => item !== label)
        : [...current.difficultyAreas, label],
    }));
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (
      !survey.overallEase ||
      !survey.humanHelp ||
      !survey.addPropertyConfidence
    ) {
      setError(
        "Please answer the three required quick rating questions before submitting. The written questions and Don’t Go Empty question are optional.",
      );
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/host/onboarding-feedback", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          propertyId,
          slug,
          surface,
          ...survey,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error || "Unable to save your feedback right now.",
        );
      }

      onSubmitted();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save your feedback right now.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <section className={styles.question}>
        <div className={styles.questionHead}>
          <strong>1. Overall, how easy was it to set up your property?</strong>
          <span>Required</span>
        </div>
        <Scale
          value={survey.overallEase}
          onChange={(value) => set("overallEase", value)}
          low="Very difficult"
          high="Very easy"
        />
      </section>

      <section className={styles.question}>
        <strong>2. Which parts gave you the most trouble?</strong>
        <small>Choose as many as apply.</small>
        <div className={styles.chips}>
          {DIFFICULTY_AREAS.map((area) => (
            <label
              key={area}
              className={
                survey.difficultyAreas.includes(area)
                  ? styles.chipSelected
                  : ""
              }
            >
              <input
                type="checkbox"
                checked={survey.difficultyAreas.includes(area)}
                onChange={() => toggleDifficulty(area)}
              />
              <span>{area}</span>
            </label>
          ))}
        </div>
      </section>

      <section className={styles.question}>
        <label>
          <strong>3. What was the hardest or most confusing part?</strong>
          <textarea
            rows={3}
            maxLength={5000}
            value={survey.hardestPart}
            onChange={(event) =>
              set("hardestPart", event.target.value)
            }
          />
        </label>
      </section>

      <section className={styles.twoColumn}>
        <label>
          <strong>
            4. Was there anything you expected the site to explain better?
          </strong>
          <textarea
            rows={3}
            maxLength={5000}
            value={survey.explainBetter}
            onChange={(event) =>
              set("explainBetter", event.target.value)
            }
          />
        </label>

        <label>
          <strong>
            5. Was there anything in the platform or setup process that felt
            unnecessary or should be removed?
          </strong>
          <textarea
            rows={3}
            maxLength={5000}
            value={survey.unnecessaryPart}
            onChange={(event) =>
              set("unnecessaryPart", event.target.value)
            }
          />
        </label>
      </section>

      <section className={styles.question}>
        <label>
          <strong>
            6. What was missing that would have made setup easier or better?
          </strong>
          <textarea
            rows={3}
            maxLength={5000}
            value={survey.missingFeature}
            onChange={(event) =>
              set("missingFeature", event.target.value)
            }
          />
        </label>
      </section>

      <section className={styles.question}>
        <div className={styles.questionHead}>
          <strong>
            7. Did you need help from another person to finish setup?
          </strong>
          <span>Required</span>
        </div>
        <div className={styles.choiceRow}>
          {[
            ["NO", "No"],
            ["A_LITTLE", "A little"],
            ["YES_SEVERAL", "Yes, several times"],
          ].map(([value, label]) => {
            const selected = survey.humanHelp === value;

            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                className={selected ? styles.choiceSelected : ""}
                onClick={() =>
                  set(
                    "humanHelp",
                    value as SurveyState["humanHelp"],
                  )
                }
              >
                {label}
              </button>
            );
          })}
        </div>

        {survey.humanHelp && survey.humanHelp !== "NO" ? (
          <label className={styles.followUp}>
            <span>What did you need help with?</span>
            <textarea
              rows={2}
              maxLength={5000}
              value={survey.humanHelpDetails}
              onChange={(event) =>
                set("humanHelpDetails", event.target.value)
              }
            />
          </label>
        ) : null}
      </section>

      <section className={styles.question}>
        <div className={styles.questionHead}>
          <strong>
            8. How comfortable would you feel adding another property on your
            own now?
          </strong>
          <span>Required</span>
        </div>
        <Scale
          value={survey.addPropertyConfidence}
          onChange={(value) =>
            set("addPropertyConfidence", value)
          }
          low="Not comfortable"
          high="Very comfortable"
        />
      </section>

      <section className={styles.twoColumn}>
        <label>
          <strong>
            9. If you could change one thing about Find A Place host setup,
            what would it be?
          </strong>
          <textarea
            rows={3}
            maxLength={5000}
            value={survey.oneChange}
            onChange={(event) =>
              set("oneChange", event.target.value)
            }
          />
        </label>

        <label>
          <strong>10. Anything else you want us to know?</strong>
          <textarea
            rows={3}
            maxLength={7000}
            value={survey.additionalComments}
            onChange={(event) =>
              set("additionalComments", event.target.value)
            }
          />
        </label>
      </section>

      <section className={`${styles.question} ${styles.programQuestion}`}>
        <div className={styles.questionHead}>
          <strong>
            11. Would you like to participate in our Don&apos;t Go Empty
            program?
          </strong>
          <span>Optional</span>
        </div>

        <div className={styles.programCopy}>
          <strong>When you have a period of vacancy, keep your stay working for you.</strong>
          <p>
            At no additional cost to you, we may be able to arrange for one of
            our team members or creators to come and stay during an open period.
            They can collect fresh content, share the property with their
            audience, and give Find A Place seasonal content we can use to
            feature your stay again.
          </p>
          <small>
            Saying yes just tells us you&apos;re interested in hearing more.
            It does not commit you to any stay or date.
          </small>
        </div>

        <div className={styles.choiceRow}>
          {[
            ["yes", "Yes, I'm interested"],
            ["no", "No, not right now"],
          ].map(([value, label]) => {
            const checked =
              survey.dontGoEmptyInterest === (value === "yes");

            return (
              <button
                key={value}
                type="button"
                aria-pressed={checked}
                className={checked ? styles.choiceSelected : ""}
                onClick={() =>
                  set("dontGoEmptyInterest", value === "yes")
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      <div className={styles.footer}>
        <div>
          <strong>Optional feedback</strong>
          <span>
            Your answers go directly to the Find A Place team and are not
            shown publicly.
          </span>
        </div>
        <div className={styles.actions}>
          {onCancel ? (
            <button
              type="button"
              className="button button-quiet"
              disabled={submitting}
              onClick={onCancel}
            >
              Maybe later
            </button>
          ) : null}
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Sending feedback…" : "Submit feedback"}
          </button>
        </div>
      </div>
    </form>
  );
}
