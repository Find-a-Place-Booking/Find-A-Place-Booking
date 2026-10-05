"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  HOST_ROUTE_HELP,
  ONBOARDING_HELP,
  type ContextHelp,
} from "@/lib/host/help-content";
import styles from "./HostHelpAssistant.module.css";

const ONBOARDING_KEY = "fap_host_onboarding_help_enabled_v1";
const DASHBOARD_KEY = "fap_host_dashboard_help_enabled_v1";

const stripeCoachSteps = [
  {
    title: "Choose the Stripe path that fits you",
    body:
      "Already use Stripe? Sign in with that login. New to Stripe? Create the account here. Either path stays tied to this Find A Place host account.",
  },
  {
    title: "Business and public details",
    body:
      "Stripe may ask what the business does and where guests can see it. If you do not have a website, use a public Airbnb, Vrbo, Facebook business page or another booking page that shows the property.",
  },
  {
    title: "Identity and payout bank account",
    body:
      "Stripe may ask for identity details and the bank account that should receive deposits. Those sensitive details stay with Stripe, not Find A Place.",
  },
  {
    title: "Finish every Stripe requirement",
    body:
      "Complete the Stripe flow until Find A Place shows the payment connection as ready. If Stripe asks for something later, reopen Payments & taxes and finish the new requirement there.",
  },
];

function storedEnabled(key: string, fallback: boolean) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {}
  return fallback;
}

function findStripeTarget() {
  const explicit = document.querySelector(
    ".stripe-embedded-onboarding",
  ) as HTMLElement | null;

  if (explicit) return explicit;

  const buttons = Array.from(
    document.querySelectorAll("button"),
  ) as HTMLButtonElement[];

  const button = buttons.find((candidate) =>
    /(existing stripe|new to stripe|open stripe account|connect stripe)/i.test(
      candidate.textContent || "",
    ),
  );

  if (!button) return null;

  let node: HTMLElement | null = button.parentElement;

  for (let depth = 0; node && depth < 6; depth += 1) {
    const text = node.textContent || "";
    const rect = node.getBoundingClientRect();

    if (
      /stripe connect/i.test(text) &&
      rect.width >= 280 &&
      rect.height >= 120
    ) {
      return node;
    }

    node = node.parentElement;
  }

  return button.parentElement;
}

function routeHelp(pathname: string): ContextHelp | null {
  const match = HOST_ROUTE_HELP.find((entry) =>
    pathname.startsWith(entry.prefix),
  );
  return match?.help ?? null;
}

