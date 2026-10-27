import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/DashboardShell";
import { AdminRecoveryOfferForm } from "@/components/AdminRecoveryOfferForm";
import { loadManualOfferContext } from "@/lib/bookings/manual-targeted-offer";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { sendHostIndividualOffer } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency" ,currency }).format(Number(cents) / 100);
}

export default async function HostIndividualRecoveryOffer({
  params, searchParams,
}: {
  params: Promise<{ reservationId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [{ reservationId }, query, userClient] = await Promise.all([params, searchParams, createClient()]);
  const { data: claims } = await userClient.auth.getClaims();
  if (!claims?.claims?.sub || !UUID.test(reservationId)) notFound();

  let offer: Awaited<ReturnType<typeof loadManualOfferContext>> | null = null;
  let failure: string | null = null;
  try {
    offer = await loadManualOfferContext({
      admin: createAdminClient(), userClient,
      reservationId, environment: stripeEnvironment(),
    });
  } catch (error) {
    // Don't expose reservation data to users not authorized for its property.
    const message = error instanceof Error ? error.message : "Unable to load this checkout.";
    if (message.includes("cannot send offers") || message === "Reservation not found.") notFound();
    failure = message;
  }

  return (
    <DashboardShell active="Booking recovery" title="Personal recovery offer" eyebrow="Host dashboard">
      <div className="property-editor-heading">
        <Link href="/host/reservations">← Back to reservations</Link>
        <span className="status-pill status-muted">Individual offer</span>
      </div>
      {query.saved ? <div className="admin-message success">{query.saved}</div> : null}
      {query.error ? <div className="admin-message error">{query.error}</div> : null}
      <section className="panel">
        <p className="eyebrow dark">Unfinished checkout</p>
        <h2>Send a personal discount</h2>
        {offer ? (
          <>
            <div className="setting-row"><span>Property</span><strong>{offer.propertyName}</strong></div>
            <div className="setting-row"><span>Guest</span><strong>{offer.reservation.guest_name || "Guest"}</strong></div>
            <div className="setting-row"><span>Email</span><strong>{offer.reservation.guest_email || "Not provided"}</strong></div>
            <div className="setting-row"><span>Dates</span><strong>{offer.reservation.check_in} → {offer.reservation.check_out}</strong></div>
            <div className="setting-row"><span>Original guest total</span><strong>{money(offer.reservation.guest_total_cents, offer.reservation.currency)}</strong></div>
            {offer.reason ? (
              <div className="admin-message error">Offer unavailable: {offer.reason}</div>
            ) : (
              <AdminRecoveryOfferForm
                reservationId={offer.reservation.id}
                lodgingCents={offer.lodgingCents}
                guestTotalCents={offer.reservation.guest_total_cents}
                currency={offer.reservation.currency}
                action={sendHostIndividualOffer}
              />
            )}
          </>
        ) : (
          <p className="admin-message error">{failure || "Unable to review this offer."}</p>
        )}
        <p className="muted" style={{ marginTop: 18 }}>
          Every offer requires your approval. The existing email, unique one-use code, 48-hour expiration, unsubscribe and availability checks are reused. No payment, tax, reservation or calendar hold is changed by sending an offer.
        </p>
      </section>
    </DashboardShell>
  );
}
