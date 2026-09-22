import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

import { addReservationSupportNote, issueReservationRefund } from "../actions";

function money(cents: number | null | undefined, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(cents ?? 0) / 100);
}

function readable(value: string | null | undefined) {
  return (value || "—").replaceAll("_", " ");
}

export default async function AdminReservationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ reservationId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [{ reservationId }, query, context] = await Promise.all([
    params,
    searchParams,
    getAdminContext(),
  ]);
  const supabase = await createClient();

  const { data: reservation, error } = await supabase
    .from("reservations")
    .select(
      "id,confirmation_code,organization_id,property_id,unit_id,status,check_in,check_out,hold_expires_at,guest_name,guest_email,guest_phone,guest_count,pet_count,currency,pricing_snapshot,policy_snapshot,promotion_snapshot,commission_tier,commission_rate_bps,commission_base_cents,platform_commission_cents,pre_tax_total_cents,tax_total_cents,guest_total_cents,tax_status,payment_account_id,payment_provider,provider_account_ref,payment_status,payment_environment,confirmed_at,cancelled_at,created_at,updated_at",
    )
    .eq("id", reservationId)
    .maybeSingle();

  if (error) throw new Error("Unable to load reservation.");
  if (!reservation) notFound();

  const [
    propertyResult,
    organizationResult,
    paymentsResult,
    refundsResult,
    ledgerResult,
    eventsResult,
    notesResult,
    messagesResult,
    reviewResult,
    cancellationResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id,name")
      .eq("id", reservation.property_id)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("id,name,contact_email,contact_phone")
      .eq("id", reservation.organization_id)
      .maybeSingle(),
    supabase
      .from("payments")
      .select(
        "id,provider,status,provider_payment_id,provider_charge_id,amount_cents,application_fee_cents,platform_tax_retained_cents,processor_fee_actual_cents,processor_fee_host_share_cents,processor_fee_platform_share_cents,host_proceeds_cents,currency,failure_code,failure_message,created_at,updated_at",
      )
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("refunds")
      .select(
        "id,status,provider_refund_id,amount_cents,platform_fee_refund_cents,application_fee_refund_status,application_fee_refund_error,currency,reason,created_at",
      )
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("financial_ledger_entries")
      .select(
        "id,entry_type,amount_cents,currency,description,created_at,payment_id,refund_id",
      )
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("reservation_events")
      .select("id,event_type,actor_profile_id,metadata,created_at")
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("reservation_support_notes")
      .select("id,admin_profile_id,note,created_at")
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("reservation_messages")
      .select("id,sender_type,body,created_at")
      .eq("reservation_id", reservationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("reservation_reviews")
      .select("id,rating,body,status,host_response,created_at,host_responded_at")
      .eq("reservation_id", reservationId)
      .maybeSingle(),
    supabase
      .from("reservation_cancellation_requests")
      .select(
        "id,requested_by,status,reason,host_response,requested_at,responded_at,completed_at,metadata",
      )
      .eq("reservation_id", reservationId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const property = propertyResult.data;
  const organization = organizationResult.data;
  const payments = paymentsResult.data ?? [];
  const refunds = refundsResult.data ?? [];
  const ledger = ledgerResult.data ?? [];
  const events = eventsResult.data ?? [];
  const notes = notesResult.data ?? [];
  const messages = messagesResult.data ?? [];
  const review = reviewResult.data;
  const cancellationRequest = cancellationResult.data;

  const paidPayment = payments.find((payment) =>
    ["SUCCEEDED", "PARTIALLY_REFUNDED", "DISPUTED"].includes(payment.status),
  );
  const refundedCents = refunds
    .filter((refund) => ["PENDING", "SUCCEEDED"].includes(refund.status))
    .reduce((sum, refund) => sum + Number(refund.amount_cents), 0);
  const refundableCents = Math.max(
    0,
    Number(paidPayment?.amount_cents ?? 0) - refundedCents,
  );
  const canRefund = hasAnyAdminRole(context, ["SUPER_ADMIN", "FINANCE_ADMIN"]);

  return (
    <AdminShell
      active="reservations"
      eyebrow="Reservation support"
      title={reservation.confirmation_code}
      context={context}
    >
      <div className="property-editor-heading">
        <Link href="/admin/reservations">← All reservations</Link>
        <span className="status-pill">{readable(reservation.status)}</span>
      </div>

      {query.saved ? <div className="admin-message success">{query.saved}</div> : null}
      {query.error ? <div className="admin-message error">{query.error}</div> : null}

      <div className="dash-grid metrics">
        <div>
          <span>Guest total</span>
          <strong>{money(reservation.guest_total_cents, reservation.currency)}</strong>
          <small>{reservation.guest_count} guest(s)</small>
        </div>
        <div>
          <span>Platform commission</span>
          <strong>{money(reservation.platform_commission_cents, reservation.currency)}</strong>
          <small>{reservation.commission_tier}</small>
        </div>
        <div>
          <span>Payment</span>
          <strong>{readable(reservation.payment_status)}</strong>
          <small>{reservation.payment_provider ?? "No processor"}</small>
        </div>
        <div>
          <span>Guest tax in host charge</span>
          <strong>{money(reservation.tax_total_cents, reservation.currency)}</strong>
          <small>{readable(reservation.tax_status)}</small>
        </div>
      </div>

      <div className="dash-two">
        <section className="panel">
          <p className="eyebrow dark">Guest</p>
          <h2>{reservation.guest_name || "Guest"}</h2>
          <div className="setting-row"><span>Email</span><strong>{reservation.guest_email || "Not provided"}</strong></div>
          <div className="setting-row"><span>Phone</span><strong>{reservation.guest_phone || "Not provided"}</strong></div>
          <div className="setting-row"><span>Dates</span><strong>{reservation.check_in} → {reservation.check_out}</strong></div>
          <div className="setting-row"><span>Guests / pets</span><strong>{reservation.guest_count} / {reservation.pet_count}</strong></div>
        </section>

        <section className="panel">
          <p className="eyebrow dark">Host / property</p>
          <h2>{property?.name || "Property"}</h2>
          <div className="setting-row"><span>Organization</span><strong>{organization?.name || "Unknown"}</strong></div>
          <div className="setting-row"><span>Host email</span><strong>{organization?.contact_email || "Not set"}</strong></div>
          <div className="setting-row"><span>Host phone</span><strong>{organization?.contact_phone || "Not set"}</strong></div>
          <div className="setting-row"><span>Connected processor account</span><strong>{reservation.provider_account_ref || "Not routed"}</strong></div>
          <Link className="button button-small button-quiet" href={`/admin/properties/${reservation.property_id}`}>Open property</Link>
        </section>
      </div>

      {cancellationRequest ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">Cancellation request</p>
              <h2>{readable(cancellationRequest.status)}</h2>
            </div>
            <span className="status-pill status-muted">Host / guest workflow</span>
          </div>
          <div className="setting-row"><span>Requested by</span><strong>{readable(cancellationRequest.requested_by)}</strong></div>
          <div className="setting-row"><span>Requested</span><strong>{new Date(cancellationRequest.requested_at).toLocaleString("en-US")}</strong></div>
          <p>{cancellationRequest.reason || "No reason provided."}</p>
          {cancellationRequest.host_response ? <p><strong>Host response:</strong> {cancellationRequest.host_response}</p> : null}
          <p className="muted">Find A Place records and transmits the request. The host makes the ordinary booking cancellation decision under the accepted property policy, subject to applicable law.</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Payment records</p>
            <h2>Direct-charge detail</h2>
          </div>
        </div>

        {payments.length ? (
          <div className="admin-list compact">
            {payments.map((payment) => (
              <div className="admin-list-row static" key={payment.id}>
                <span>
                  <strong>{payment.provider} · {readable(payment.status)}</strong>
                  <small>{payment.provider_payment_id || "No payment ID"}</small>
                  <small>{payment.provider_charge_id || "No charge ID"}</small>
                  {payment.failure_message ? <small>{payment.failure_message}</small> : null}
                </span>
                <span>
                  <em>{money(payment.amount_cents, payment.currency)}</em>
                  <small>FAP commission: {money(reservation.platform_commission_cents, payment.currency)}</small>
                  <small>Guest tax in host charge: {money(reservation.tax_total_cents, payment.currency)}</small>
                  <small>Stripe processing charged to host account: {money(payment.processor_fee_actual_cents, payment.currency)}</small>
                  <small>Host net: {money(payment.host_proceeds_cents, payment.currency)}</small>
                  <small>Stripe application fee total: {money(payment.application_fee_cents, payment.currency)}</small>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel-empty"><strong>No payment record.</strong></div>
        )}

        <p className="muted">
          Guest charges are created on the host&apos;s connected processor account.
          Stripe charges processing to that account and controls its bank-deposit
          timing. Find A Place receives only its commission as an application fee. Guest tax stays in the host connected charge; the host handles remittance.
        </p>

        {refunds.length ? (
          <div className="admin-list compact">
            {refunds.map((refund) => (
              <div className="admin-list-row static" key={refund.id}>
                <span>
                  <strong>Refund · {readable(refund.status)}</strong>
                  <small>{refund.reason || "No reason recorded"}</small>
                </span>
                <span>
                  <em>{money(refund.amount_cents, refund.currency)}</em>
                  <small>{refund.provider_refund_id || "Pending provider ID"}</small>
                  {Number(refund.platform_fee_refund_cents) > 0 ? (
                    <small>
                      Application-fee return {money(refund.platform_fee_refund_cents, refund.currency)} · {readable(refund.application_fee_refund_status)}
                      {refund.application_fee_refund_status === "FAILED" ? " · Needs reconciliation" : ""}
                    </small>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      {paidPayment && refundableCents > 0 && canRefund ? (
        <section className="panel">
          <p className="eyebrow dark">Support refund controls</p>
          <h2>Issue a processor refund</h2>
          <p className="muted">
            Use this for support/admin exceptions. Ordinary guest cancellation
            requests are handled by the host from the reservation workflow. A
            refund here is created against the host&apos;s connected Stripe charge.
          </p>
          <form className="settings-form" action={issueReservationRefund}>
            <input type="hidden" name="reservation_id" value={reservation.id} />
            <label>
              <span>Refund type</span>
              <select name="refund_type" defaultValue="partial">
                <option value="partial">Partial refund</option>
                <option value="full">Full remaining refund ({money(refundableCents, reservation.currency)})</option>
              </select>
            </label>
            <label>
              <span>Partial amount in dollars</span>
              <input name="amount" type="number" min="0.01" step="0.01" max={(refundableCents / 100).toFixed(2)} placeholder="0.00" />
            </label>
            <label><span>Internal reason</span><textarea name="reason" rows={3} required /></label>
            <button className="button button-small" type="submit">Submit refund</button>
          </form>
        </section>
      ) : null}

      <div className="dash-two">
        <section className="panel">
          <p className="eyebrow dark">Financial ledger</p>
          <h2>Accounting entries</h2>
          {ledger.length ? (
            <div className="admin-list compact">
              {ledger.map((entry) => (
                <div className="admin-list-row static" key={entry.id}>
                  <span><strong>{readable(entry.entry_type)}</strong><small>{entry.description || ""}</small></span>
                  <span><em>{money(entry.amount_cents, entry.currency)}</em></span>
                </div>
              ))}
            </div>
          ) : <div className="panel-empty"><strong>No ledger entries yet.</strong></div>}
        </section>

        <section className="panel">
          <p className="eyebrow dark">Booking timeline</p>
          <h2>Reservation events</h2>
          {events.length ? (
            <div className="admin-list compact">
              {events.map((event) => (
                <div className="admin-list-row static" key={event.id}>
                  <span><strong>{readable(event.event_type)}</strong><small>{new Date(event.created_at).toLocaleString("en-US")}</small></span>
                </div>
              ))}
            </div>
          ) : <div className="panel-empty"><strong>No events recorded.</strong></div>}
        </section>
      </div>

      <div className="dash-two">
        <section className="panel">
          <p className="eyebrow dark">Booking messages</p>
          <h2>Guest / host thread</h2>
          {messages.length ? (
            <div className="admin-list compact">
              {messages.map((message) => (
                <div className="admin-list-row static" key={message.id}>
                  <span><strong>{message.sender_type}</strong><small>{message.body}</small></span>
                  <span><small>{new Date(message.created_at).toLocaleString("en-US")}</small></span>
                </div>
              ))}
            </div>
          ) : <div className="panel-empty"><strong>No booking messages yet.</strong></div>}
        </section>

        <section className="panel">
          <p className="eyebrow dark">Verified review</p>
          <h2>{review ? `${review.rating}/5` : "No review yet"}</h2>
          {review ? (
            <>
              <p>{review.body || "Rating submitted without written review."}</p>
              <small>Status: {review.status}</small>
              {review.host_response ? <p><strong>Host response:</strong> {review.host_response}</p> : null}
            </>
          ) : <p className="muted">Only a guest tied to this completed reservation can leave a verified review.</p>}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div><p className="eyebrow dark">Internal support notes</p><h2>Find A Place case history</h2></div>
          <span className="status-pill status-muted">Admin only</span>
        </div>
        <form className="settings-form" action={addReservationSupportNote}>
          <input type="hidden" name="reservation_id" value={reservation.id} />
          <label><span>Add note</span><textarea name="note" rows={4} placeholder="What happened, who you spoke with, and what still needs to be resolved…" required /></label>
          <button className="button button-small" type="submit">Save support note</button>
        </form>
        {notes.length ? (
          <div className="admin-list compact">
            {notes.map((note) => (
              <div className="admin-list-row static" key={note.id}>
                <span><strong>Support note</strong><small>{note.note}</small></span>
                <span><small>{new Date(note.created_at).toLocaleString("en-US")}</small></span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </AdminShell>
  );
}
