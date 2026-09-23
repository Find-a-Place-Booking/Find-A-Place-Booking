"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";

import { GuestPolicyAcceptance } from "@/components/GuestPolicyAcceptance";
import { GuestVerification } from "@/components/GuestVerification";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import styles from "./GuestCheckout.module.css";

type PropertySummary = {
  unitId: string;
  slug: string;
  name: string;
  location: string;
  image?: string | null;
  maxGuests: number;
  addOns: Array<{
    id: string;
    name: string;
    description: string | null;
    amountCents: number;
    calculation: string;
  }>;
};

type Props = {
  property: PropertySummary;
  checkIn: string;
  checkOut: string;
  guests: number;
  publishableKey: string;
  testMode: boolean;
  turnstileSiteKey: string;
  initialReservationId?: string | null;
  initialCheckoutToken?: string | null;
};

type PricingQuote = {
  currency?: string;
  lodging_subtotal_before_discount_cents?: number;
  lodging_subtotal_cents?: number;
  discount_cents?: number;
  promotion?: {
    code?: string;
    label?: string;
  } | null;
  fee_lines?: Array<{
    id: string;
    type: string;
    label: string;
    amount_cents: number;
  }>;
  add_on_lines?: Array<{
    id: string;
    name: string;
    calculation: string;
    amount_cents: number;
  }>;
  pre_tax_total_cents?: number;
};

type Hold = {
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

type BookingStatus = {
  reservationId: string;
  confirmationCode: string;
  status: string;
  paymentStatus: string;
  holdExpiresAt?: string | null;
  guestTotalCents: number;
  taxTotalCents: number;
  platformCommissionCents: number;
  pricingSnapshot?: PricingQuote | null;
};

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function addOnChargeLabel(calculation: string) {
  if (calculation === "PER_NIGHT") return "per night";
  if (calculation === "PER_PERSON") return "per guest";
  if (calculation === "PER_PERSON_PER_NIGHT") return "per guest / night";
  return "per stay";
}

function persistCheckoutInUrl(
  reservationId: string,
  checkoutToken: string,
) {
  const url = new URL(window.location.href);
  url.searchParams.set("reservationId", reservationId);
  url.searchParams.set("checkoutToken", checkoutToken);
  window.history.replaceState({}, "", url.toString());
}

function confirmedUrl(
  reservationId: string,
  checkoutToken: string,
  confirmationCode: string,
) {
  return (
    `${window.location.origin}/booking/confirmed` +
    `?reservationId=${encodeURIComponent(reservationId)}` +
    `&checkoutToken=${encodeURIComponent(checkoutToken)}` +
    `&code=${encodeURIComponent(confirmationCode)}`
  );
}

function StripePaymentForm({
  reservationId,
  checkoutToken,
  confirmationCode,
  testMode,
}: {
  reservationId: string;
  checkoutToken: string;
  confirmationCode: string;
  testMode: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!stripe || !elements || busy) return;

    setBusy(true);
    setError(null);

    const returnUrl = confirmedUrl(
      reservationId,
      checkoutToken,
      confirmationCode,
    );

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
      },
      redirect: "if_required",
    });

    if (result.error) {
      setError(
        result.error.message || "Stripe could not complete the payment.",
      );
      setBusy(false);
      return;
    }

    window.location.assign(returnUrl);
  }

  return (
    <form className={styles.paymentForm} onSubmit={submit}>
      <PaymentElement />

      {error ? <div className={styles.error}>{error}</div> : null}

      <button
        className="button button-full"
        type="submit"
        disabled={!stripe || busy}
      >
        {busy ? "Processing payment…" : "Pay securely"}
      </button>

      {testMode ? (
        <small>
          Stripe test mode. Use 4242 4242 4242 4242 with any future expiry.
        </small>
      ) : (
        <small>Secure payment processing is provided by Stripe.</small>
      )}
    </form>
  );
}

