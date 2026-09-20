import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingReceipt } from "@/components/BookingReceipt";
import { DashboardShell } from "@/components/DashboardShell";
import { createClient } from "@/lib/supabase/server";

import {
  respondToReservationReview,
  sendHostReservationMessage,
} from "../detail-actions";

function money(cents: number | null | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(cents ?? 0) / 100);
}

function readable(value: string | null | undefined) {
  return (value || "—").replaceAll("_", " ");
}

export default async function HostReservationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ reservationId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [{ reservationId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();

  const { data: reservation, error } = await supabase
    .from("reservations")
    .select(
      "id,confirmation_code,property_id,unit_id,status,check_in,check_out,guest_name,guest_email,guest_phone,guest_count,pet_count,currency,pricing_snapshot,pre_tax_total_cents,tax_total_cents,guest_total_cents,platform_commission_cents,commission_tier,commission_rate_bps,payment_provider,payment_status,tax_status,created_at,confirmed_at",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error) throw new Error("Unable to load booking.");
  if (!reservation) notFound();

  const [propertyResult, messagesResult, reviewResult, paymentResult] =
    await Promise.all([
      supabase
        .from("properties")
        .select("id,name")
        .eq("id", reservation.property_id)
        .maybeSingle(),
      supabase
        .from("reservation_messages")
        .select("id,sender_type,body,created_at")
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("reservation_reviews")
        .select(
          "id,rating,body,status,host_response,created_at,host_responded_at",
        )
        .eq("reservation_id", reservationId)
        .maybeSingle(),
      supabase
        .from("payments")
        .select(
          "id,provider,status,provider_payment_id,amount_cents,application_fee_cents,platform_tax_retained_cents,processor_fee_actual_cents,processor_fee_host_share_cents,processor_fee_platform_share_cents,host_proceeds_cents,currency,created_at",
        )
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const property = propertyResult.data;
  const messages = messagesResult.data ?? [];
  const review = reviewResult.data;
  const payment = paymentResult.data;

  return (
    <DashboardShell
      active="Reservations"
      title={reservation.confirmation_code}
      eyebrow="Reservation detail"
    >
      <div className="property-editor-heading">
        <Link href="/host/reservations">← All reservations</Link>
        <span className="status-pill">{readable(reservation.status)}</span>
      </div>

      {query.saved ? (
        <div className="admin-message success">{query.saved}</div>
      ) : null}
      {query.error ? (
        <div className="admin-message error">{query.error}</div>
      ) : null}

      <div className="dash-grid metrics">
        <div>
          <span>Guest total</span>
          <strong>{money(reservation.guest_total_cents, reservation.currency)}</strong>
          <small>{reservation.guest_count} guest(s)</small>
        </div>
        <div>
          <span>Payment</span>
          <strong>{readable(reservation.payment_status)}</strong>
          <small>{reservation.payment_provider || "No processor"}</small>
        </div>
        <div>
          <span>Commission</span>
          <strong>
            {money(
              reservation.platform_commission_cents,
              reservation.currency,
            )}
          </strong>
          <small>{reservation.commission_tier}</small>
        </div>
        <div>
          <span>Taxes collected</span>
          <strong>{money(reservation.tax_total_cents, reservation.currency)}</strong>
          <small>{readable(reservation.tax_status)}</small>
        </div>
      </div>

      <div className="dash-two">
        <section className="panel">
          <p className="eyebrow dark">Guest</p>
          <h2>{reservation.guest_name || "Guest"}</h2>
          <div className="setting-row">
            <span>Email</span>
            <strong>{reservation.guest_email || "Not provided"}</strong>
          </div>
          <div className="setting-row">
            <span>Phone</span>
            <strong>{reservation.guest_phone || "Not provided"}</strong>
          </div>
          <div className="setting-row">
            <span>Guests / pets</span>
            <strong>
              {reservation.guest_count} / {reservation.pet_count}
            </strong>
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow dark">Stay</p>
          <h2>{property?.name || "Property"}</h2>
          <div className="setting-row">
            <span>Dates</span>
            <strong>
              {reservation.check_in} → {reservation.check_out}
            </strong>
          </div>
          <div className="setting-row">
            <span>Created</span>
            <strong>
              {new Date(reservation.created_at).toLocaleString("en-US")}
            </strong>
          </div>
          <div className="setting-row">
            <span>Confirmed</span>
            <strong>
              {reservation.confirmed_at
                ? new Date(reservation.confirmed_at).toLocaleString("en-US")
                : "Not confirmed"}
            </strong>
          </div>
        </section>
      </div>

      <section className="panel">
        <p className="eyebrow dark">Guest receipt</p>
        <h2>Guest price breakdown</h2>
        <BookingReceipt
          pricingSnapshot={reservation.pricing_snapshot}
          preTaxTotalCents={Number(reservation.pre_tax_total_cents)}
          taxTotalCents={Number(reservation.tax_total_cents)}
          guestTotalCents={Number(reservation.guest_total_cents)}
          currency={reservation.currency}
        />
      </section>

      <section className="panel">
        <p className="eyebrow dark">Payment</p>
        <h2>Host settlement</h2>

        {payment ? (
          <>
            <div className="dash-grid metrics">
              <div>
                <span>Guest paid</span>
                <strong>{money(payment.amount_cents, payment.currency)}</strong>
                <small>{payment.provider} · {readable(payment.status)}</small>
              </div>
              <div>
                <span>Taxes collected</span>
                <strong>
                  −{money(payment.platform_tax_retained_cents, payment.currency)}
                </strong>
                <small>Held by Find A Place for remittance</small>
              </div>
              <div>
                <span>Find A Place commission</span>
                <strong>
                  −{money(reservation.platform_commission_cents, payment.currency)}
                </strong>
                <small>{reservation.commission_tier}</small>
              </div>
              <div>
                <span>Payment processing</span>
                <strong>
                  −{money(payment.processor_fee_host_share_cents, payment.currency)}
                </strong>
                <small>
                  Stripe actual: {money(payment.processor_fee_actual_cents, payment.currency)}
                </small>
              </div>
              <div>
                <span>Host proceeds</span>
                <strong>
                  {money(payment.host_proceeds_cents, payment.currency)}
                </strong>
                <small>Amount routed to the connected host account</small>
              </div>
            </div>
            <p className="muted">
              Find A Place commission, taxes held for remittance and the host
              processing charge make up Stripe&apos;s combined application fee.
              They are shown separately here so the settlement is understandable.
            </p>
          </>
        ) : (
          <div className="panel-empty">
            <strong>No payment record yet.</strong>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Booking messages</p>
            <h2>Guest conversation</h2>
          </div>
        </div>

        {messages.length ? (
          <div className="admin-list compact">
            {messages.map((message) => (
              <div className="admin-list-row static" key={message.id}>
                <span>
                  <strong>{message.sender_type}</strong>
                  <small>{message.body}</small>
                </span>
                <span>
                  <small>
                    {new Date(message.created_at).toLocaleString("en-US")}
                  </small>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <strong>No messages yet.</strong>
            <span>The guest can message from their trip page.</span>
          </div>
        )}

        <form className="settings-form" action={sendHostReservationMessage}>
          <input type="hidden" name="reservation_id" value={reservation.id} />
          <label>
            <span>Message guest</span>
            <textarea
              name="body"
              rows={4}
              placeholder="Send an update about check-in, the stay or their booking…"
              required
            />
          </label>
          <button className="button button-small" type="submit">
            Send message
          </button>
        </form>
      </section>

      <section className="panel">
        <p className="eyebrow dark">Verified guest review</p>
        <h2>{review ? `${review.rating}/5` : "No review yet"}</h2>

        {review ? (
          <>
            <p>{review.body || "Guest submitted a rating without written copy."}</p>
            <small>
              Submitted {new Date(review.created_at).toLocaleDateString("en-US")}
            </small>

            {review.host_response ? (
              <div className="review-note-inline">
                <strong>Your response</strong>
                <span>{review.host_response}</span>
              </div>
            ) : (
              <form
                className="settings-form"
                action={respondToReservationReview}
              >
                <input
                  type="hidden"
                  name="reservation_id"
                  value={reservation.id}
                />
                <input type="hidden" name="review_id" value={review.id} />
                <label>
                  <span>Public host response</span>
                  <textarea name="response" rows={4} required />
                </label>
                <button className="button button-small" type="submit">
                  Post response
                </button>
              </form>
            )}
          </>
        ) : (
          <p className="muted">
            Reviews are only accepted from guests tied to a completed
            reservation.
          </p>
        )}
      </section>
    </DashboardShell>
  );
}
