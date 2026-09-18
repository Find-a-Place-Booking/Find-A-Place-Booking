import Link from "next/link";

import { BookingConfirmation } from "@/components/BookingConfirmation";
import { Brand } from "@/components/Brand";

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{
    code?: string;
    reservationId?: string;
    checkoutToken?: string;
  }>;
}) {
  const params = await searchParams;

  const publishableKey =
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
  const testMode = publishableKey.startsWith("pk_test_");

  const tripHref =
    params.code && params.reservationId && params.checkoutToken
      ? `/trip/${encodeURIComponent(
          params.code,
        )}?reservationId=${encodeURIComponent(
          params.reservationId,
        )}&checkoutToken=${encodeURIComponent(params.checkoutToken)}`
      : null;

  return (
    <main className="confirm-page">
      <header className="checkout-header shell">
        <Brand />
        <span>Your reservation</span>
      </header>

      <section className="confirm-card guest-state-card">
        {params.code && params.reservationId && params.checkoutToken ? (
          <BookingConfirmation
            confirmationCode={params.code}
            reservationId={params.reservationId}
            checkoutToken={params.checkoutToken}
            testMode={testMode}
          />
        ) : (
          <>
            <p className="eyebrow dark">No trip loaded</p>
            <h1>There isn’t a reservation to display here.</h1>
            <p>Return to the stays page to start a booking.</p>
          </>
        )}

        {tripHref ? (
          <Link className="button" href={tripHref}>
            Open your trip
          </Link>
        ) : (
          <Link className="button" href="/stays">
            Find another stay
          </Link>
        )}

        <Link className="confirm-secondary" href="/">
          Back to Find A Place
        </Link>
      </section>
    </main>
  );
}
