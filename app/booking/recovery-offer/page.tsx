import Link from "next/link";

import { Brand } from "@/components/Brand";
import { CopyRecoveryPromoCode } from "@/components/CopyRecoveryPromoCode";
import { getRecoveryOfferByToken } from "@/lib/bookings/recovery-offers";
import { prettyRecoveryDate } from "@/lib/bookings/recovery";
import { createAdminClient } from "@/lib/supabase/admin";

function expiryLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function RecoveryOfferPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() || "";
  const offer = token
    ? await getRecoveryOfferByToken(createAdminClient(), token)
    : null;

  return (
    <main className="checkout-page">
      <header className="checkout-header shell">
        <Brand />
        <Link href="/stays">Browse stays</Link>
      </header>

      {!offer ? (
        <section className="shell standalone-empty checkout-empty guest-state-card">
          <p className="eyebrow dark">Booking offer</p>
          <h1>This offer is no longer available.</h1>
          <p>
            The offer may have expired, already been used, or the original stay
            may no longer be available.
          </p>
          <Link className="button" href="/stays">
            Find another stay
          </Link>
        </section>
      ) : !offer.available ? (
        <section className="shell standalone-empty checkout-empty guest-state-card">
          <p className="eyebrow dark">Booking offer</p>
          <h1>Those dates are no longer open.</h1>
          <p>
            Someone booked or blocked the dates before the offer was completed.
            You can still open the property and choose another available stay.
          </p>
          <Link className="button" href={`/stays/${encodeURIComponent(offer.slug)}`}>
            View {offer.propertyName}
          </Link>
        </section>
      ) : (
        <section className="shell standalone-empty checkout-empty guest-state-card">
          <p className="eyebrow dark">Host recovery offer</p>
          <h1>Save {Math.round(offer.discountBps / 100)}% on the stay you viewed.</h1>
          <p>
            <strong>{offer.propertyName}</strong><br />
            {prettyRecoveryDate(offer.checkIn)} – {prettyRecoveryDate(offer.checkOut)}
          </p>
          <p>
            The host has offered a limited discount for these dates. The code
            below is unique to this recovery offer and applies to the lodging
            price from the stay you were considering.
          </p>

          <div
            style={{
              display: "grid",
              gap: 10,
              width: "min(100%, 430px)",
              padding: 18,
              border: "1px solid #d5d2ca",
              background: "#fff",
              margin: "4px auto 18px",
            }}
          >
            <span style={{ fontSize: ".7rem", fontWeight: 800, textTransform: "uppercase" }}>
              Promo code
            </span>
            <strong style={{ fontSize: "1.3rem", letterSpacing: ".08em" }}>
              {offer.promotionCode}
            </strong>
            <CopyRecoveryPromoCode code={offer.promotionCode} />
          </div>

          <Link className="button" href={offer.checkoutHref}>
            Continue to checkout
          </Link>
          <small style={{ display: "block", marginTop: 12 }}>
            Enter the code above in the Promo code field at checkout. Offer
            expires {expiryLabel(offer.expiresAt)}. Availability is not held
            until checkout creates a reservation hold.
          </small>
        </section>
      )}
    </main>
  );
}
