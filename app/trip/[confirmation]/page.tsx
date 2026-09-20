import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingReceipt } from "@/components/BookingReceipt";
import { Footer } from "@/components/Footer";
import { GuestTripTools } from "@/components/GuestTripTools";
import { Header } from "@/components/Header";
import { PrintReceiptButton } from "@/components/PrintReceiptButton";
import { taxLinesFromSnapshot } from "@/lib/bookings/financial-display";
import { guestCheckoutTokenMatches } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ confirmation: string }>;
  searchParams: Promise<{
    reservationId?: string;
    checkoutToken?: string;
  }>;
}) {
  const [{ confirmation }, query] = await Promise.all([params, searchParams]);

  const reservationId = query.reservationId?.trim() || "";
  const checkoutToken = query.checkoutToken?.trim() || "";

  if (
    !reservationId ||
    !checkoutToken ||
    !guestCheckoutTokenMatches(reservationId, checkoutToken)
  ) {
    return (
      <>
        <Header />
        <main className="guest-state-wrap">
          <section className="shell standalone-empty guest-state-card">
            <p className="eyebrow dark">Your trip</p>
            <h1>Open your secure trip link.</h1>
            <p>
              Use the reservation link from your Find A Place confirmation to
              view booking details and message your host.
            </p>
            <Link href="/stays" className="button">
              Find a stay
            </Link>
          </section>
        </main>
        <Footer />
      </>
    );
  }

  const admin = createAdminClient();
  const { data: reservation } = await admin
    .from("reservations")
    .select(
      "id,confirmation_code,property_id,status,check_in,check_out,guest_name,guest_count,pet_count,pricing_snapshot,pre_tax_total_cents,tax_total_cents,tax_snapshot,guest_total_cents,currency,payment_status",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (
    !reservation ||
    reservation.confirmation_code !== confirmation ||
    reservation.status !== "CONFIRMED"
  ) {
    notFound();
  }

  const { data: property } = await admin
    .from("properties")
    .select("name,public_area,city,region_code")
    .eq("id", reservation.property_id)
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const canReview = reservation.check_out <= today;

  return (
    <>
      <Header />
      <main className="guest-state-wrap">
        <div className="shell">
          <section className="panel">
            <p className="eyebrow dark">Your trip</p>
            <h1>{property?.name || "Your Find A Place stay"}</h1>
            <p>
              Confirmation <strong>{reservation.confirmation_code}</strong>
            </p>

            <div className="dash-grid metrics">
              <div>
                <span>Check in</span>
                <strong>{reservation.check_in}</strong>
              </div>
              <div>
                <span>Check out</span>
                <strong>{reservation.check_out}</strong>
              </div>
              <div>
                <span>Guests</span>
                <strong>{reservation.guest_count}</strong>
                <small>{reservation.pet_count} pet(s)</small>
              </div>
              <div>
                <span>Total</span>
                <strong>
                  {money(reservation.guest_total_cents, reservation.currency)}
                </strong>
                <small>{reservation.payment_status.replaceAll("_", " ")}</small>
              </div>
            </div>
          </section>

          <section className="panel">
            <p className="eyebrow dark">Receipt</p>
            <h2>What you paid</h2>
            <BookingReceipt
              pricingSnapshot={reservation.pricing_snapshot}
              preTaxTotalCents={Number(reservation.pre_tax_total_cents)}
              taxTotalCents={Number(reservation.tax_total_cents)}
              guestTotalCents={Number(reservation.guest_total_cents)}
              currency={reservation.currency}
              taxLines={taxLinesFromSnapshot(reservation.tax_snapshot)}
            />
            <PrintReceiptButton />
          </section>

          <GuestTripTools
            reservationId={reservation.id}
            checkoutToken={checkoutToken}
            canReview={canReview}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
