import Link from "next/link";

import { Brand } from "@/components/Brand";
import { CheckoutBrandExit } from "@/components/CheckoutBrandExit";
import { CheckoutExitLink } from "@/components/CheckoutExitLink";
import { GuestCheckout } from "@/components/GuestCheckout";
import { getPublishedListingBySlug } from "@/lib/public/listings";
import { createAdminClient } from "@/lib/supabase/admin";
import styles from "./CheckoutSubtotal.module.css";

type InitialQuote = {
  currency?: string;
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

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

async function getInitialQuote(input: {
  unitId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}) {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("quote_unit_stay", {
      target_unit_id: input.unitId,
      check_in_date: input.checkIn,
      check_out_date: input.checkOut,
      guest_count: input.guests,
      pet_count: 0,
      selected_add_on_ids: [],
      promotion_code: null,
    });

    if (error || !data) {
      console.warn("[checkout subtotal] initial quote unavailable", {
        code: error?.code,
        message: error?.message,
      });
      return null;
    }

    return data as InitialQuote;
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

  const initialQuote = await getInitialQuote({
    unitId: property.unitId,
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    guests,
  });

  const currency = initialQuote?.currency || "USD";
  const lodgingCents =
    initialQuote?.lodging_subtotal_before_discount_cents ??
    initialQuote?.lodging_subtotal_cents ??
    0;
  const subtotalCents = Number(initialQuote?.pre_tax_total_cents || 0);
  const feeLines = initialQuote?.fee_lines ?? [];

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
              <span>Stay subtotal</span>
              <strong>{money(subtotalCents, currency)}</strong>
              <small>Before taxes and extras.</small>
            </div>

            <div className={styles.breakdown}>
              <div>
                <span>Lodging</span>
                <b>{money(lodgingCents, currency)}</b>
              </div>

              {feeLines.map((line) => (
                <div key={line.id}>
                  <span>{line.label}</span>
                  <b>{money(Number(line.amount_cents || 0), currency)}</b>
                </div>
              ))}
            </div>
          </section>
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
        />
      </div>
    </main>
  );
}
