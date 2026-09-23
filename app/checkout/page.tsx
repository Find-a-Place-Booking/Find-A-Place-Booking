import Link from "next/link";

import { Brand } from "@/components/Brand";
import { GuestCheckout } from "@/components/GuestCheckout";
import { getPublishedListingBySlug } from "@/lib/public/listings";

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

  return (
    <main className="checkout-page">
      <header className="checkout-header shell">
        <Brand />
        <Link href={`/stays/${property.slug}`}>← Back to stay</Link>
      </header>

      <div className="shell">
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
