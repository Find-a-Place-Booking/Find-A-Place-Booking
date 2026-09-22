import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingReceipt } from "@/components/BookingReceipt";
import { DashboardShell } from "@/components/DashboardShell";
import chatStyles from "@/components/ReservationChat.module.css";
import { createClient } from "@/lib/supabase/server";

import {
  approveCancellationRequest,
  approveCancellationWithoutRefund,
  approveChangeRequest,
  declineCancellationRequest,
  declineChangeRequest,
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
  return (value || "—")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}


function isLegacyRequestMessage(body: string) {
  const value = body.trim();
  return (
    /^\[change request\]/i.test(value) ||
    /^change request:/i.test(value) ||
    /^i would like to request cancellation of this reservation/i.test(value) ||
    /^cancellation request (approved|declined)/i.test(value) ||
    /^cancellation approved without refund/i.test(value)
  );
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
      "id,confirmation_code,property_id,unit_id,status,check_in,check_out,guest_name,guest_email,guest_phone,guest_count,pet_count,currency,pricing_snapshot,pre_tax_total_cents,tax_total_cents,guest_total_cents,platform_commission_cents,commission_tier,commission_rate_bps,payment_provider,payment_status,tax_status,created_at,confirmed_at,cancelled_at",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error) throw new Error("Unable to load booking.");
  if (!reservation) notFound();

  const [
    propertyResult,
    messagesResult,
    reviewResult,
    paymentResult,
    cancellationResult,
    changeResult,
  ] = await Promise.all([
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
    supabase
      .from("reservation_cancellation_requests")
      .select(
        "id,status,reason,host_response,requested_at,responded_at,completed_at,metadata",
      )
      .eq("reservation_id", reservationId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("reservation_change_requests")
      .select(
        "id,status,request_text,host_response,requested_at,responded_at,completed_at,metadata",
      )
      .eq("reservation_id", reservationId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const property = propertyResult.data;
  const messages = (messagesResult.data ?? []).filter(
    (message) => !isLegacyRequestMessage(message.body),
  );
  const review = reviewResult.data;
  const payment = paymentResult.data;
  const cancellationRequest = cancellationResult.data;
  const changeRequest = changeResult.data;

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
          <span>Find A Place fee</span>
          <strong>
            {money(reservation.platform_commission_cents, reservation.currency)}
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
            <strong>
              {reservation.guest_email ? (
                <a href={`mailto:${reservation.guest_email}`}>{reservation.guest_email}</a>
              ) : (
                "Not provided"
              )}
            </strong>
          </div>
          <div className="setting-row">
            <span>Phone</span>
            <strong>
              {reservation.guest_phone ? (
                <a href={`tel:${reservation.guest_phone}`}>{reservation.guest_phone}</a>
              ) : (
                "Not provided"
              )}
            </strong>
          </div>
          {reservation.guest_phone ? (
            <p className={chatStyles.contactLinks}>
              <a className={chatStyles.actionLink} href={`tel:${reservation.guest_phone}`}>Call guest</a>
              <a className={chatStyles.actionLink} href={`sms:${reservation.guest_phone}`}>Text guest</a>
            </p>
          ) : null}
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
        <h2>Host payment</h2>

        {payment ? (
          <>
            <div className="dash-grid metrics">
              <div>
                <span>Guest paid</span>
                <strong>{money(payment.amount_cents, payment.currency)}</strong>
                <small>{payment.provider} · {readable(payment.status)}</small>
              </div>
              <div>
                <span>Guest tax in host charge</span>
                <strong>
                  {money(reservation.tax_total_cents, payment.currency)}
                </strong>
                <small>The host receives and handles these tax dollars</small>
              </div>
              <div>
                <span>Find A Place commission</span>
                <strong>
                  −{money(reservation.platform_commission_cents, payment.currency)}
                </strong>
                <small>{reservation.commission_tier}</small>
              </div>
              <div>
                <span>Stripe processing</span>
                <strong>
                  −{money(payment.processor_fee_actual_cents, payment.currency)}
                </strong>
                <small>Charged by Stripe to your connected account</small>
              </div>
              <div>
                <span>Net host proceeds</span>
                <strong>{money(payment.host_proceeds_cents, payment.currency)}</strong>
                <small>Stripe controls balance availability and bank-deposit timing</small>
              </div>
            </div>
            <p className="muted">
              The booking charge belongs to your connected Stripe account. Find A
              Place receives its application fee automatically; Find A Place does
              not hold or schedule your bank deposits.
            </p>
          </>
        ) : (
          <div className="panel-empty">
            <strong>No payment record yet.</strong>
          </div>
        )}
      </section>

      {(cancellationRequest || changeRequest) ? (
        <section className="panel" id="guest-requests">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">Guest requests</p>
              <h2>Review booking requests separately from chat.</h2>
            </div>
          </div>
          <p className="muted">
            These are structured requests tied to the reservation. Your response is emailed to the guest and saved with the booking record.
          </p>

          <div className={chatStyles.requestGrid}>
            {changeRequest ? (
              <article className={chatStyles.requestPanel}>
                <div className={chatStyles.requestMeta}>
                  <strong>Change request</strong>
                  <span className={chatStyles.statusPill}>{readable(changeRequest.status)}</span>
                </div>
                <p>{changeRequest.request_text}</p>
                <small>Requested {new Date(changeRequest.requested_at).toLocaleString("en-US")}</small>
                {changeRequest.host_response ? (
                  <p><strong>Your response:</strong> {changeRequest.host_response}</p>
                ) : null}

                {changeRequest.status === "REQUESTED" && reservation.status === "CONFIRMED" ? (
                  <form className={chatStyles.requestDecisionForm}>
                    <input type="hidden" name="reservation_id" value={reservation.id} />
                    <input type="hidden" name="request_id" value={changeRequest.id} />
                    <textarea
                      name="host_response"
                      placeholder="Reply to the guest with what you can approve or what needs to be different…"
                    />
                    <div className={chatStyles.requestDecisionButtons}>
                      <button formAction={approveChangeRequest} type="submit">Approve request</button>
                      <button formAction={declineChangeRequest} type="submit">Decline request</button>
                    </div>
                    <small className="muted">
                      Approve opens a confirmation screen for the exact new dates and guest/pet counts. The reservation and calendar update together; the existing payment amount is not changed automatically.
                    </small>
                  </form>
                ) : null}
              </article>
            ) : null}

            {cancellationRequest ? (
              <article className={chatStyles.requestPanel}>
                <div className={chatStyles.requestMeta}>
                  <strong>Cancellation request</strong>
                  <span className={chatStyles.statusPill}>{readable(cancellationRequest.status)}</span>
                </div>
                <p>{cancellationRequest.reason || "The guest did not add a reason."}</p>
                <small>Requested {new Date(cancellationRequest.requested_at).toLocaleString("en-US")}</small>
                {cancellationRequest.host_response ? (
                  <p><strong>Your response:</strong> {cancellationRequest.host_response}</p>
                ) : null}

                {cancellationRequest.status === "REQUESTED" && reservation.status === "CONFIRMED" ? (
                  <form className={chatStyles.requestDecisionForm}>
                    <input type="hidden" name="reservation_id" value={reservation.id} />
                    <input type="hidden" name="request_id" value={cancellationRequest.id} />
                    <textarea
                      name="host_response"
                      placeholder="Add a short response to the guest about your decision…"
                    />
                    <div className={chatStyles.requestDecisionButtons}>
                      <button formAction={approveCancellationRequest} type="submit">Approve + full refund</button>
                      <button formAction={approveCancellationWithoutRefund} type="submit">Cancel without refund</button>
                      <button formAction={declineCancellationRequest} type="submit">Keep reservation active</button>
                    </div>
                  </form>
                ) : null}
              </article>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className={chatStyles.shell} id="messages">
        <div className={chatStyles.chatHeader}>
          <div>
            <p className="eyebrow dark">Booking messages</p>
            <h2>Chat with {reservation.guest_name || "your guest"}.</h2>
            <p className="muted">
              Keep normal questions, arrival details and stay communication here. Change and cancellation requests are handled in the request section above.
            </p>
          </div>
          <div className={chatStyles.contactLinks}>
            {reservation.guest_email ? (
              <a className={chatStyles.actionLink} href={`mailto:${reservation.guest_email}`}>Email guest</a>
            ) : null}
            {reservation.guest_phone ? (
              <a className={chatStyles.actionLink} href={`tel:${reservation.guest_phone}`}>Call guest</a>
            ) : null}
            {reservation.guest_phone ? (
              <a className={chatStyles.actionLink} href={`sms:${reservation.guest_phone}`}>Text guest</a>
            ) : null}
            <Link className={chatStyles.actionLink} href={`/host/messages?reservation=${reservation.id}`}>Open inbox</Link>
          </div>
        </div>

        <div className={chatStyles.thread}>
          {messages.length ? (
            messages.map((message) => {
              const host = message.sender_type === "HOST";
              return (
                <div
                  className={`${chatStyles.messageRow} ${host ? chatStyles.messageRowGuest : chatStyles.messageRowHost}`}
                  key={message.id}
                >
                  <div className={`${chatStyles.bubble} ${host ? chatStyles.bubbleGuest : chatStyles.bubbleHost}`}>
                    <div className={chatStyles.bubbleMeta}>
                      <strong>{host ? "You" : reservation.guest_name || "Guest"}</strong>
                      <span>{new Date(message.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                    <div className={chatStyles.bubbleBody}>{message.body}</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className={chatStyles.emptyThread}>
              <div>
                <strong>No messages yet.</strong>
                <p>The guest can start this conversation from My Trip, or you can message them below.</p>
              </div>
            </div>
          )}
        </div>

        <form className={chatStyles.composer} action={sendHostReservationMessage}>
          <input type="hidden" name="reservation_id" value={reservation.id} />
          <input type="hidden" name="return_to" value={`/host/reservations/${reservation.id}`} />
          <textarea
            name="body"
            placeholder="Write a message about check-in, arrival details, the property or this reservation…"
            required
          />
          <div className={chatStyles.composerFooter}>
            <span className={chatStyles.composerNote}>The guest sees this in My Trip and receives an email notification.</span>
            <button className={chatStyles.sendButton} type="submit">Send message</button>
          </div>
        </form>
      </section>

      <section className={`panel ${chatStyles.reviewPanel}`}>
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
              <form className="settings-form" action={respondToReservationReview}>
                <input type="hidden" name="reservation_id" value={reservation.id} />
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
            Reviews are only accepted from guests tied to a completed reservation.
          </p>
        )}
      </section>
    </DashboardShell>
  );
}