export function GuestCheckout({
  property,
  checkIn,
  checkOut,
  guests,
  publishableKey,
  testMode,
  turnstileSiteKey,
  initialReservationId,
  initialCheckoutToken,
}: Props) {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [pets, setPets] = useState(0);
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>([]);
  const [promotionCode, setPromotionCode] = useState("");
  const [hold, setHold] = useState<Hold | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [identityStripePromise, setIdentityStripePromise] =
    useState<PromiseLike<Stripe | null> | null>(null);
  const [paymentStripePromise, setPaymentStripePromise] =
    useState<PromiseLike<Stripe | null> | null>(null);
  const [busy, setBusy] = useState(
    Boolean(initialReservationId && initialCheckoutToken),
  );
  const [error, setError] = useState<string | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState<number | null>(null);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [policyComplete, setPolicyComplete] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  useEffect(() => {
    // Keep the platform Stripe.js instance available for the optional
    // identity-verification feature. With the default feature flag off,
    // no Identity session is created and it is not a booking gate.
    setIdentityStripePromise(loadStripe(publishableKey));
  }, [publishableKey]);

  const startPayment = useCallback(async (targetHold: Hold) => {
    setBusy(true);
    setError(null);

    try {
      const paymentResponse = await fetch("/api/booking/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reservationId: targetHold.reservationId,
          checkoutToken: targetHold.checkoutToken,
        }),
      });

      const paymentPayload = await paymentResponse.json();

      if (
        paymentResponse.ok &&
        paymentPayload.reservationStatus === "CONFIRMED"
      ) {
        window.location.replace(
          confirmedUrl(
            targetHold.reservationId,
            targetHold.checkoutToken,
            paymentPayload.confirmationCode || targetHold.confirmationCode,
          ),
        );
        return;
      }

      if (!paymentResponse.ok) {
        throw new Error(
          paymentPayload.error || "Unable to start Stripe payment.",
        );
      }

      if (paymentPayload.paymentIntentStatus === "succeeded") {
        window.location.replace(
          confirmedUrl(
            targetHold.reservationId,
            targetHold.checkoutToken,
            targetHold.confirmationCode,
          ),
        );
        return;
      }

      if (!paymentPayload.clientSecret || !paymentPayload.connectedAccountId) {
        throw new Error("Stripe payment session is unavailable.");
      }

      // Direct-charge PaymentIntents live on the host's connected Stripe
      // account, so Stripe.js must be initialized in that account context.
      setPaymentStripePromise(
        loadStripe(publishableKey, {
          stripeAccount: paymentPayload.connectedAccountId,
        }),
      );
      setClientSecret(paymentPayload.clientSecret);
    } catch (paymentError) {
      setError(
        paymentError instanceof Error
          ? paymentError.message
          : "Unable to start Stripe payment.",
      );
    } finally {
      setBusy(false);
    }
  }, [publishableKey]);

  useEffect(() => {
    if (!initialReservationId || !initialCheckoutToken) return;

    const reservationId = initialReservationId;
    const checkoutToken = initialCheckoutToken;
    let cancelled = false;

    async function resumeExistingReservation() {
      setBusy(true);
      setError(null);

      try {
        const statusResponse = await fetch(
          `/api/booking/status?reservationId=${encodeURIComponent(
            reservationId,
          )}&checkoutToken=${encodeURIComponent(checkoutToken)}`,
          { cache: "no-store" },
        );

        const statusPayload = await statusResponse.json();

        if (!statusResponse.ok) {
          throw new Error(
            statusPayload.error || "Unable to recover this booking.",
          );
        }

        const status = statusPayload as BookingStatus;

        if (status.status === "CONFIRMED") {
          window.location.replace(
            confirmedUrl(
              reservationId,
              checkoutToken,
              status.confirmationCode,
            ),
          );
          return;
        }

        const resumedHold: Hold = {
          reservationId,
          checkoutToken,
          confirmationCode: status.confirmationCode,
          holdExpiresAt: status.holdExpiresAt || new Date().toISOString(),
          guestTotalCents: status.guestTotalCents,
          taxTotalCents: status.taxTotalCents,
          platformCommissionCents: status.platformCommissionCents,
          commissionRateBps: 0,
          quote: status.pricingSnapshot ?? null,
        };

        if (!cancelled) {
          setHold(resumedHold);
          setSelectedAddOnIds(
            status.pricingSnapshot?.add_on_lines?.map((line) => line.id) ?? [],
          );
          setPromotionCode(status.pricingSnapshot?.promotion?.code ?? "");
          setVerificationComplete(false);
          setPolicyComplete(false);
        }
      } catch (resumeError) {
        if (!cancelled) {
          setError(
            resumeError instanceof Error
              ? resumeError.message
              : "Unable to recover this booking.",
          );
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }

    resumeExistingReservation();

    return () => {
      cancelled = true;
    };
  }, [initialReservationId, initialCheckoutToken]);


  useEffect(() => {
    if (!hold?.holdExpiresAt) {
      setHoldSecondsLeft(null);
      return;
    }

    function updateHoldTimer() {
      const expiresAt = new Date(hold!.holdExpiresAt).getTime();
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setHoldSecondsLeft(seconds);
    }

    updateHoldTimer();
    const timer = window.setInterval(updateHoldTimer, 1000);

    return () => window.clearInterval(timer);
  }, [hold?.holdExpiresAt]);

  const checkoutStage = !hold
    ? 0
    : !verificationComplete
      ? 1
      : !policyComplete
        ? 2
        : 3;

  const holdTimeLabel =
    holdSecondsLeft == null
      ? null
      : holdSecondsLeft <= 0
        ? "Hold expired"
        : `${Math.floor(holdSecondsLeft / 60)}:${String(
            holdSecondsLeft % 60,
          ).padStart(2, "0")}`;

  const nights = useMemo(() => {
    const start = new Date(`${checkIn}T12:00:00`);
    const end = new Date(`${checkOut}T12:00:00`);

    return Math.max(
      0,
      Math.round((end.getTime() - start.getTime()) / 86400000),
    );
  }, [checkIn, checkOut]);

  async function createHold() {
    setBusy(true);
    setError(null);

    try {
      const holdResponse = await fetch("/api/booking/hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: property.unitId,
          checkIn,
          checkOut,
          guests,
          pets,
          addOnIds: selectedAddOnIds,
          promotionCode: promotionCode.trim() || null,
          guestName,
          guestEmail,
          guestPhone,
          turnstileToken,
        }),
      });

      const holdPayload = await holdResponse.json();

      if (!holdResponse.ok) {
        throw new Error(holdPayload.error || "Unable to hold these dates.");
      }

      const nextHold = holdPayload as Hold;

      persistCheckoutInUrl(
        nextHold.reservationId,
        nextHold.checkoutToken,
      );

      setVerificationComplete(false);
      setPolicyComplete(false);
      setClientSecret(null);
      setPaymentStripePromise(null);
      setHold(nextHold);
    } catch (requestError) {
      setTurnstileToken("");
      setTurnstileReset((value) => value + 1);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to start checkout.",
      );
    } finally {
      setBusy(false);
    }
  }

  const handleVerificationComplete = useCallback(async () => {
    setVerificationComplete(true);
  }, []);

  const handlePolicyAccepted = useCallback(async () => {
    if (!hold) return;
    setPolicyComplete(true);
    await startPayment(hold);
  }, [hold, startPayment]);

  async function retryHeldPayment() {
    if (!hold) return;
    setVerificationComplete(true);
    setPolicyComplete(true);
    await startPayment(hold);
  }

  return (
    <div className={styles.layout}>
      <section className={styles.checkoutCard}>
        <p className="eyebrow dark">
          {testMode ? "Test checkout" : "Secure checkout"}
        </p>
        <h1>Complete your booking</h1>

        <div className={styles.progress} aria-label="Booking progress">
          {["Details", "Verify", "Review", "Pay"].map((label, index) => (
            <div
              className={`${styles.progressItem} ${
                index < checkoutStage
                  ? styles.progressDone
                  : index === checkoutStage
                    ? styles.progressActive
                    : ""
              }`}
              key={label}
            >
              <span>{index < checkoutStage ? "✓" : index + 1}</span>
              <strong>{label}</strong>
            </div>
          ))}
        </div>

        {!hold ? (
          <p className={styles.stageIntro}>
            Add the booking contact details, optional extras and any promo code.
            We will hold the dates before email verification and payment.
          </p>
        ) : null}

        {busy &&
        initialReservationId &&
        initialCheckoutToken &&
        !hold ? (
          <p>Recovering your booking…</p>
        ) : hold && !clientSecret ? (
          <>
            <div className={styles.holdNotice}>
              <strong>Your dates are held while you finish checkout</strong>
              <span>Reservation {hold.confirmationCode}</span>
              {holdTimeLabel ? (
                <span className={styles.holdTimer}>
                  <b>{holdTimeLabel}</b>
                  <small>{holdSecondsLeft === 0 ? "Choose dates again if payment will not start." : "remaining on this hold"}</small>
                </span>
              ) : null}
            </div>

            {!verificationComplete && identityStripePromise ? (
              <GuestVerification
                reservationId={hold.reservationId}
                checkoutToken={hold.checkoutToken}
                guestEmail={guestEmail}
                stripePromise={identityStripePromise}
                testMode={testMode}
                onVerified={handleVerificationComplete}
              />
            ) : verificationComplete && !policyComplete ? (
              <GuestPolicyAcceptance
                reservationId={hold.reservationId}
                checkoutToken={hold.checkoutToken}
                onAccepted={handlePolicyAccepted}
              />
            ) : verificationComplete && policyComplete ? (
              <>
                {error ? <div className={styles.error}>{error}</div> : null}
                {busy ? (
                  <p>Loading secure payment…</p>
                ) : error ? (
                  <button
                    className="button button-full"
                    type="button"
                    onClick={retryHeldPayment}
                  >
                    Retry secure payment
                  </button>
                ) : (
                  <p>Loading secure payment…</p>
                )}
              </>
            ) : (
              <p>Loading verification…</p>
            )}
          </>
        ) : !clientSecret ? (
          <>
            <div className={styles.guestGrid}>
              <label>
                <span>Name</span>
                <input
                  autoComplete="name"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                />
              </label>

              <label>
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={guestEmail}
                  onChange={(event) => setGuestEmail(event.target.value)}
                />
              </label>

              <label>
                <span>Phone</span>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={guestPhone}
                  onChange={(event) => setGuestPhone(event.target.value)}
                />
              </label>

              <label>
                <span>Pets</span>
                <select
                  value={pets}
                  onChange={(event) => setPets(Number(event.target.value))}
                >
                  {[0, 1, 2, 3, 4].map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.extrasSection}>
              {property.addOns.length ? (
                <div className={styles.extrasList}>
                  <strong>Optional extras</strong>
                  {property.addOns.map((addOn) => (
                    <label className={styles.addOnOption} key={addOn.id}>
                      <input
                        type="checkbox"
                        checked={selectedAddOnIds.includes(addOn.id)}
                        onChange={(event) =>
                          setSelectedAddOnIds((current) =>
                            event.target.checked
                              ? current.includes(addOn.id)
                                ? current
                                : [...current, addOn.id]
                              : current.filter((id) => id !== addOn.id),
                          )
                        }
                      />
                      <span>
                        <b>{addOn.name}</b>
                        {addOn.description ? <small>{addOn.description}</small> : null}
                      </span>
                      <em>
                        {money(addOn.amountCents)} {addOnChargeLabel(addOn.calculation)}
                      </em>
                    </label>
                  ))}
                </div>
              ) : null}

              <label className={styles.promoField}>
                <span>Promo code <small>optional</small></span>
                <input
                  value={promotionCode}
                  maxLength={40}
                  autoCapitalize="characters"
                  onChange={(event) => setPromotionCode(event.target.value)}
                  placeholder="Enter code"
                />
              </label>
            </div>

            <small>
              We verify the booking email before payment. Your phone number is
              saved for reservation contact but is not verified by text message.
            </small>

            {error ? <div className={styles.error}>{error}</div> : null}

            {turnstileSiteKey ? (
              <TurnstileWidget
                siteKey={turnstileSiteKey}
                resetSignal={turnstileReset}
                onToken={handleTurnstileToken}
              />
            ) : testMode ? (
              <small>Security verification is bypassed in this test environment.</small>
            ) : null}

            <button
              className="button button-full"
              type="button"
              onClick={createHold}
              disabled={
                busy ||
                !guestName.trim() ||
                !guestEmail.trim() ||
                !guestPhone.trim() ||
                !checkIn ||
                !checkOut ||
                (Boolean(turnstileSiteKey) && !turnstileToken)
              }
            >
              {busy ? "Checking dates…" : "Continue to secure checkout"}
            </button>
          </>
        ) : paymentStripePromise && hold ? (
          <>
            <div className={styles.holdNotice}>
              <strong>Your dates are still held for payment</strong>
              <span>Reservation {hold.confirmationCode}</span>
              {holdTimeLabel ? (
                <span className={styles.holdTimer}>
                  <b>{holdTimeLabel}</b>
                  <small>{holdSecondsLeft === 0 ? "This hold may need to be restarted." : "remaining on this hold"}</small>
                </span>
              ) : null}
            </div>

            <div className={styles.paymentStage}>
              <div className={styles.paymentHeading}>
                <small>Final step</small>
                <strong>Pay securely</strong>
                <span>
                  Review the total at right, then complete payment through the
                  host&apos;s connected Stripe account.
                </span>
              </div>

            <Elements
              stripe={paymentStripePromise}
              options={{
                clientSecret,
                appearance: {
                  theme: "stripe",
                },
              }}
            >
              <StripePaymentForm
                reservationId={hold.reservationId}
                checkoutToken={hold.checkoutToken}
                confirmationCode={hold.confirmationCode}
                testMode={testMode}
              />
            </Elements>
            </div>
          </>
        ) : (
          <>
            {error ? <div className={styles.error}>{error}</div> : null}
            <p>Loading secure payment…</p>
          </>
        )}
      </section>

      <aside className={styles.summary}>
        {property.image ? (
          <img src={property.image} alt={property.name} />
        ) : null}

        <strong>{property.name}</strong>
        <span>{property.location}</span>

        <div className={styles.summaryRows}>
          <div><span>Check in</span><b>{checkIn}</b></div>
          <div><span>Check out</span><b>{checkOut}</b></div>
          <div><span>Nights</span><b>{nights}</b></div>
          <div><span>Guests</span><b>{guests}</b></div>

          {hold?.quote ? (
            <>
              <div>
                <span>Lodging</span>
                <b>
                  {money(
                    hold.quote.lodging_subtotal_before_discount_cents ??
                      hold.quote.lodging_subtotal_cents ??
                      0,
                    hold.quote.currency || "USD",
                  )}
                </b>
              </div>

              {(hold.quote.discount_cents ?? 0) > 0 ? (
                <div className={styles.discountRow}>
                  <span>
                    Promo {hold.quote.promotion?.code || ""}
                  </span>
                  <b>
                    −{money(
                      hold.quote.discount_cents ?? 0,
                      hold.quote.currency || "USD",
                    )}
                  </b>
                </div>
              ) : null}

              {hold.quote.fee_lines?.map((line) => (
                <div key={line.id}>
                  <span>{line.label}</span>
                  <b>{money(line.amount_cents, hold.quote?.currency || "USD")}</b>
                </div>
              ))}

              {hold.quote.add_on_lines?.map((line) => (
                <div key={line.id}>
                  <span>{line.name}</span>
                  <b>{money(line.amount_cents, hold.quote?.currency || "USD")}</b>
                </div>
              ))}
            </>
          ) : null}

          {hold?.taxTotalCents ? (
            <div><span>Taxes</span><b>{money(hold.taxTotalCents, hold.quote?.currency || "USD")}</b></div>
          ) : null}

          {hold ? (
            <div className={styles.total}>
              <span>Total</span>
              <b>{money(hold.guestTotalCents, hold.quote?.currency || "USD")}</b>
            </div>
          ) : null}
        </div>

        {testMode ? (
          <small>
            Stripe test mode is active. No live money will move.
          </small>
        ) : (
          <small>
            Your payment is processed securely by Stripe for the host.
          </small>
        )}
      </aside>
    </div>
  );
}
