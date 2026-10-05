import Link from "next/link";

import { Brand } from "@/components/Brand";
import { CheckoutRecoveryResume } from "@/components/CheckoutRecoveryResume";

export default async function CheckoutResumePage({
  searchParams,
}: {
  searchParams: Promise<{
    reservationId?: string;
    checkoutToken?: string;
  }>;
}) {
  const params = await searchParams;
  const reservationId = params.reservationId?.trim() || "";
  const checkoutToken = params.checkoutToken?.trim() || "";

  return (
    <main className="checkout-page">
      <header className="checkout-header shell">
        <Brand />
        <Link href="/stays">Browse stays</Link>
      </header>

      <section className="shell standalone-empty checkout-empty guest-state-card">
        <p className="eyebrow dark">Finish your booking</p>
        <h1>Ready to continue?</h1>
        <p>
          We released your previous hold when you left checkout. Tap continue
          and we&apos;ll check those dates again. If they&apos;re still open,
          we&apos;ll place them back on a short hold and return you to checkout.
        </p>

        {reservationId && checkoutToken ? (
          <CheckoutRecoveryResume
            reservationId={reservationId}
            checkoutToken={checkoutToken}
          />
        ) : (
          <Link className="button" href="/stays">
            Find a stay
          </Link>
        )}

        <small>
          Your dates are not held again until you choose to continue.
        </small>
      </section>
    </main>
  );
}
