"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { OnboardingCalendarBridgeHelp } from "@/components/onboarding/OnboardingCalendarBridgeHelp";
import {
  HOST_ROUTE_HELP,
  ONBOARDING_HELP,
  type ContextHelp,
} from "@/lib/host/help-content";
import styles from "./HostHelpAssistant.module.css";

const ONBOARDING_KEY = "fap_host_onboarding_help_enabled_v1";
const DASHBOARD_KEY = "fap_host_dashboard_help_enabled_v1";

type DisplayHelp = ContextHelp & {
  important?: boolean;
};

const onboardingEnhancements: Record<
  string,
  Partial<DisplayHelp>
> = {
  Photos: {
    bullets: [
      "The first photo is the cover image guests see first.",
      "Use Set as cover or the left/right controls to arrange photos before you finish setup.",
      "That cover is also used for stay cards and shared-link previews.",
      "Use a clear exterior or room photo rather than a logo when possible.",
    ],
  },
  Taxes: {
    important: true,
    bullets: [
      "Statewide configured taxes are handled separately from optional local lines.",
      "Only add county, city or lodging taxes that actually apply to this property.",
      "Tax setup should not be used as a reason to enter made-up rates just to finish setup.",
    ],
  },
  Policies: {
    important: true,
    bullets: [
      "Guests accept these terms during checkout.",
      "Use exact cancellation/refund wording you can actually follow later.",
      "Check-in, checkout, pet and age rules should match what happens at the property.",
    ],
  },
  Calendar: {
    important: true,
    bullets: [
      "Choose the system that really controls this property's availability.",
      "If another platform or PMS takes bookings, do not choose Find A Place only just to get through setup.",
      "When you leave to copy an Airbnb, Vrbo or other iCal URL, open that service in a new browser tab and keep this setup tab open.",
      "After an iCal source connects, copy the Find A Place return feed shown below back into that same service for two-way blocking.",
      "Verify at least one known blocked or booked date after connecting.",
    ],
  },
  Payments: {
    important: true,
    bullets: [
      "Stripe must show ready before the first listing can take live payments.",
      "Bank and identity information stays inside Stripe.",
      "If Stripe asks for a website, a public property/booking page can usually be used.",
    ],
  },
  Review: {
    important: true,
    bullets: [
      "Fix anything marked Required before finishing.",
      "Make sure the calendar source is correct before publishing.",
      "Confirm the cover photo, nightly rate and cancellation wording one last time.",
    ],
  },
};

const routeEnhancements: Array<{
  prefix: string;
  patch: Partial<DisplayHelp>;
}> = [
  {
    prefix: "/host/calendar",
    patch: {
      important: true,
      bullets: [
        "Pick the correct property before judging whether dates are missing.",
        "Click a date to see whether it came from Find A Place, an outside calendar, an owner block or a safety range.",
        "Do not manually reopen an externally blocked date until the source is verified.",
      ],
    },
  },
  {
    prefix: "/host/integrations",
    patch: {
      important: true,
      bullets: [
        "Match every outside source to the exact cabin, room or site.",
        "Two-way iCal needs the outside feed coming in and the Find A Place export added back to the outside platform.",
        "After setup, compare one known reservation or blocked date before relying on the sync.",
      ],
    },
  },
  {
    prefix: "/host/payments",
    patch: {
      important: true,
      bullets: [
        "Stripe readiness and tax setup are separate checks.",
        "Never send passwords, bank numbers or identity documents to Find A Place support.",
        "If Stripe changes a requirement later, reopen the Stripe setup here and finish it.",
      ],
    },
  },
  {
    prefix: "/host/guest-emails",
    patch: {
      important: true,
      bullets: [
        "Keep instructions property-specific when access details differ.",
        "If a message needs an access code, make sure the reservation has one before the send window.",
        "Avoid duplicate rules that send nearly the same message at the same time.",
      ],
    },
  },
  {
    prefix: "/host/properties",
    patch: {
      bullets: [
        "The primary photo is used for the listing card and shared-link preview.",
        "Keep sleeping capacity, bed sizes and amenities consistent with the actual stay.",
        "Use Archive only when the property should no longer be active in the marketplace.",
      ],
    },
  },
  {
    prefix: "/host/reservations",
    patch: {
      important: true,
      bullets: [
        "Confirm the exact property and dates before changing anything.",
        "Check payment status before approving a refund or cancellation.",
        "Use the saved property cancellation terms as the reference for guest requests.",
      ],
    },
  },
];

const bookingRecoveryHelp: DisplayHelp = {
  title: "Recovery only works when the property is intentionally opted in.",
  body:
    "The 24-hour reminder only goes out while the same dates are still available. After about 3 days, discount offers follow the mode you choose here: ask first, automatic, or off.",
  articleId: "guest-emails",
  important: true,
  bullets: [
    "The first reminder does not hold the dates for the guest.",
    "Recovery discounts apply to lodging, not taxes or unrelated fees.",
    "Automatic offers should use a discount you are comfortable sending without another approval.",
  ],
};

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

function mergeHelp(
  base: ContextHelp,
  patch: Partial<DisplayHelp> | undefined,
): DisplayHelp {
  if (!patch) return base;

  return {
    ...base,
    ...patch,
    bullets: patch.bullets ?? base.bullets,
  };
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
    setEnabled(storedEnabled(key, true));
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

  const help = useMemo<DisplayHelp | null>(() => {
    if (pathname === "/host/help") return null;

    if (onboarding && onboardingStep) {
      const base = ONBOARDING_HELP[onboardingStep];
      return base
        ? mergeHelp(base, onboardingEnhancements[onboardingStep])
        : null;
    }

    if (pathname.startsWith("/host/recovery")) {
      return bookingRecoveryHelp;
    }

    const base = routeHelp(pathname);
    if (!base) return null;

    const enhancement = routeEnhancements.find((entry) =>
      pathname.startsWith(entry.prefix),
    );

    return mergeHelp(base, enhancement?.patch);
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
      <>
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

        {onboarding && onboardingStep === "Calendar" ? (
          <OnboardingCalendarBridgeHelp />
        ) : null}
      </>
    );
  }

  const articleHref = `/host/help?topic=${encodeURIComponent(
    help.articleId,
  )}`;

  return (
    <>
      <aside
        className={`${styles.tipCard} ${help.important ? styles.important : ""}`}
        aria-label="Contextual host help"
      >
        <div className={styles.tipIcon} aria-hidden="true">
          {help.important ? "!" : "?"}
        </div>

        <div className={styles.tipCopy}>
          <span>
            {help.important
              ? "Important on this screen"
              : onboarding
                ? "Setup tip"
                : "Help tip"}
          </span>
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
              <button type="button" onClick={startStripeCoach}>
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

      {onboarding && onboardingStep === "Calendar" ? (
        <OnboardingCalendarBridgeHelp />
      ) : null}

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
                Stripe setup · {coachStep + 1} of {stripeCoachSteps.length}
              </span>
              <button type="button" onClick={() => setCoachOpen(false)}>
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
