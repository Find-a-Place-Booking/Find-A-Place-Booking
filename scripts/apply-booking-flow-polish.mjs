import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content, "utf8");
}

function replaceOnce(content, before, after, label) {
  const first = content.indexOf(before);
  if (first < 0) {
    throw new Error(`Patch marker not found: ${label}`);
  }
  if (content.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Patch marker is not unique: ${label}`);
  }
  return content.slice(0, first) + after + content.slice(first + before.length);
}

function patchGuestCheckout() {
  const path = "components/GuestCheckout.tsx";
  let c = read(path);

  c = replaceOnce(
    c,
    'import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";',
    'import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";',
    "GuestCheckout React import",
  );

  c = replaceOnce(
    c,
    'import type { Stripe } from "@stripe/stripe-js";',
    'import type { Stripe } from "@stripe/stripe-js";\nimport { track } from "@vercel/analytics";',
    "GuestCheckout analytics import",
  );

  c = replaceOnce(
    c,
    `type Hold = {
  reservationId: string;
  checkoutToken: string;
  confirmationCode: string;
  holdExpiresAt: string;
  guestTotalCents: number;
  taxTotalCents: number;
  platformCommissionCents: number;
  commissionRateBps: number;
  quote?: PricingQuote | null;
};`,
    `type Hold = {
  reservationId: string;
  checkoutToken: string;
  confirmationCode: string;
  holdExpiresAt: string;
  guestTotalCents: number;
  taxTotalCents: number;
  platformCommissionCents: number;
  commissionRateBps: number;
  quote?: PricingQuote | null;
};

type CheckoutEstimate = {
  quote: PricingQuote | null;
  guestTotalCents: number;
  taxTotalCents: number;
  collectionMode: string;
};`,
    "GuestCheckout estimate type",
  );

  c = replaceOnce(
    c,
    `  testMode,
}: {
  reservationId: string;
  checkoutToken: string;
  confirmationCode: string;
  testMode: boolean;
}) {`,
    `  testMode,
  slug,
}: {
  reservationId: string;
  checkoutToken: string;
  confirmationCode: string;
  testMode: boolean;
  slug: string;
}) {`,
    "StripePaymentForm slug prop",
  );

  c = replaceOnce(
    c,
    `    if (!stripe || !elements || busy) return;

    setBusy(true);
    setError(null);`,
    `    if (!stripe || !elements || busy) return;

    track("checkout_payment_submitted", {
      stay: slug,
      mode: testMode ? "test" : "live",
    });

    setBusy(true);
    setError(null);`,
    "payment submitted analytics",
  );

  c = replaceOnce(
    c,
    `    if (result.error) {
      setError(
        result.error.message || "Stripe could not complete the payment.",
      );
      setBusy(false);
      return;
    }`,
    `    if (result.error) {
      track("checkout_payment_error", {
        stay: slug,
        mode: testMode ? "test" : "live",
      });
      setError(
        result.error.message || "Stripe could not complete the payment.",
      );
      setBusy(false);
      return;
    }`,
    "payment error analytics",
  );

  c = replaceOnce(
    c,
    `  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);`,
    `  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [estimate, setEstimate] = useState<CheckoutEstimate | null>(null);
  const [estimateBusy, setEstimateBusy] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const checkoutViewedRef = useRef(false);
  const estimateTrackedRef = useRef(false);
  const detailsSubmittedTrackedRef = useRef(false);
  const holdCreatedTrackedRef = useRef(false);
  const verificationTrackedRef = useRef(false);
  const policyTrackedRef = useRef(false);
  const paymentReadyTrackedRef = useRef(false);`,
    "GuestCheckout estimate state and funnel refs",
  );

  c = replaceOnce(
    c,
    `  useEffect(() => {
    // Keep the platform Stripe.js instance available for the optional
    // identity-verification feature. With the default feature flag off,
    // no Identity session is created and it is not a booking gate.
    setIdentityStripePromise(loadStripe(publishableKey));
  }, [publishableKey]);

  const startPayment = useCallback(async (targetHold: Hold) => {`,
    `  useEffect(() => {
    // Keep the platform Stripe.js instance available for the optional
    // identity-verification feature. With the default feature flag off,
    // no Identity session is created and it is not a booking gate.
    setIdentityStripePromise(loadStripe(publishableKey));
  }, [publishableKey]);

  useEffect(() => {
    if (checkoutViewedRef.current) return;
    checkoutViewedRef.current = true;

    track("checkout_viewed", {
      stay: property.slug,
      mode: testMode ? "test" : "live",
    });
  }, [property.slug, testMode]);

  useEffect(() => {
    if (!checkIn || !checkOut || hold) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setEstimateBusy(true);
      setEstimateError(null);

      try {
        const response = await fetch("/api/booking/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            unitId: property.unitId,
            checkIn,
            checkOut,
            guests,
            pets,
            addOnIds: selectedAddOnIds,
            promotionCode: promotionCode.trim() || null,
          }),
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            payload.error || "Unable to update the price estimate.",
          );
        }

        setEstimate(payload as CheckoutEstimate);

        if (!estimateTrackedRef.current) {
          estimateTrackedRef.current = true;
          track("checkout_estimate_ready", {
            stay: property.slug,
            mode: testMode ? "test" : "live",
          });
        }
      } catch (estimateRequestError) {
        if (controller.signal.aborted) return;

        setEstimate(null);
        setEstimateError(
          estimateRequestError instanceof Error
            ? estimateRequestError.message
            : "Unable to update the price estimate.",
        );
      } finally {
        if (!controller.signal.aborted) setEstimateBusy(false);
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    checkIn,
    checkOut,
    guests,
    hold,
    pets,
    promotionCode,
    property.slug,
    property.unitId,
    selectedAddOnIds,
    testMode,
  ]);

  const startPayment = useCallback(async (targetHold: Hold) => {`,
    "GuestCheckout view + estimate effects",
  );

  c = replaceOnce(
    c,
    `      setClientSecret(paymentPayload.clientSecret);
    } catch (paymentError) {`,
    `      setClientSecret(paymentPayload.clientSecret);

      if (!paymentReadyTrackedRef.current) {
        paymentReadyTrackedRef.current = true;
        track("checkout_payment_ready", {
          stay: property.slug,
          mode: testMode ? "test" : "live",
        });
      }
    } catch (paymentError) {`,
    "payment ready analytics",
  );

  c = replaceOnce(
    c,
    `    } finally {
      setBusy(false);
    }
  }, [publishableKey]);

  useEffect(() => {
    if (!initialReservationId || !initialCheckoutToken) return;`,
    `    } finally {
      setBusy(false);
    }
  }, [property.slug, publishableKey, testMode]);

  useEffect(() => {
    if (!initialReservationId || !initialCheckoutToken) return;`,
    "startPayment dependencies",
  );

  c = replaceOnce(
    c,
    `  async function createHold() {
    setBusy(true);
    setError(null);

    try {`,
    `  async function createHold() {
    setBusy(true);
    setError(null);

    if (!detailsSubmittedTrackedRef.current) {
      detailsSubmittedTrackedRef.current = true;
      track("checkout_details_submitted", {
        stay: property.slug,
        mode: testMode ? "test" : "live",
      });
    }

    try {`,
    "details submitted analytics",
  );

  c = replaceOnce(
    c,
    `      setPaymentStripePromise(null);
      setHold(nextHold);`,
    `      setPaymentStripePromise(null);
      setHold(nextHold);

      if (!holdCreatedTrackedRef.current) {
        holdCreatedTrackedRef.current = true;
        track("checkout_hold_created", {
          stay: property.slug,
          mode: testMode ? "test" : "live",
        });
      }`,
    "hold created analytics",
  );

  c = replaceOnce(
    c,
    `  const handleVerificationComplete = useCallback(async () => {
    setVerificationComplete(true);
  }, []);

  const handlePolicyAccepted = useCallback(async () => {
    if (!hold) return;
    setPolicyComplete(true);
    await startPayment(hold);
  }, [hold, startPayment]);`,
    `  const handleVerificationComplete = useCallback(async () => {
    setVerificationComplete(true);

    if (!verificationTrackedRef.current) {
      verificationTrackedRef.current = true;
      track("checkout_email_verified", {
        stay: property.slug,
        mode: testMode ? "test" : "live",
      });
    }
  }, [property.slug, testMode]);

  const handlePolicyAccepted = useCallback(async () => {
    if (!hold) return;
    setPolicyComplete(true);

    if (!policyTrackedRef.current) {
      policyTrackedRef.current = true;
      track("checkout_policies_accepted", {
        stay: property.slug,
        mode: testMode ? "test" : "live",
      });
    }

    await startPayment(hold);
  }, [hold, property.slug, startPayment, testMode]);`,
    "verification and policy analytics",
  );

  c = replaceOnce(
    c,
    `        ) : !clientSecret ? (
          <>
            <div className={styles.guestGrid}>`,
    `        ) : !clientSecret ? (
          <>
            <div className={styles.estimateCard}>
              <div className={styles.estimateHeading}>
                <div>
                  <small>Price estimate</small>
                  <strong>See the total before entering your details</strong>
                </div>
                {estimateBusy ? <span>Updating…</span> : null}
              </div>

              {estimateError ? (
                <div className={styles.estimateError}>
                  {estimateError}
                </div>
              ) : estimate ? (
                <div className={styles.estimateRows}>
                  <div>
                    <span>Lodging</span>
                    <b>
                      {money(
                        estimate.quote?.lodging_subtotal_before_discount_cents ??
                          estimate.quote?.lodging_subtotal_cents ??
                          0,
                        estimate.quote?.currency || "USD",
                      )}
                    </b>
                  </div>

                  {(estimate.quote?.discount_cents ?? 0) > 0 ? (
                    <div className={styles.discountRow}>
                      <span>
                        Promo {estimate.quote?.promotion?.code || ""}
                      </span>
                      <b>
                        −{money(
                          estimate.quote?.discount_cents ?? 0,
                          estimate.quote?.currency || "USD",
                        )}
                      </b>
                    </div>
                  ) : null}

                  {estimate.quote?.fee_lines?.map((line) => (
                    <div key={line.id}>
                      <span>{line.label}</span>
                      <b>
                        {money(
                          line.amount_cents,
                          estimate.quote?.currency || "USD",
                        )}
                      </b>
                    </div>
                  ))}

                  {estimate.quote?.add_on_lines?.map((line) => (
                    <div key={line.id}>
                      <span>{line.name}</span>
                      <b>
                        {money(
                          line.amount_cents,
                          estimate.quote?.currency || "USD",
                        )}
                      </b>
                    </div>
                  ))}

                  <div>
                    <span>Estimated taxes</span>
                    <b>
                      {money(
                        estimate.taxTotalCents,
                        estimate.quote?.currency || "USD",
                      )}
                    </b>
                  </div>

                  <div className={styles.estimateTotal}>
                    <span>Estimated total</span>
                    <b>
                      {money(
                        estimate.guestTotalCents,
                        estimate.quote?.currency || "USD",
                      )}
                    </b>
                  </div>
                </div>
              ) : (
                <p className={styles.estimateLoading}>
                  Calculating the stay total…
                </p>
              )}

              <p className={styles.estimateNote}>
                This estimate uses the selected dates, guests, pets, fees,
                extras, promo code and configured taxes. The final total is
                confirmed when your dates are held.
              </p>
            </div>

            <div className={styles.guestGrid}>`,
    "estimate card",
  );

  c = replaceOnce(
    c,
    `              <TurnstileWidget
                siteKey={turnstileSiteKey}
                resetSignal={turnstileReset}
                onToken={handleTurnstileToken}
              />`,
    `              <TurnstileWidget
                siteKey={turnstileSiteKey}
                resetSignal={turnstileReset}
                onToken={handleTurnstileToken}
                analyticsSlug={property.slug}
                analyticsMode={testMode ? "test" : "live"}
              />`,
    "Turnstile analytics props",
  );

  c = replaceOnce(
    c,
    `              <StripePaymentForm
                reservationId={hold.reservationId}
                checkoutToken={hold.checkoutToken}
                confirmationCode={hold.confirmationCode}
                testMode={testMode}
              />`,
    `              <StripePaymentForm
                reservationId={hold.reservationId}
                checkoutToken={hold.checkoutToken}
                confirmationCode={hold.confirmationCode}
                testMode={testMode}
                slug={property.slug}
              />`,
    "StripePaymentForm slug usage",
  );

  write(path, c);
}

function patchGuestCheckoutCss() {
  const path = "components/GuestCheckout.module.css";
  let c = read(path);

  const marker = `.discountRow b {
  color: #42634c;
}
`;

  const addition = `.discountRow b {
  color: #42634c;
}

.estimateCard {
  display: grid;
  gap: 12px;
  margin: 0 0 22px;
  padding: 16px;
  border: 1px solid #d9d2c7;
  border-radius: 13px;
  background: #faf8f4;
}

.estimateHeading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.estimateHeading > div {
  display: grid;
  gap: 3px;
}

.estimateHeading small {
  color: #315f4b;
  font-size: .62rem;
  font-weight: 850;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.estimateHeading strong {
  color: #27322e;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.05rem;
  font-weight: 500;
}

.estimateHeading > span {
  color: #6f756f;
  font-size: .66rem;
  white-space: nowrap;
}

.estimateRows {
  display: grid;
  border-top: 1px solid #e1dbd1;
}

.estimateRows > div {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 9px 0;
  border-bottom: 1px solid #e1dbd1;
  font-size: .76rem;
}

.estimateRows span {
  color: #6c726d;
}

.estimateTotal {
  font-size: .9rem !important;
}

.estimateTotal span,
.estimateTotal b {
  color: #253d34;
}

.estimateNote,
.estimateLoading {
  margin: 0;
  color: #737873;
  font-size: .68rem;
  line-height: 1.5;
}

.estimateError {
  padding: 10px 11px;
  border: 1px solid #dfc1b4;
  border-radius: 9px;
  background: #fff4ef;
  color: #7b4635;
  font-size: .7rem;
  line-height: 1.45;
}
`;

  c = replaceOnce(c, marker, addition, "GuestCheckout estimate CSS");
  write(path, c);
}

function patchOnboardingTaxSetup() {
  const path = "components/onboarding/OnboardingTaxSetup.tsx";
  let c = read(path);

  c = replaceOnce(
    c,
    `<strong>Statewide rules are handled automatically.</strong>
        <p>
          {config.intro} You only need to enter the local taxes that
          apply to this specific property.
        </p>
      </div>

      {config.reviewNote ? (`,
    `<strong>Automatic statewide taxes are already handled.</strong>
        <p>{config.intro}</p>
      </div>

      <div className={styles.automaticNotice}>
        <strong>Do not enter a combined state + local tax rate.</strong>
        <span>
          The fields below are for the remaining local city/county,
          lodging, tourism, hotel or A&amp;P taxes only. If a tax total
          you were given already includes the statewide tax, remove the
          statewide portion before entering the local rate here.
        </span>
      </div>

      {config.reviewNote ? (`,
    "Onboarding automatic-tax notice",
  );

  write(path, c);
}

function patchOnboardingTaxCss() {
  const path = "components/onboarding/OnboardingTaxSetup.module.css";
  let c = read(path);

  const marker = `.reviewNote {
  padding: 11px 13px;
  border: 1px solid #e2ccb0;
  border-radius: 11px;
  background: #fbf3e8;
  color: #76532f;
  font-size: .69rem;
  line-height: 1.5;
}
`;

  const addition = `${marker}
.automaticNotice {
  display: grid;
  gap: 4px;
  padding: 12px 13px;
  border: 1px solid #cbdccf;
  border-radius: 11px;
  background: #f1f6f2;
}

.automaticNotice strong {
  color: #315f4b;
  font-size: .72rem;
}

.automaticNotice span {
  color: #5f6b64;
  font-size: .68rem;
  line-height: 1.5;
}
`;

  c = replaceOnce(c, marker, addition, "Onboarding tax notice CSS");
  write(path, c);
}

function patchPropertyTaxFields() {
  const path = "components/taxes/PropertyTaxLineFields.tsx";
  let c = read(path);

  c = replaceOnce(
    c,
    `  return (
    <div className={styles.wrapper}>
      <div className={styles.heading}>`,
    `  return (
    <div className={styles.wrapper}>
      <div className={styles.automaticNotice}>
        <strong>Statewide taxes are already added automatically.</strong>
        <span>
          Do not paste a combined state + local tax total here. Enter only
          the remaining local city/county, lodging, tourism, hotel or A&amp;P
          rate that applies to this property.
        </span>
      </div>

      <div className={styles.heading}>`,
    "Property tax automatic notice",
  );

  write(path, c);
}

function patchPropertyTaxCss() {
  const path = "components/taxes/PropertyTaxLineFields.module.css";
  let c = read(path);

  const marker = `.wrapper {
  display: grid;
  gap: 12px;
}
`;

  const addition = `${marker}
.automaticNotice {
  display: grid;
  gap: 4px;
  padding: 11px 12px;
  border: 1px solid #cbdccf;
  border-radius: 11px;
  background: #f1f6f2;
}

.automaticNotice strong {
  color: #315f4b;
  font-size: .74rem;
}

.automaticNotice span {
  color: #5f6b64;
  font-size: .67rem;
  line-height: 1.5;
}
`;

  c = replaceOnce(c, marker, addition, "Property tax notice CSS");
  write(path, c);
}

function main() {
  const required = [
    "components/GuestCheckout.tsx",
    "components/GuestCheckout.module.css",
    "components/onboarding/OnboardingTaxSetup.tsx",
    "components/onboarding/OnboardingTaxSetup.module.css",
    "components/taxes/PropertyTaxLineFields.tsx",
    "components/taxes/PropertyTaxLineFields.module.css",
  ];

  for (const path of required) {
    if (!fs.existsSync(path)) {
      throw new Error(
        `Run this from the Find A Place Booking repository root. Missing: ${path}`,
      );
    }
  }

  const snapshots = new Map(
    required.map((path) => [path, read(path)]),
  );

  try {
    patchGuestCheckout();
    patchGuestCheckoutCss();
    patchOnboardingTaxSetup();
    patchOnboardingTaxCss();
    patchPropertyTaxFields();
    patchPropertyTaxCss();
  } catch (error) {
    for (const [path, content] of snapshots) {
      write(path, content);
    }
    throw error;
  }

  console.log("Booking-flow polish applied successfully.");
  console.log("Next: run npm run typecheck && npm run build");
  console.log("Then apply Supabase migration 20261001173000_guest_checkout_estimate.sql.");
}

main();
