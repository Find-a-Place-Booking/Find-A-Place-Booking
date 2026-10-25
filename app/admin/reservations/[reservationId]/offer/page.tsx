import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { AdminRecoveryOfferForm } from "@/components/AdminRecoveryOfferForm";
import { getAdminContext } from "@/lib/admin/context";
import { loadManualOfferContext } from "@/lib/bookings/manual-targeted-offer";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { sendIndividualOffer } from "./actions";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default async function ManualReservationOfferPage({
  params, searchParams,
}: {
  params: Promise<{ reservationId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const [{ reservationId }, query, adminContext, userClient] = await Promise.all([
    params, searchParams, getAdminContext(), createClient(),
  ]);
  let context: Awaited<ReturnType<typeof loadManualOfferContext>> | null = null;
  let failure: string | null = null;
  try {
    context = await loadManualOfferContext({
      admin: createAdminClient(), userClient, reservationId,
      environment: stripeEnvironment(),
    });
  } catch (error) {
    failure = error instanceof Error ? error.message : "Unable to load this recovery offer.";
  }

  return (
    <AdminShell active="reservations" eyebrow="Booking recovery · individual offer" title="Send special offer" context={adminContext}>
      <div className="property-editor-heading">
        <Link href={`/admin/reservations/${encodeURIComponent(reservationId)}`}>← Back to booking record</Link>
        <span className="status-pill status-muted">Manual offer</span>
      </div>
      {query.saved ? <div className="admin-message success">{query.saved}</div> : null}
      {query.error ? <div className="admin-message error">{query.error}</div> : null}
      <section className="panel">
        <p className="eyebrow dark">Private, one-to-one recovery</p>
        <h2>Offer a discount on an unfinished checkout</h2>
        {context ? (
          <>
            <div className="setting-row"><span>Property</span><strong>{context.propertyName}</strong></div>
            <div className="setting-row"><span>Guest</span><strong>{context.reservation.guest_name || "Guest"}</strong></div>
            <div className="setting-row"><span>Email</span><strong>{context.reservation.guest_email || "Not provided"}</strong></div>
            <div className="setting-row"><span>Check-in / out</span><strong>{context.reservation.check_in} → {context.reservation.check_out}</strong></div>
            <div className="setting-row"><span>Original guest total</span><strong>{money(Number(context.reservation.guest_total_cents), context.reservation.currency)}</strong></div>
            {context.reason ? (
              <div className="admin-message error">Offer unavailable: {context.reason}</div>
            ) : (
              <AdminRecoveryOfferForm
                reservationId={context.reservation.id}
                lodgingCents={context.lodgingCents}
                guestTotalCents={Number(context.reservation.guest_total_cents)}
                currency={context.reservation.currency}
                action={sendIndividualOffer}
              />
            )}
          </>
        ) : (
          <div className="admin-message error">{failure || "This checkout cannot receive a manual offer."}</div>
        )}
        <p className="muted" style={{ marginTop: 20 }}>
          Sent offers use the normal Find A Place branded email, unique one-use promo code,
          unsubscribe preference and availability checks. Only the authorized property manager
          can approve the discount. Existing booking/payment records are left unchanged.
        </p>
      </section>
    </AdminShell>
  );
}
