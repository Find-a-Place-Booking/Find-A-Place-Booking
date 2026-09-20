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
      "id,confirmation_code,property_id,status,check_in,check_out,guest_name,guest_count,pet_count,pricing_snapshot,pre_tax_total_cents,tax_total_cents,tax_snapshot,guest_total_cents,currency,payment_status,cancelled_at",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (
    !reservation ||
    reservation.confirmation_code !== confirmation ||
    !["CONFIRMED", "CANCELLED"].includes(reservation.status)
  ) {
    notFound();
  }

  const [{ data: property }, { data: refund }] = await Promise.all([
    admin
      .from("properties")
      .select("name,public_area,city,region_code")
      .eq("id", reservation.property_id)
      .maybeSingle(),
    reservation.status === "CANCELLED"
      ? admin
          .from("refunds")
          .select("status,amount_cents,created_at")
          .eq("reservation_id", reservation.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const canReview =
    reservation.status === "CONFIRMED" && reservation.check_out <= today;

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
                <span>{reservation.status === "CANCELLED" ? "Booking" : "Total"}</span>
                <strong>
                  {reservation.status === "CANCELLED"
                    ? "Cancelled"
                    : money(reservation.guest_total_cents, reservation.currency)}
                </strong>
                <small>{reservation.payment_status.replaceAll("_", " ")}</small>
              </div>
            </div>
          </section>

          {reservation.status === "CANCELLED" ? (
            <section className="panel">
              <p className="eyebrow dark">Cancellation record</p>
              <h2>This reservation was cancelled.</h2>
              <div className="setting-row">
                <span>Cancelled</span>
                <strong>
                  {reservation.cancelled_at
                    ? new Date(reservation.cancelled_at).toLocaleString("en-US")
                    : "Recorded"}
                </strong>
              </div>
              <div className="setting-row">
                <span>Refund status</span>
                <strong>{refund?.status?.replaceAll("_", " ") || "No refund record"}</strong>
              </div>
              {refund ? (
                <div className="setting-row">
                  <span>Refund amount</span>
                  <strong>{money(Number(refund.amount_cents || 0), reservation.currency)}</strong>
                </div>
              ) : null}
              <p className="muted">
                This secure page remains available as the booking and payment record.
              </p>
            </section>
          ) : null}

          <section className="panel">
            <p className="eyebrow dark">Receipt</p>
            <h2>{reservation.status === "CANCELLED" ? "Original booking total" : "What you paid"}</h2>
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

          {reservation.status === "CONFIRMED" ? (
            <GuestTripTools
              reservationId={reservation.id}
              checkoutToken={checkoutToken}
              canReview={canReview}
            />
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  );
}