export function HostHelpAssistant() {
  const pathname = usePathname();
  const onboarding = pathname === "/host/onboarding";
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<string | null>(
    null,
  );
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachStep, setCoachStep] = useState(0);
  const [coachRect, setCoachRect] = useState<DOMRect | null>(null);
  const [coachUnavailable, setCoachUnavailable] = useState(false);

  useEffect(() => {
    const key = onboarding ? ONBOARDING_KEY : DASHBOARD_KEY;
    setEnabled(storedEnabled(key, onboarding));
    setReady(true);
  }, [onboarding]);

  useEffect(() => {
    if (!onboarding) {
      setOnboardingStep(null);
      return;
    }

    const sync = () => {
      const label = document.querySelector(
        ".wizard-steps button.active b",
      )?.textContent?.trim();

      setOnboardingStep(label || null);
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [onboarding]);

  const help = useMemo(() => {
    if (pathname === "/host/help") return null;

    if (onboarding && onboardingStep) {
      return ONBOARDING_HELP[onboardingStep] ?? null;
    }

    return routeHelp(pathname);
  }, [onboarding, onboardingStep, pathname]);

  const saveEnabled = useCallback(
    (next: boolean) => {
      setEnabled(next);
      try {
        window.localStorage.setItem(
          onboarding ? ONBOARDING_KEY : DASHBOARD_KEY,
          next ? "1" : "0",
        );
      } catch {}

      if (!next) {
        setCoachOpen(false);
      }
    },
    [onboarding],
  );

  const syncCoachRect = useCallback(() => {
    const target = findStripeTarget();

    if (!target) {
      setCoachRect(null);
      return false;
    }

    const rect = target.getBoundingClientRect();
    setCoachRect(rect);
    return true;
  }, []);

  function startStripeCoach() {
    const target = findStripeTarget();

    if (!target) {
      setCoachUnavailable(true);
      return;
    }

    setCoachUnavailable(false);
    target.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    window.setTimeout(() => {
      syncCoachRect();
      setCoachStep(0);
      setCoachOpen(true);
    }, 250);
  }

  useEffect(() => {
    if (!coachOpen) return;

    const sync = () => syncCoachRect();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);

    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });

    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
      observer.disconnect();
    };
  }, [coachOpen, syncCoachRect]);

  if (!ready || !help) return null;

  if (!enabled) {
    return (
      <div className={styles.offRow}>
        <button
          className={styles.showButton}
          type="button"
          onClick={() => saveEnabled(true)}
        >
          ? Show help tips
        </button>
        <Link href="/host/help">Host FAQ</Link>
      </div>
    );
  }

  const articleHref = `/host/help?topic=${encodeURIComponent(
    help.articleId,
  )}`;

  return (
    <>
      <aside className={styles.tipCard} aria-label="Contextual host help">
        <div className={styles.tipIcon} aria-hidden="true">
          ?
        </div>

        <div className={styles.tipCopy}>
          <span>{onboarding ? "Setup tip" : "Help tip"}</span>
          <strong>{help.title}</strong>
          <p>{help.body}</p>

          {help.bullets?.length ? (
            <ul>
              {help.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}

          <div className={styles.tipLinks}>
            <Link href={articleHref}>Read the related FAQ →</Link>

            {help.stripeWalkthrough ? (
              <button
                type="button"
                onClick={startStripeCoach}
              >
                Start Stripe setup walkthrough
              </button>
            ) : null}
          </div>

          {coachUnavailable ? (
            <small className={styles.unavailable}>
              Open the Stripe setup section first, then start the walkthrough.
            </small>
          ) : null}
        </div>

        <button
          className={styles.hideButton}
          type="button"
          onClick={() => saveEnabled(false)}
          aria-label="Hide help tips"
        >
          Hide tips
        </button>
      </aside>

      {coachOpen && coachRect ? (
        <div className={styles.coachLayer} role="dialog" aria-modal="true">
          <div
            className={styles.coachHighlight}
            style={{
              top: Math.max(8, coachRect.top - 8),
              left: Math.max(8, coachRect.left - 8),
              width: Math.max(0, coachRect.width + 16),
              height: Math.max(0, coachRect.height + 16),
            }}
          />

          <section className={styles.coachCard}>
            <div className={styles.coachHead}>
              <span>
                Stripe setup · {coachStep + 1} of{" "}
                {stripeCoachSteps.length}
              </span>
              <button
                type="button"
                onClick={() => setCoachOpen(false)}
              >
                Hide guide
              </button>
            </div>

            <h3>{stripeCoachSteps[coachStep].title}</h3>
            <p>{stripeCoachSteps[coachStep].body}</p>

            <div className={styles.coachActions}>
              <button
                type="button"
                disabled={coachStep === 0}
                onClick={() =>
                  setCoachStep((current) => Math.max(0, current - 1))
                }
              >
                Back
              </button>

              {coachStep < stripeCoachSteps.length - 1 ? (
                <button
                  className={styles.coachPrimary}
                  type="button"
                  onClick={() =>
                    setCoachStep((current) =>
                      Math.min(stripeCoachSteps.length - 1, current + 1),
                    )
                  }
                >
                  Next
                </button>
              ) : (
                <button
                  className={styles.coachPrimary}
                  type="button"
                  onClick={() => setCoachOpen(false)}
                >
                  Done
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
