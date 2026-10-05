import Link from "next/link";
import { notFound } from "next/navigation";

import { DashboardShell } from "@/components/DashboardShell";
import { createClient } from "@/lib/supabase/server";

import { hostCancelReservation } from "../../host-cancel-actions";

function money(cents: number | null | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(cents ?? 0) / 100);
}

function readable(value: string | null | undefined) {
  return (value || "—")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function date(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function HostCancelReservationPage({
  params,
}: {
  params: Promise<{ reservationId: string }>;
}) {
  const { reservationId } = await params;
  const supabase = await createClient();

  const { data: reservation, error } = await supabase
    .from("reservations")
    .select(
      "id,confirmation_code,property_id,status,check_in,check_out,guest_name,guest_email,currency,guest_total_cents,payment_status",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error) throw new Error("Unable to load reservation.");
  if (!reservation) notFound();

  const [{ data: property }, { data: payment }] = await Promise.all([
    supabase
      .from("properties")
      .select("name")
      .eq("id", reservation.property_id)
      .maybeSingle(),
    supabase
      .from("payments")
      .select("status,amount_cents,currency")
      .eq("reservation_id", reservation.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const canRefund =
    reservation.status === "CONFIRMED" &&
    Boolean(payment) &&
    ["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment!.status);

  return (
    <DashboardShell
      active="Reservations"
      title="Cancel / refund"
      eyebrow={reservation.confirmation_code}
    >
      <div className="property-editor-heading">
        <Link href={`/host/reservations/${reservation.id}`}>
          ← Back to reservation
        </Link>
        <span className="status-pill">{readable(reservation.status)}</span>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Booking</p>
            <h2>{property?.name || "Property"}</h2>
          </div>
        </div>

        <div className="dash-grid metrics">
          <div>
            <span>Guest</span>
            <strong>{reservation.guest_name || "Guest"}</strong>
            <small>{reservation.guest_email || "No guest email"}</small>
          </div>
          <div>
            <span>Dates</span>
            <strong>
              {date(reservation.check_in)} → {date(reservation.check_out)}
            </strong>
            <small>These dates release when cancellation completes</small>
          </div>
          <div>
            <span>Guest total</span>
            <strong>
              {money(reservation.guest_total_cents, reservation.currency)}
            </strong>
            <small>Original reservation total</small>
          </div>
          <div>
            <span>Payment</span>
            <strong>{readable(payment?.status || reservation.payment_status)}</strong>
            <small>
              {payment
                ? `${money(payment.amount_cents, payment.currency)} Stripe charge`
                : "No refundable payment record"}
            </small>
          </div>
        </div>
      </section>

      {reservation.status !== "CONFIRMED" ? (
        <section className="panel">
          <div className="panel-empty">
            <strong>This reservation is no longer confirmed.</strong>
            <span>
              Cancel/refund actions are only available for an active confirmed
              reservation.
            </span>
          </div>
        </section>
      ) : (
        <div className="dash-two">
          <section className="panel">
            <p className="eyebrow dark">Refund guest</p>
            <h2>Cancel + refund</h2>
            <p className="muted">
              This cancels the reservation, releases the dates, and submits the
              remaining refundable guest charge against your connected Stripe
              payment. Find A Place&apos;s platform commission remains
              non-refundable.
            </p>

            {canRefund ? (
              <form className="settings-form" action={hostCancelReservation}>
                <input
                  type="hidden"
                  name="reservation_id"
                  value={reservation.id}
                />
                <input type="hidden" name="mode" value="FULL_REFUND" />

                <label>
                  <span>Reason shown to the guest</span>
                  <textarea
                    name="reason"
                    rows={4}
                    placeholder="Why are you cancelling this reservation?"
                    required
                  />
                </label>

                <label>
                  <span>
                    <input
                      name="confirm"
                      type="checkbox"
                      value="yes"
                      required
                    />{" "}
                    I understand this cancels the reservation, releases the
                    dates, and submits the remaining guest refund to Stripe.
                  </span>
                </label>

                <button className="button button-small" type="submit">
                  Cancel + refund guest
                </button>
              </form>
            ) : (
              <div className="panel-empty">
                <strong>Refund is not available from this payment state.</strong>
                <span>
                  Current payment:{" "}
                  {payment
                    ? readable(payment.status)
                    : readable(reservation.payment_status)}
                  . A successful or partially refunded Stripe payment is
                  required.
                </span>
              </div>
            )}
          </section>

          <section className="panel status-danger">
            <p className="eyebrow dark">No refund</p>
            <h2>Cancel without refund</h2>
            <p>
              This immediately cancels the reservation and releases the dates,
              but does not submit money back to the guest. Use it only when the
              property terms and your agreement with the guest support that
              outcome.
            </p>

            <form className="settings-form" action={hostCancelReservation}>
              <input
                type="hidden"
                name="reservation_id"
                value={reservation.id}
              />
              <input type="hidden" name="mode" value="NO_REFUND" />

              <label>
                <span>Reason shown to the guest</span>
                <textarea
                  name="reason"
                  rows={4}
                  placeholder="Why is this reservation being cancelled without a refund?"
                  required
                />
              </label>

              <label>
                <span>
                  <input
                    name="confirm"
                    type="checkbox"
                    value="yes"
                    required
                  />{" "}
                  I understand this cancels the reservation and does not submit
                  a guest refund through Find A Place.
                </span>
              </label>

              <button className="button button-small button-quiet" type="submit">
                Cancel without refund
              </button>
            </form>
          </section>
        </div>
      )}

      <section className="panel">
        <p className="muted">
          If the guest already submitted a cancellation request, this action
          uses that existing request instead of creating a duplicate. All
          cancellation/refund activity remains attached to the reservation
          record for audit and support.
        </p>
      </section>
    </DashboardShell>
  );
}
