import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingReceipt } from "@/components/BookingReceipt";
import { Footer } from "@/components/Footer";
import { GuestTripTools } from "@/components/GuestTripTools";
import { Header } from "@/components/Header";
import { PrintReceiptButton } from "@/components/PrintReceiptButton";
import chatStyles from "@/components/ReservationChat.module.css";
import { taxLinesFromSnapshot } from "@/lib/bookings/financial-display";
import { getPublicHostProfileForOrganization } from "@/lib/hosts/public-profile";
import { guestCheckoutTokenMatches } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function readableStatus(value: string | null | undefined) {
  if (!value) return "Not set";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "H";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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
            <h1>Open your reservation from My Trip.</h1>
            <p>
              Enter your reservation number and booking email on My Trip, or use
              the secure link from your confirmation email.
            </p>
            <Link href="/trip" className="button">
              Open My Trip
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
      "id,confirmation_code,property_id,organization_id,status,check_in,check_out,guest_name,guest_count,pet_count,pricing_snapshot,pre_tax_total_cents,tax_total_cents,tax_snapshot,guest_total_cents,currency,payment_status,cancelled_at",
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

  const [{ data: property }, host, { data: refund }] = await Promise.all([
    admin
      .from("properties")
      .select("name,public_area,city,region_code")
      .eq("id", reservation.property_id)
      .maybeSingle(),
    getPublicHostProfileForOrganization(reservation.organization_id),
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
  const hostName = host?.name || property?.name || "Property host";
  const hostDescription =
    host?.publicBio ||
    `${hostName} independently manages this stay. Use My Trip to keep booking questions, change requests and cancellation discussions connected to the reservation.`;

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
                <small>{readableStatus(reservation.payment_status)}</small>
              </div>
            </div>
          </section>

          <section className="panel">
            <p className="eyebrow dark">Your host</p>
            <div className={chatStyles.hostSummary}>
              <div className={chatStyles.hostAvatar}>
                {host?.avatarUrl ? (
                  <img src={host.avatarUrl} alt={`${hostName} host profile`} />
                ) : (
                  initials(hostName)
                )}
              </div>
              <div>
                <small>Hosted by</small>
                <h2>{hostName}</h2>
                <p>
                  Independent host on Find A Place
                  {host?.businessLocation ? ` · ${host.businessLocation}` : ""}
                </p>
              </div>
            </div>
            <p className="muted">{hostDescription}</p>
            {(host?.contactEmail || host?.contactPhone) ? (
              <div className={chatStyles.contactLinks}>
                {host.contactEmail ? (
                  <a
                    className={chatStyles.actionLink}
                    href={`mailto:${host.contactEmail}?subject=${encodeURIComponent(
                      `Find A Place booking ${reservation.confirmation_code}`,
                    )}`}
                  >
                    Email host
                  </a>
                ) : null}
                {host.contactPhone ? (
                  <a className={chatStyles.actionLink} href={`tel:${host.contactPhone}`}>
                    Call host
                  </a>
                ) : null}
                {host.contactPhone ? (
                  <a className={chatStyles.actionLink} href={`sms:${host.contactPhone}`}>
                    Text host
                  </a>
                ) : null}
                <a className={chatStyles.actionLink} href="#messages">
                  Booking messages
                </a>
              </div>
            ) : (
              <p className="muted">Use the booking conversation below to reach the host.</p>
            )}
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
                <strong>
                  {refund?.status ? readableStatus(refund.status) : "No refund record"}
                </strong>
              </div>
              {refund ? (
                <div className="setting-row">
                  <span>Refund amount</span>
                  <strong>
                    {money(Number(refund.amount_cents || 0), reservation.currency)}
                  </strong>
                </div>
              ) : null}
              <p className="muted">
                This page remains available as the booking, payment and host-message
                record.
              </p>
            </section>
          ) : null}

          <section className={`panel ${chatStyles.tripSectionPanel}`}>
            <p className="eyebrow dark">Receipt</p>
            <h2>
              {reservation.status === "CANCELLED"
                ? "Original booking total"
                : "What you paid"}
            </h2>
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
            confirmationCode={reservation.confirmation_code}
            hostName={hostName}
            hostEmail={host?.contactEmail ?? null}
            hostPhone={host?.contactPhone ?? null}
            guestName={reservation.guest_name || "Guest"}
            canReview={canReview}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}
