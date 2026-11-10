import Link from "next/link";

import { Brand } from "@/components/Brand";
import { CheckoutBrandExit } from "@/components/CheckoutBrandExit";
import { CheckoutExitLink } from "@/components/CheckoutExitLink";
import { DirectBookingValue } from "@/components/DirectBookingValue";
import { GuestCheckout } from "@/components/GuestCheckout";
import { getPublishedListingBySlug } from "@/lib/public/listings";
import { getPublicIntroOfferForUnit } from "@/lib/public/intro-offers";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import styles from "./CheckoutSubtotal.module.css";
import "./checkout-no-pets.css";

type InitialQuote = {
  currency?: string;
  discount_cents?: number;
  lodging_subtotal_before_discount_cents?: number;
  lodging_subtotal_cents?: number;
  fee_lines?: Array<{
    id: string;
    type: string;
    label: string;
    amount_cents: number;
  }>;
  pre_tax_total_cents?: number;
};

type InitialEstimate = {
  quote: InitialQuote;
  guest_total_cents?: number;
  tax_total_cents?: number;
};

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

async function getInitialQuote(input: {
  unitId: string;
  promotionCode?: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
}): Promise<InitialEstimate | null> {
  try {
    const admin = createAdminClient();
    const args = {
      target_unit_id: input.unitId,
      check_in_date: input.checkIn,
      check_out_date: input.checkOut,
      guest_count: input.guests,
      pet_count: 0,
      selected_add_on_ids: [],
      promotion_code: input.promotionCode || null,
    };
    // The staged fee quote includes mandatory guest fees in the displayed total.
    // Do not expose an incomplete service-fee breakdown if the new RPC fails.
    const { data, error } = await admin.rpc("fap_quote_guest_checkout_estimate_v2", {
      ...args,
      requested_payment_environment: stripeEnvironment(),
    });

    if (!error && data) {
      const estimate = data as {
        quote?: InitialQuote;
        guest_total_cents?: number;
        tax_total_cents?: number;
      };
      if (estimate.quote) return { ...estimate, quote: estimate.quote };
    }

    // Backwards compatible with the production DB before migration runs.
    if (error && (error.code === "PGRST202" || error.code === "42883" ||
      /could not find the function|does not exist/i.test(error.message || ""))) {
      const legacy = await admin.rpc("quote_unit_stay", args);
      if (!legacy.error && legacy.data) {
        return { quote: legacy.data as InitialQuote };
      }
    }

    console.warn("[checkout subtotal] initial quote unavailable", {
      code: error?.code,
      message: error?.message,
    });
    return null;
  } catch (error) {
    // Price preview is helpful, but it must never become a booking gate.
    console.warn("[checkout subtotal] initial quote failed", error);
    return null;
  }
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{
    stay?: string;
    checkIn?: string;
    checkOut?: string;
    guests?: string;
    reservationId?: string;
    checkoutToken?: string;
  }>;
}) {
  const params = await searchParams;
  const checkoutEnabled = process.env.BOOKING_CHECKOUT_ENABLED === "true";

  if (!checkoutEnabled) {
    return (
      <main className="checkout-page">
        <header className="checkout-header shell">
          <Brand />
          <Link href="/stays">← Back to stays</Link>
        </header>

        <section className="shell standalone-empty checkout-empty guest-state-card">
          <p className="eyebrow dark">Booking</p>
          <h1>Booking is temporarily unavailable.</h1>
          <p>
            Browse stays for now and try checkout again shortly.
          </p>
          <Link className="button" href="/stays">Find a stay</Link>
        </section>
      </main>
    );
  }

  if (!params.stay || !params.checkIn || !params.checkOut) {
    return (
      <main className="checkout-page">
        <header className="checkout-header shell">
          <Brand />
          <Link href="/stays">← Back to stays</Link>
        </header>

        <section className="shell standalone-empty checkout-empty guest-state-card">
          <p className="eyebrow dark">Booking</p>
          <h1>Choose dates first.</h1>
          <p>Open a stay and choose dates before checkout.</p>
          <Link className="button" href="/stays">Find a stay</Link>
        </section>
      </main>
    );
  }

  const property = await getPublishedListingBySlug(params.stay);

  if (!property) {
    return (
      <main className="checkout-page">
        <header className="checkout-header shell">
          <Brand />
          <Link href="/stays">← Back to stays</Link>
        </header>

        <section className="shell standalone-empty checkout-empty guest-state-card">
          <h1>Stay not found.</h1>
          <Link className="button" href="/stays">Find a stay</Link>
        </section>
      </main>
    );
  }

  const publishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

  if (!publishableKey) {
    throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured.");
  }

  const testMode = publishableKey.startsWith("pk_test_");

  const guests = Math.max(
    1,
    Math.min(property.sleeps, Number(params.guests || 1) || 1),
  );

  const introOffer = (params.reservationId && params.checkoutToken)
    ? null
    : await getPublicIntroOfferForUnit(property.unitId);
  const initialEstimate = await getInitialQuote({
    promotionCode: introOffer?.code || null,
    unitId: property.unitId,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    guests,
  });
  const initialQuote = initialEstimate?.quote ?? null;

  const currency = initialQuote?.currency || "USD";
  const lodgingCents =
    initialQuote?.lodging_subtotal_before_discount_cents ??
    initialQuote?.lodging_subtotal_cents ??
    0;
  const subtotalCents = Number(initialQuote?.pre_tax_total_cents || 0);
  const estimatedTotalCents = Number(initialEstimate?.guest_total_cents || 0);
  const taxTotalCents = Number(initialEstimate?.tax_total_cents || 0);
  const feeLines = initialQuote?.fee_lines ?? [];
  const petsAllowed = property.policies.some((policy) =>
    policy.trim().toLowerCase() === "pets allowed",
  );

  return (
    <main className="checkout-page">
      <header className="checkout-header shell">
        <CheckoutBrandExit />
        <CheckoutExitLink href={`/stays/${property.slug}`}>
          Edit dates or guests
        </CheckoutExitLink>
      </header>

      <div className="shell">
        {initialQuote && subtotalCents > 0 ? (
          <section
            className={styles.subtotalCard}
            aria-label="Estimated stay subtotal"
          >
            <div className={styles.subtotalLead}>
              <span>{estimatedTotalCents > 0 ? "Estimated total with taxes" : "Stay subtotal"}</span>
              <strong>{money(estimatedTotalCents > 0 ? estimatedTotalCents : subtotalCents, currency)}</strong>
              <small>For these dates and guests, before optional extras. The final total is shown before payment.</small>
            </div>

            <div className={styles.breakdown}>
              <div>
                <span>Lodging</span>
                <b>{money(lodgingCents, currency)}</b>
              </div>

              {Number(initialQuote?.discount_cents || 0) > 0 ? (
                <div><span>New host offer · 25% off lodging</span><b>−{money(Number(initialQuote?.discount_cents || 0), currency)}</b></div>
              ) : null}
              {feeLines.map((line, index) => (
                <div key={line.id || `${line.type}-${index}`}>
                  <span>{line.label}</span>
                  <b>{money(Number(line.amount_cents || 0), currency)}</b>
                </div>
              ))}
              {estimatedTotalCents > 0 ? (
                <div>
                  <span>Estimated taxes</span>
                  <b>{money(taxTotalCents, currency)}</b>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <DirectBookingValue compact unitId={property.unitId} checkIn={params.checkIn} checkOut={params.checkOut} guests={guests} currency={currency} />

        <div className={petsAllowed ? undefined : "checkout-no-pets"}>
          {!petsAllowed ? (
            <p className="checkout-no-pets-notice" role="note">
              <span aria-hidden="true">ⓘ</span> No pets allowed at this stay. Pet selection is unavailable.
            </p>
          ) : null}
          <GuestCheckout
            property={{
              unitId: property.unitId,
              slug: property.slug,
              name: property.name,
              location: property.location,
              image: property.images[0] || null,
              maxGuests: property.sleeps,
              addOns: property.addOns,
            }}
            checkIn={params.checkIn}
            checkOut={params.checkOut}
            guests={guests}
            publishableKey={publishableKey}
            testMode={testMode}
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""}
            initialReservationId={params.reservationId || null}
            initialCheckoutToken={params.checkoutToken || null}
            initialPromotionCode={introOffer?.code || ""}
          />
        </div>
      </div>
    </main>
  );
}
