"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import styles from "./HostOnboardingFeedbackSurvey.module.css";

const difficultyOptions = [
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

type PropertyChoice = {
  id: string;
  name: string;
  status: string;
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
};

function Scale({
  value,
  onChange,
  left,
  right,
}: {
  value: number;
  onChange: (value: number) => void;
  left: string;
  right: string;
}) {
  return (
    <div>
      <div className={styles.scale}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            className={value === score ? styles.selected : ""}
            key={score}
            type="button"
            onClick={() => onChange(score)}
            aria-pressed={value === score}
          >
            {score}
          </button>
        ))}
      </div>
      <div className={styles.scaleLabels}>
        <span>{left}</span>
        <span>{right}</span>
      </div>
    </div>
  );
}

export function HostOnboardingFeedbackSurvey({
  properties,
  initialPropertyId,
  submittedPropertyIds,
}: {
  properties: PropertyChoice[];
  initialPropertyId: string;
  submittedPropertyIds: string[];
}) {
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [survey, setSurvey] = useState(initialSurvey);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const alreadySubmitted = submittedPropertyIds.includes(propertyId);
  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === propertyId),
    [properties, propertyId],
  );

  function set<K extends keyof SurveyState>(
    key: K,
    value: SurveyState[K],
  ) {
    setSurvey((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  function toggleDifficulty(label: string) {
    setSurvey((current) => ({
      ...current,
      difficultyAreas: current.difficultyAreas.includes(label)
        ? current.difficultyAreas.filter((item) => item !== label)
        : [...current.difficultyAreas, label],
    }));
    setResult(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId || submitting) return;

    if (!survey.overallEase || !survey.humanHelp || !survey.addPropertyConfidence) {
      setResult({
        ok: false,
        message:
          "Please answer the three quick rating questions before submitting. The written questions can be left blank.",
      });
      return;
    }

    setSubmitting(true);
    setResult(null);

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
          ...survey,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload?.error || "Unable to save your feedback.",
        );
      }

      setResult({
        ok: true,
        message:
          "Thank you. Your feedback was saved and sent to the Find A Place team.",
      });
    } catch (error) {
      setResult({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to save your feedback.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!properties.length) {
    return (
      <section className="panel">
        <h2>No property yet</h2>
        <p className="muted">
          This survey is for the property onboarding process. Once your first
          property has been created, you can come back here anytime.
        </p>
        <Link className="button" href="/host/properties">
          Go to properties
        </Link>
      </section>
    );
  }

  if (result?.ok) {
    return (
      <section className={`panel ${styles.thankYou}`}>
        <p className="eyebrow dark">Feedback received</p>
        <h2>Thank you for helping us improve host setup.</h2>
        <p>{result.message}</p>
        <div className={styles.actions}>
          <Link className="button" href="/host">
            Back to dashboard
          </Link>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => {
              setSurvey(initialSurvey);
              setResult(null);
            }}
          >
            Send updated feedback
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className={`panel ${styles.survey}`} onSubmit={submit}>
      <div className={styles.intro}>
        <div>
          <p className="eyebrow dark">Optional · about 2–3 minutes</p>
          <h2>Help us make onboarding easier for the next host.</h2>
          <p>
            Tell us what was confusing, what felt unnecessary, and what would
            have made the process better. This does not affect your listing or
            account.
          </p>
        </div>
        <Link className="button button-quiet" href="/host">
          Maybe later
        </Link>
      </div>

      <label className={styles.propertySelect}>
        <span>Property you onboarded</span>
        <select
          value={propertyId}
          onChange={(event) => {
            setPropertyId(event.target.value);
            setResult(null);
          }}
        >
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.name}
            </option>
          ))}
        </select>
        {alreadySubmitted ? (
          <small>
            You already sent feedback for this property. Submitting again will
            update your previous response.
          </small>
        ) : null}
      </label>

      <section className={styles.question}>
        <div className={styles.questionHead}>
          <strong>1. Overall, how easy was it to set up your property?</strong>
          <span>Required</span>
        </div>
        <Scale
          value={survey.overallEase}
          onChange={(value) => set("overallEase", value)}
          left="Very difficult"
          right="Very easy"
        />
      </section>

      <section className={styles.question}>
        <strong>2. Which parts gave you the most trouble?</strong>
        <div className={styles.chips}>
          {difficultyOptions.map((option) => (
            <label
              className={
                survey.difficultyAreas.includes(option)
                  ? styles.chipSelected
                  : ""
              }
              key={option}
            >
              <input
                type="checkbox"
                checked={survey.difficultyAreas.includes(option)}
                onChange={() => toggleDifficulty(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </section>

      <section className={styles.question}>
        <label>
          <strong>3. What was the hardest or most confusing part?</strong>
          <textarea
            rows={4}
            value={survey.hardestPart}
            onChange={(event) =>
              set("hardestPart", event.target.value)
            }
          />
        </label>
      </section>

      <section className={styles.questionGrid}>
        <label>
          <strong>
            4. Was there anything you expected the site to explain better?
          </strong>
          <textarea
            rows={4}
            value={survey.explainBetter}
            onChange={(event) =>
              set("explainBetter", event.target.value)
            }
          />
        </label>

        <label>
          <strong>
            5. Did anything feel unnecessary or like it should be removed?
          </strong>
          <textarea
            rows={4}
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
            6. Was anything missing that would have made setup easier?
          </strong>
          <textarea
            rows={4}
            value={survey.missingFeature}
            onChange={(event) =>
              set("missingFeature", event.target.value)
            }
          />
        </label>
      </section>

      <section className={styles.question}>
        <div className={styles.questionHead}>
          <strong>7. Did you need help from another person to finish setup?</strong>
          <span>Required</span>
        </div>
        <div className={styles.radioRow}>
          {[
            ["NO", "No"],
            ["A_LITTLE", "A little"],
            ["YES_SEVERAL", "Yes, several times"],
          ].map(([value, label]) => (
            <label
              className={
                survey.humanHelp === value ? styles.radioSelected : ""
              }
              key={value}
            >
              <input
                type="radio"
                name="human-help"
                checked={survey.humanHelp === value}
                onChange={() =>
                  set(
                    "humanHelp",
                    value as SurveyState["humanHelp"],
                  )
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {survey.humanHelp && survey.humanHelp !== "NO" ? (
          <label className={styles.followUp}>
            <span>What did you need help with?</span>
            <textarea
              rows={3}
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
            8. How comfortable would you feel adding another property on your own?
          </strong>
          <span>Required</span>
        </div>
        <Scale
          value={survey.addPropertyConfidence}
          onChange={(value) =>
            set("addPropertyConfidence", value)
          }
          left="Not comfortable"
          right="Very comfortable"
        />
      </section>

      <section className={styles.questionGrid}>
        <label>
          <strong>
            9. If you could change one thing about Find A Place host setup,
            what would it be?
          </strong>
          <textarea
            rows={4}
            value={survey.oneChange}
            onChange={(event) =>
              set("oneChange", event.target.value)
            }
          />
        </label>

        <label>
          <strong>10. Anything else you want us to know?</strong>
          <textarea
            rows={4}
            value={survey.additionalComments}
            onChange={(event) =>
              set("additionalComments", event.target.value)
            }
          />
        </label>
      </section>

      {result ? (
        <div
          className={`admin-message ${
            result.ok ? "success" : "error"
          }`}
          role="status"
        >
          {result.message}
        </div>
      ) : null}

      <div className={styles.submitRow}>
        <div>
          <strong>{selectedProperty?.name}</strong>
          <span>
            Your answers are sent to the Find A Place team, not shown publicly.
          </span>
        </div>
        <div className={styles.actions}>
          <Link className="button button-quiet" href="/host">
            Maybe later
          </Link>
          <button className="button" type="submit" disabled={submitting}>
            {submitting ? "Sending feedback…" : "Submit feedback"}
          </button>
        </div>
      </div>
    </form>
  );
}
