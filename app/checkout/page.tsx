import Link from "next/link";

import { Brand } from "@/components/Brand";
import { SandboxGuestCheckout } from "@/components/SandboxGuestCheckout";
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
  }>;
}) {
  const params = await searchParams;
  const sandboxEnabled = process.env.BOOKING_SANDBOX_ENABLED === "true";

  if (!sandboxEnabled) {
    return (
      <main className="checkout-page">
        <header className="checkout-header shell">
          <Brand />
          <Link href="/stays">← Back to stays</Link>
        </header>
        <section className="shell standalone-empty checkout-empty guest-state-card">
          <p className="eyebrow dark">Booking</p>
          <h1>Online booking opens soon.</h1>
          <p>
            Dates and secure checkout remain closed while payment testing is
            completed.
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
          <p className="eyebrow dark">Sandbox booking</p>
          <h1>Choose dates first.</h1>
          <p>Open a published stay and choose test dates before checkout.</p>
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

  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  if (!publishableKey) {
    throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured.");
  }

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
        <SandboxGuestCheckout
          property={{
            unitId: property.unitId,
            slug: property.slug,
            name: property.name,
            location: property.location,
            image: property.images[0] || null,
            maxGuests: property.sleeps,
          }}
          checkIn={params.checkIn}
          checkOut={params.checkOut}
          guests={guests}
          publishableKey={publishableKey}
          initialReservationId={params.reservationId || null}
        />
      </div>
    </main>
  );
}
