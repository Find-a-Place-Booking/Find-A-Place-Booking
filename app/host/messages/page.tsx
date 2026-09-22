import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import chatStyles from "@/components/ReservationChat.module.css";
import { getHostReservationWorkspace } from "@/lib/host/reservations";
import { createClient } from "@/lib/supabase/server";

import { sendHostReservationMessage } from "../reservations/detail-actions";

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(cents || 0) / 100);
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

type RequestSummary = {
  id: string;
  reservation_id: string;
  status: string;
  requested_at: string;
  reason?: string | null;
  request_text?: string | null;
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ reservation?: string }>;
}) {
  const [{ reservation: requestedReservationId }, workspace] = await Promise.all([
    searchParams,
    getHostReservationWorkspace(),
  ]);

  const reservationIds = workspace.reservations.map((reservation) => reservation.id);
  const propertyByUnit = new Map(
    workspace.properties.map((property) => [property.unitId, property]),
  );

  const supabase = await createClient();
  const [messagesResult, cancellationsResult, changesResult] = reservationIds.length
    ? await Promise.all([
        supabase
          .from("reservation_messages")
          .select("id,reservation_id,sender_type,body,created_at")
          .in("reservation_id", reservationIds)
          .order("created_at", { ascending: false })
          .limit(800),
        supabase
          .from("reservation_cancellation_requests")
          .select("id,reservation_id,status,reason,requested_at")
          .in("reservation_id", reservationIds)
          .order("requested_at", { ascending: false }),
        supabase
          .from("reservation_change_requests")
          .select("id,reservation_id,status,request_text,requested_at")
          .in("reservation_id", reservationIds)
          .order("requested_at", { ascending: false }),
      ])
    : [
        { data: [] as any[], error: null },
        { data: [] as any[], error: null },
        { data: [] as any[], error: null },
      ];

  const cleanMessages = (messagesResult.data ?? []).filter(
    (message) => !isLegacyRequestMessage(message.body),
  );

  const latestByReservation = new Map<
    string,
    { sender_type: string; body: string; created_at: string }
  >();
  for (const message of cleanMessages) {
    if (!latestByReservation.has(message.reservation_id)) {
      latestByReservation.set(message.reservation_id, message);
    }
  }

  const latestCancellation = new Map<string, RequestSummary>();
  for (const request of (cancellationsResult.data ?? []) as RequestSummary[]) {
    if (!latestCancellation.has(request.reservation_id)) {
      latestCancellation.set(request.reservation_id, request);
    }
  }

  const latestChange = new Map<string, RequestSummary>();
  for (const request of (changesResult.data ?? []) as RequestSummary[]) {
    if (!latestChange.has(request.reservation_id)) {
      latestChange.set(request.reservation_id, request);
    }
  }

  const conversations = workspace.reservations
    .filter(
      (reservation) =>
        latestByReservation.has(reservation.id) ||
        latestCancellation.has(reservation.id) ||
        latestChange.has(reservation.id) ||
        reservation.status === "CONFIRMED",
    )
    .map((reservation) => ({
      reservation,
      message: latestByReservation.get(reservation.id) ?? null,
      cancellation: latestCancellation.get(reservation.id) ?? null,
      change: latestChange.get(reservation.id) ?? null,
      property: propertyByUnit.get(reservation.unit_id),
    }))
    .sort((a, b) => {
      const aTime = new Date(
        a.message?.created_at ||
          a.cancellation?.requested_at ||
          a.change?.requested_at ||
          a.reservation.created_at,
      ).getTime();
      const bTime = new Date(
        b.message?.created_at ||
          b.cancellation?.requested_at ||
          b.change?.requested_at ||
          b.reservation.created_at,
      ).getTime();
      return bTime - aTime;
    });

  const active =
    conversations.find(({ reservation }) => reservation.id === requestedReservationId) ??
    conversations[0] ??
    null;

  const activeMessages = active
    ? cleanMessages
        .filter((message) => message.reservation_id === active.reservation.id)
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )
    : [];

  let guestPhone: string | null = null;
  if (active) {
    const { data: details } = await supabase
      .from("reservations")
      .select("guest_phone")
      .eq("id", active.reservation.id)
      .maybeSingle();
    guestPhone = details?.guest_phone ?? null;
  }

  const activeCancellation = active?.cancellation ?? null;
  const activeChange = active?.change ?? null;
  const hasOpenRequest =
    activeCancellation?.status === "REQUESTED" || activeChange?.status === "REQUESTED";

  return (
    <DashboardShell active="Messages" title="Messages" eyebrow="Guest communication">
      {conversations.length && active ? (
        <div className={chatStyles.inboxGrid}>
          <aside className={chatStyles.conversationList}>
            <div className={chatStyles.listHeader}>
              <p className="eyebrow dark">Inbox</p>
              <strong>
                {conversations.length} booking conversation
                {conversations.length === 1 ? "" : "s"}
              </strong>
            </div>

            {conversations.map(({ reservation, message, cancellation, change, property }) => {
              const selected = reservation.id === active.reservation.id;
              const pendingCancellation = cancellation?.status === "REQUESTED";
              const pendingChange = change?.status === "REQUESTED";
              const preview = message?.body
                ? message.body.slice(0, 90)
                : pendingCancellation
                  ? "Cancellation request waiting"
                  : pendingChange
                    ? "Change request waiting"
                    : "No messages yet";

              return (
                <Link
                  className={`${chatStyles.conversationItem} ${selected ? chatStyles.conversationItemActive : ""}`}
                  href={`/host/messages?reservation=${encodeURIComponent(reservation.id)}`}
                  key={reservation.id}
                >
                  <strong>{reservation.guest_name || "Guest"}</strong>
                  <span>{property?.name || "Property"}</span>
                  <small>{reservation.check_in} → {reservation.check_out}</small>
                  <small>{preview}</small>
                  {pendingCancellation ? (
                    <small className={chatStyles.requestFlag}>Cancellation request</small>
                  ) : null}
                  {pendingChange ? (
                    <small className={chatStyles.requestFlag}>Change request</small>
                  ) : null}
                </Link>
              );
            })}
          </aside>

          <section className={chatStyles.centerPane} id="messages">
            <div className={chatStyles.centerHeader}>
              <p className="eyebrow dark">{active.property?.name || "Reservation"}</p>
              <h2>{active.reservation.guest_name || "Guest"}</h2>
              <small>
                {active.reservation.confirmation_code} · {active.reservation.check_in} → {active.reservation.check_out}
              </small>
            </div>

            <div className={chatStyles.thread}>
              {activeMessages.length ? (
                activeMessages.map((message) => {
                  const host = message.sender_type === "HOST";
                  return (
                    <div
                      className={`${chatStyles.messageRow} ${host ? chatStyles.messageRowGuest : chatStyles.messageRowHost}`}
                      key={message.id}
                    >
                      <div className={`${chatStyles.bubble} ${host ? chatStyles.bubbleGuest : chatStyles.bubbleHost}`}>
                        <div className={chatStyles.bubbleMeta}>
                          <strong>{host ? "You" : active.reservation.guest_name || "Guest"}</strong>
                          <span>
                            {new Date(message.created_at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
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
                    <p>Send the guest a message whenever you need to share arrival or booking details.</p>
                  </div>
                </div>
              )}
            </div>

            <form className={chatStyles.composer} action={sendHostReservationMessage}>
              <input type="hidden" name="reservation_id" value={active.reservation.id} />
              <input
                type="hidden"
                name="return_to"
                value={`/host/messages?reservation=${encodeURIComponent(active.reservation.id)}`}
              />
              <textarea
                name="body"
                placeholder={`Message ${active.reservation.guest_name || "guest"} about check-in, the property or this reservation…`}
                required
              />
              <div className={chatStyles.composerFooter}>
                <span className={chatStyles.composerNote}>
                  The guest sees this in My Trip and receives an email notification.
                </span>
                <button className={chatStyles.sendButton} type="submit">Send message</button>
              </div>
            </form>
          </section>

          <aside className={chatStyles.sidePane}>
            <p className="eyebrow dark">Reservation</p>
            <h3>{active.reservation.guest_name || "Guest"}</h3>

            <div className={chatStyles.detailRow}>
              <span>Stay</span>
              <strong>{active.property?.name || "Property"}</strong>
            </div>
            <div className={chatStyles.detailRow}>
              <span>Dates</span>
              <strong>{active.reservation.check_in} → {active.reservation.check_out}</strong>
            </div>
            <div className={chatStyles.detailRow}>
              <span>Guests / pets</span>
              <strong>{active.reservation.guest_count} / {active.reservation.pet_count}</strong>
            </div>
            <div className={chatStyles.detailRow}>
              <span>Payment</span>
              <strong>{readable(active.reservation.payment_status)}</strong>
            </div>
            <div className={chatStyles.detailRow}>
              <span>Total</span>
              <strong>{money(active.reservation.guest_total_cents, active.reservation.currency)}</strong>
            </div>

            <div className={chatStyles.contactLinks}>
              {active.reservation.guest_email ? (
                <a className={chatStyles.actionLink} href={`mailto:${active.reservation.guest_email}`}>Email</a>
              ) : null}
              {guestPhone ? (
                <a className={chatStyles.actionLink} href={`tel:${guestPhone}`}>Call</a>
              ) : null}
              {guestPhone ? (
                <a className={chatStyles.actionLink} href={`sms:${guestPhone}`}>Text</a>
              ) : null}
            </div>

            {hasOpenRequest ? (
              <div className={chatStyles.sideAlert}>
                <strong>Guest request waiting</strong>
                <span>
                  {activeCancellation?.status === "REQUESTED" && activeChange?.status === "REQUESTED"
                    ? "A cancellation request and a change request need review."
                    : activeCancellation?.status === "REQUESTED"
                      ? "A cancellation request needs review."
                      : "A change request needs review."}
                </span>
                <Link href={`/host/reservations/${active.reservation.id}#guest-requests`}>
                  Review request →
                </Link>
              </div>
            ) : null}

            <div className={chatStyles.contactLinks}>
              <Link className={chatStyles.actionLink} href={`/host/reservations/${active.reservation.id}`}>
                Full reservation
              </Link>
            </div>
          </aside>
        </div>
      ) : (
        <section className="panel">
          <div className="panel-empty panel-empty-large">
            <strong>No booking conversations yet.</strong>
            <span>Confirmed reservations will appear here so you can message guests from one inbox.</span>
          </div>
        </section>
      )}
    </DashboardShell>
  );
}
