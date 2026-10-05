"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";

import { AvailabilityDatePicker } from "@/components/AvailabilityDatePicker";

import styles from "./BookingCardEnhancements.module.css";

type Props = {
  unitId: string;
  slug: string;
  price: number;
  rating: number;
  maxGuests: number;
  minimumStayNights: number;
  checkoutEnabled: boolean;
  testMode: boolean;
};

type PricingQuote = {
  currency?: string;
  lodging_subtotal_before_discount_cents?: number;
  lodging_subtotal_cents?: number;
  discount_cents?: number;
  fee_lines?: Array<{
    id: string;
    label: string;
    amount_cents: number;
  }>;
  pre_tax_total_cents?: number;
};

type Estimate = {
  quote: PricingQuote | null;
  taxTotalCents: number;
  guestTotalCents: number;
  collectionMode: string;
};

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function utcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function nightsBetween(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut || checkOut <= checkIn) return 0;

  return Math.max(
    0,
    Math.round(
      (utcDate(checkOut).getTime() - utcDate(checkIn).getTime()) /
        86_400_000,
    ),
  );
}

export function BookingCard({
  unitId,
  slug,
  price,
  maxGuests,
  minimumStayNights,
  checkoutEnabled,
  testMode,
}: Props) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateUnavailable, setEstimateUnavailable] = useState(false);
  const [dateVerification, setDateVerification] = useState<
    "idle" | "checking" | "valid" | "invalid" | "fallback"
  >("idle");

  const nights = useMemo(
    () => nightsBetween(checkIn, checkOut),
    [checkIn, checkOut],
  );

  useEffect(() => {
    function applyTripContext(source: URL) {
      const carriedCheckIn = source.searchParams.get("checkin") || "";
      const carriedCheckOut = source.searchParams.get("checkout") || "";
      const carriedGuests = Number.parseInt(
        source.searchParams.get("guests") || "",
        10,
      );

      if (
        /^\d{4}-\d{2}-\d{2}$/.test(carriedCheckIn) &&
        /^\d{4}-\d{2}-\d{2}$/.test(carriedCheckOut) &&
        carriedCheckOut > carriedCheckIn
      ) {
        setCheckIn(carriedCheckIn);
        setCheckOut(carriedCheckOut);
      }

      if (Number.isFinite(carriedGuests)) {
        setGuests(Math.max(1, Math.min(maxGuests, carriedGuests)));
      }
    }

    const current = new URL(window.location.href);
    if (
      current.searchParams.has("checkin") ||
      current.searchParams.has("checkout")
    ) {
      applyTripContext(current);
      return;
    }

    try {
      const saved = JSON.parse(
        window.sessionStorage.getItem("find-a-place:stay-browse-state") ||
          "null",
      ) as {
        url?: string;
        target?: string;
        savedAt?: number;
      } | null;

      const recent =
        typeof saved?.savedAt === "number" &&
        Date.now() - saved.savedAt < 12 * 60 * 60 * 1000;

      if (!recent || !saved?.url || !saved?.target) return;

      const target = new URL(saved.target, window.location.origin);
      if (target.pathname !== window.location.pathname) return;

      applyTripContext(new URL(saved.url, window.location.origin));
    } catch {
      // Direct property visits continue with blank dates.
    }
  }, [maxGuests]);

  useEffect(() => {
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setDateVerification("idle");
      return;
    }

    const controller = new AbortController();
    setDateVerification("checking");

    async function verifySelectedDates() {
      try {
        const query = new URLSearchParams({
          unitId,
          from: checkIn,
          to: checkOut,
        });

        const response = await fetch(
          `/api/booking/availability?${query.toString()}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || "Availability check unavailable");
        }

        const blockedRanges = Array.isArray(payload?.blockedRanges)
          ? payload.blockedRanges
          : [];
        const stayRules = Array.isArray(payload?.stayRules)
          ? payload.stayRules
          : [];
        const baseMinimum = Math.max(
          1,
          Number(payload?.minimumStayNights || minimumStayNights || 1),
        );
        const matchingRule = stayRules.find(
          (rule: {
            start?: string;
            end?: string;
            minimumNights?: number;
          }) =>
            typeof rule?.start === "string" &&
            typeof rule?.end === "string" &&
            rule.start <= checkIn &&
            rule.end >= checkIn,
        );
        const requiredMinimum = Math.max(
          1,
          Number(matchingRule?.minimumNights || baseMinimum),
        );

        let blocked = false;
        for (
          let night = checkIn;
          night < checkOut;
          night = new Date(
            utcDate(night).getTime() + 86_400_000,
          )
            .toISOString()
            .slice(0, 10)
        ) {
          if (
            blockedRanges.some(
              (range: { start?: string; end?: string }) =>
                typeof range?.start === "string" &&
                typeof range?.end === "string" &&
                range.start <= night &&
                range.end > night,
            )
          ) {
            blocked = true;
            break;
          }
        }

        if (nightsBetween(checkIn, checkOut) < requiredMinimum || blocked) {
          setDateVerification("invalid");
          return;
        }

        setDateVerification("valid");
      } catch (error) {
        if (controller.signal.aborted) return;

        // Do not dead-end a guest because this extra reassurance check failed.
        // The existing reservation hold still performs the authoritative check.
        setDateVerification("fallback");
      }
    }

    void verifySelectedDates();

    return () => controller.abort();
  }, [
    checkIn,
    checkOut,
    minimumStayNights,
    unitId,
  ]);

  useEffect(() => {
    setEstimate(null);
    setEstimateUnavailable(false);

    if (
      !checkoutEnabled ||
      !checkIn ||
      !checkOut ||
      checkOut <= checkIn ||
      !["valid", "fallback"].includes(dateVerification)
    ) {
      setEstimateLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setEstimateLoading(true);

      try {
        const response = await fetch("/api/booking/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({
            unitId,
            checkIn,
            checkOut,
            guests,
            pets: 0,
            addOnIds: [],
            promotionCode: null,
          }),
        });

        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || "Estimate unavailable");
        }

        setEstimate({
          quote: payload?.quote ?? null,
          taxTotalCents: Number(payload?.taxTotalCents || 0),
          guestTotalCents: Number(payload?.guestTotalCents || 0),
          collectionMode:
            typeof payload?.collectionMode === "string"
              ? payload.collectionMode
              : "HOST_SELF_REMIT",
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setEstimateUnavailable(true);
      } finally {
        if (!controller.signal.aborted) setEstimateLoading(false);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    checkIn,
    checkOut,
    checkoutEnabled,
    guests,
    unitId,
    dateVerification,
  ]);

  if (!checkoutEnabled) {
    return (
      <aside className="booking-card booking-card-disabled">
        <div className="booking-price">
          <strong>${price}</strong>
          <span>/ night</span>
          <b>Listed on Find A Place</b>
        </div>

        <div className="availability-note">
          <span>●</span>
          <strong>Online booking is unavailable</strong>
        </div>

        <div className="booking-coming-soon">
          <strong>This stay cannot be booked online right now.</strong>
          <p>Browse the listing details and check back later.</p>
        </div>

        <button className="button button-full" type="button" disabled>
          Booking unavailable
        </button>
      </aside>
    );
  }

  const quote = estimate?.quote;
  const currency = quote?.currency || "USD";
  const lodgingCents =
    quote?.lodging_subtotal_before_discount_cents ??
    quote?.lodging_subtotal_cents ??
    0;
  const discountCents = Number(quote?.discount_cents || 0);

  return (
    <aside className="booking-card">
      <div className="booking-price">
        <strong>${price}</strong>
        <span>/ night</span>
        <b>{testMode ? "Test booking" : "Book on Find A Place"}</b>
      </div>

      <div className="availability-note">
        <span>{checkIn && checkOut ? "✓" : "●"}</span>
        <strong>
          {testMode
            ? "Test checkout enabled"
            : checkIn && checkOut
              ? dateVerification === "checking" || dateVerification === "idle"
                ? "Checking these dates against live availability…"
                : dateVerification === "invalid"
                  ? "These dates are no longer available · choose another range"
                  : dateVerification === "fallback"
                    ? "Dates selected · availability will be confirmed again"
                    : "Available for these dates · ready to reserve"
              : "Live availability · choose your dates"}
        </strong>
      </div>

      <AvailabilityDatePicker
        unitId={unitId}
        minimumStayNights={minimumStayNights}
        checkIn={checkIn}
        checkOut={checkOut}
        onChange={(dates) => {
          setEstimate(null);
          setEstimateUnavailable(false);
          setDateVerification("checking");
          setCheckIn(dates.checkIn);
          setCheckOut(dates.checkOut);
        }}
      />

      <div className="booking-dates">
        <label className="full">
          <span>Guests</span>
          <select
            value={guests}
            onChange={(event) => {
              setEstimate(null);
              setEstimateUnavailable(false);
              setGuests(Number(event.target.value));
            }}
          >
            {Array.from({ length: Math.max(1, maxGuests) }, (_, index) => (
              <option value={index + 1} key={index + 1}>
                {index + 1} guest{index ? "s" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {checkIn && checkOut ? (
        <div className={styles.estimate} aria-live="polite">
          <div className={styles.estimateHead}>
            <div>
              <span>Estimated trip total</span>
              <small>
                {nights} night{nights === 1 ? "" : "s"} · {guests} guest
                {guests === 1 ? "" : "s"}
              </small>
            </div>

            {estimate ? (
              <strong>
                {money(estimate.guestTotalCents, currency)}
              </strong>
            ) : null}
          </div>

          {dateVerification === "checking" || dateVerification === "idle" ? (
            <div className={styles.estimateLoading}>
              Confirming these dates against the live calendar…
            </div>
          ) : dateVerification === "invalid" ? (
            <div className={styles.estimateUnavailable}>
              Those dates are no longer open for this stay. Choose another
              available range in the calendar above.
            </div>
          ) : estimateLoading ? (
            <div className={styles.estimateLoading}>
              Calculating the current rate, fees and taxes…
            </div>
          ) : estimate ? (
            <>
              <div className={styles.estimateRows}>
                <div>
                  <span>Lodging</span>
                  <b>{money(lodgingCents, currency)}</b>
                </div>

                {discountCents > 0 ? (
                  <div className={styles.discount}>
                    <span>Discount</span>
                    <b>−{money(discountCents, currency)}</b>
                  </div>
                ) : null}

                {quote?.fee_lines?.map((line) => (
                  <div key={line.id}>
                    <span>{line.label}</span>
                    <b>{money(line.amount_cents, currency)}</b>
                  </div>
                ))}

                {estimate.taxTotalCents > 0 ? (
                  <div>
                    <span>Taxes</span>
                    <b>{money(estimate.taxTotalCents, currency)}</b>
                  </div>
                ) : null}

                <div className={styles.totalRow}>
                  <span>Estimated total</span>
                  <b>{money(estimate.guestTotalCents, currency)}</b>
                </div>
              </div>

              <small className={styles.estimateNote}>
                No charge yet. Final pricing is shown again before payment.
                Optional extras and pets are not included here.
                {estimate.collectionMode === "HOST_SELF_REMIT"
                  ? " Any taxes handled directly by the host may be additional."
                  : ""}
              </small>
            </>
          ) : estimateUnavailable ? (
            <div className={styles.estimateUnavailable}>
              We couldn&apos;t refresh the total here, but you can still reserve
              these dates and review the complete price before payment.
            </div>
          ) : null}
        </div>
      ) : (
        <div className={styles.chooseDatesPrompt}>
          <strong>See your trip total before checkout</strong>
          <span>
            Pick dates and we&apos;ll show the current lodging, required fees and
            taxes here before you continue.
          </span>
        </div>
      )}

      <button
        className="button button-full"
        type="button"
        disabled={
          !checkIn ||
          !checkOut ||
          !["valid", "fallback"].includes(dateVerification)
        }
        onClick={() => {
          track("checkout_started", {
            slug,
            mode: testMode ? "test" : "live",
          });

          const query = new URLSearchParams({
            stay: slug,
            checkIn,
            checkOut,
            guests: String(guests),
          });

          router.push(`/checkout?${query.toString()}`);
        }}
      >
        Reserve these dates
      </button>

      <small className="secure-note">
        {testMode
          ? "Stripe test mode. No live money will move."
          : checkIn && checkOut
            ? dateVerification === "invalid"
              ? "Choose another available date range to continue."
              : ["valid", "fallback"].includes(dateVerification)
                ? "🔒 No charge yet · we’ll hold these dates before payment · secure checkout by Stripe."
                : "Checking live availability before you continue…"
            : "🔒 Secure checkout · no charge until you review the final total and confirm payment."}
      </small>
    </aside>
  );
}
