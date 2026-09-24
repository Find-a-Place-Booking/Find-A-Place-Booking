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

function datePart(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function shortDateRange(checkIn: string, checkOut: string) {
  const start = datePart(checkIn);
  const end = datePart(checkOut);
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();

  const month = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const day = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone: "UTC",
  });

  if (sameMonth) {
    return `${month.format(start)} ${day.format(start)}–${day.format(end)}`;
  }

  return `${month.format(start)} ${day.format(start)} – ${month.format(end)} ${day.format(end)}`;
}

function activityStamp(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function previewText(body: string | null | undefined) {
  const clean = (body || "").replace(/\s+/g, " ").trim();
  if (!clean) return "No messages yet";
  return clean.length > 74 ? `${clean.slice(0, 74)}…` : clean;
}

type RequestSummary = {
  id: string;
  reservation_id: string;
  status: string;
  requested_at: string;
  reason?: string | null;
  request_text?: string | null;
};

type MessageRow = {
  id: string;
  reservation_id: string;
  sender_type: string;
  body: string;
  read_by_host_at: string | null;
  created_at: string;
};

type InboxFilter = "all" | "unread" | "requests";

function filterHref(filter: InboxFilter, query: string) {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (query) params.set("q", query);
  const suffix = params.toString();
  return suffix ? `/host/messages?${suffix}` : "/host/messages";
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    reservation?: string;
    filter?: string;
    q?: string;
  }>;
}) {
  const [params, workspace] = await Promise.all([
    searchParams,
    getHostReservationWorkspace(),
  ]);

  const requestedReservationId = params.reservation?.trim() || "";
  const query = params.q?.trim() || "";
  const filter: InboxFilter =
    params.filter === "unread" || params.filter === "requests"
      ? params.filter
      : "all";

  const reservationIds = workspace.reservations.map(
    (reservation) => reservation.id,
  );
  const propertyByUnit = new Map(
    workspace.properties.map((property) => [property.unitId, property]),
  );

  const supabase = await createClient();
  const [messagesResult, cancellationsResult, changesResult] =
    reservationIds.length
      ? await Promise.all([
          supabase
            .from("reservation_messages")
            .select(
              "id,reservation_id,sender_type,body,read_by_host_at,created_at",
            )
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
          { data: [] as MessageRow[], error: null },
          { data: [] as RequestSummary[], error: null },
          { data: [] as RequestSummary[], error: null },
        ];

  const cleanMessages = ((messagesResult.data ?? []) as MessageRow[]).filter(
    (message) => !isLegacyRequestMessage(message.body),
  );

  const messagesByReservation = new Map<string, MessageRow[]>();
  const latestByReservation = new Map<string, MessageRow>();
  const unreadByReservation = new Map<string, number>();

  for (const message of cleanMessages) {
    const existing = messagesByReservation.get(message.reservation_id) ?? [];
    existing.push(message);
    messagesByReservation.set(message.reservation_id, existing);

    if (!latestByReservation.has(message.reservation_id)) {
      latestByReservation.set(message.reservation_id, message);
    }

    if (
      message.sender_type === "GUEST" &&
      message.read_by_host_at === null
    ) {
      unreadByReservation.set(
        message.reservation_id,
        (unreadByReservation.get(message.reservation_id) ?? 0) + 1,
      );
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

  const allConversations = workspace.reservations
    .filter(
      (reservation) =>
        latestByReservation.has(reservation.id) ||
        latestCancellation.has(reservation.id) ||
        latestChange.has(reservation.id) ||
        reservation.status === "CONFIRMED",
    )
    .map((reservation) => {
      const message = latestByReservation.get(reservation.id) ?? null;
      const cancellation =
        latestCancellation.get(reservation.id) ?? null;
      const change = latestChange.get(reservation.id) ?? null;
      const unreadCount = unreadByReservation.get(reservation.id) ?? 0;
      const pendingCancellation = cancellation?.status === "REQUESTED";
      const pendingChange = change?.status === "REQUESTED";
      const requestCount =
        Number(pendingCancellation) + Number(pendingChange);
      const hasMessages = messagesByReservation.has(reservation.id);
      const activityAt =
        message?.created_at ||
        (pendingCancellation ? cancellation?.requested_at : null) ||
        (pendingChange ? change?.requested_at : null) ||
        reservation.created_at;

      return {
        reservation,
        property: propertyByUnit.get(reservation.unit_id),
        message,
        cancellation,
        change,
        unreadCount,
        requestCount,
        hasMessages,
        hasOpenRequest: requestCount > 0,
        activityAt,
      };
    });

  const queryLower = query.toLowerCase();
  const matchesSearch = (conversation: (typeof allConversations)[number]) => {
    if (!queryLower) return true;
    const haystack = [
      conversation.reservation.guest_name,
      conversation.reservation.confirmation_code,
      conversation.property?.name,
      conversation.message?.body,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(queryLower);
  };

  const activeConversations = allConversations
    .filter(
      (conversation) =>
        conversation.hasMessages || conversation.hasOpenRequest,
    )
    .filter(matchesSearch)
    .filter((conversation) => {
      if (filter === "unread") return conversation.unreadCount > 0;
      if (filter === "requests") return conversation.hasOpenRequest;
      return true;
    })
    .sort((a, b) => {
      const requestPriority =
        Number(b.hasOpenRequest) - Number(a.hasOpenRequest);
      if (requestPriority) return requestPriority;

      const unreadPriority =
        Number(b.unreadCount > 0) - Number(a.unreadCount > 0);
      if (unreadPriority) return unreadPriority;

      return (
        new Date(b.activityAt).getTime() -
        new Date(a.activityAt).getTime()
      );
    });

  const upcomingConversations = allConversations
    .filter(
      (conversation) =>
        !conversation.hasMessages &&
        !conversation.hasOpenRequest &&
        conversation.reservation.status === "CONFIRMED",
    )
    .filter(matchesSearch)
    .sort(
      (a, b) =>
        datePart(a.reservation.check_in).getTime() -
        datePart(b.reservation.check_in).getTime(),
    );

  const requestedConversation =
    allConversations.find(
      ({ reservation }) => reservation.id === requestedReservationId,
    ) ?? null;

  const active =
    requestedConversation ??
    activeConversations[0] ??
    upcomingConversations[0] ??
    null;

  /*
   * Only mark messages read when the host explicitly chose a conversation.
   * This prevents simply opening /host/messages on mobile from clearing the
   * first conversation's unread badge before the host actually opens it.
   */
  if (requestedConversation) {
    await supabase.rpc("mark_host_reservation_messages_read", {
      target_reservation_id: requestedConversation.reservation.id,
    });
  }

  const activeMessages = active
    ? (messagesByReservation.get(active.reservation.id) ?? []).sort(
        (a, b) =>
          new Date(a.created_at).getTime() -
          new Date(b.created_at).getTime(),
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
    activeCancellation?.status === "REQUESTED" ||
    activeChange?.status === "REQUESTED";

  const unreadConversationCount = allConversations.filter(
    (conversation) => conversation.unreadCount > 0,
  ).length;
  const requestConversationCount = allConversations.filter(
    (conversation) => conversation.hasOpenRequest,
  ).length;

  const activeReturnParams = new URLSearchParams();
  if (active) {
    activeReturnParams.set("reservation", active.reservation.id);
  }
  if (filter !== "all") activeReturnParams.set("filter", filter);
  if (query) activeReturnParams.set("q", query);
  const activeReturnPath = `/host/messages?${activeReturnParams.toString()}`;

  function conversationHref(reservationId: string) {
    const next = new URLSearchParams();
    next.set("reservation", reservationId);
    if (filter !== "all") next.set("filter", filter);
    if (query) next.set("q", query);
    return `/host/messages?${next.toString()}#messages`;
  }

  const mobileThreadOpen = Boolean(requestedConversation);

  return (
    <DashboardShell
      active="Messages"
      title="Messages"
      eyebrow="Guest communication"
    >
      {allConversations.length && active ? (
        <div
          className={`${chatStyles.inboxGrid} ${
            mobileThreadOpen ? chatStyles.mobileThreadOpen : ""
          }`}
        >
          <aside className={chatStyles.conversationList}>
            <div className={chatStyles.listHeader}>
              <div className={chatStyles.listTitleRow}>
                <div>
                  <p className="eyebrow dark">Inbox</p>
                  <strong>Booking conversations</strong>
                </div>
                <span className={chatStyles.totalCount}>
                  {activeConversations.length}
                </span>
              </div>

              <form
                className={chatStyles.inboxSearch}
                method="get"
                action="/host/messages"
              >
                {filter !== "all" ? (
                  <input type="hidden" name="filter" value={filter} />
                ) : null}
                <input
                  aria-label="Search booking conversations"
                  name="q"
                  defaultValue={query}
                  placeholder="Guest, property or confirmation…"
                />
                <button type="submit">Search</button>
              </form>

              <div className={chatStyles.inboxFilters}>
                <Link
                  className={
                    filter === "all" ? chatStyles.filterActive : ""
                  }
                  href={filterHref("all", query)}
                >
                  All
                </Link>
                <Link
                  className={
                    filter === "unread" ? chatStyles.filterActive : ""
                  }
                  href={filterHref("unread", query)}
                >
                  Unread
                  {unreadConversationCount ? (
                    <span>{unreadConversationCount}</span>
                  ) : null}
                </Link>
                <Link
                  className={
                    filter === "requests" ? chatStyles.filterActive : ""
                  }
                  href={filterHref("requests", query)}
                >
                  Requests
                  {requestConversationCount ? (
                    <span>{requestConversationCount}</span>
                  ) : null}
                </Link>
              </div>
            </div>

            <div className={chatStyles.conversationScroll}>
              {activeConversations.length ? (
                <div className={chatStyles.activeConversationGroup}>
                  {activeConversations.map((conversation) => {
                    const {
                      reservation,
                      message,
                      property,
                      unreadCount,
                      hasOpenRequest,
                      requestCount,
                    } = conversation;
                    const selected =
                      reservation.id === active.reservation.id;
                    const requestText =
                      requestCount > 1
                        ? `${requestCount} requests need review`
                        : conversation.cancellation?.status === "REQUESTED"
                          ? "Cancellation request"
                          : conversation.change?.status === "REQUESTED"
                            ? "Change request"
                            : null;

                    return (
                      <Link
                        className={`${chatStyles.conversationItem} ${
                          selected
                            ? chatStyles.conversationItemActive
                            : ""
                        } ${
                          unreadCount
                            ? chatStyles.conversationItemUnread
                            : ""
                        }`}
                        href={conversationHref(reservation.id)}
                        key={reservation.id}
                      >
                        <div className={chatStyles.conversationTop}>
                          <strong>
                            {reservation.guest_name || "Guest"}
                          </strong>
                          <span>
                            {activityStamp(conversation.activityAt)}
                          </span>
                        </div>

                        <div className={chatStyles.conversationProperty}>
                          {property?.name || "Property"}
                        </div>

                        <div className={chatStyles.conversationMeta}>
                          <span>
                            {shortDateRange(
                              reservation.check_in,
                              reservation.check_out,
                            )}
                          </span>
                          <span>·</span>
                          <span>{reservation.confirmation_code}</span>
                        </div>

                        <div className={chatStyles.previewRow}>
                          <span
                            className={
                              hasOpenRequest
                                ? chatStyles.requestPreview
                                : ""
                            }
                          >
                            {requestText ||
                              previewText(message?.body)}
                          </span>
                          {unreadCount ? (
                            <b
                              className={chatStyles.unreadBadge}
                              aria-label={`${unreadCount} unread messages`}
                            >
                              {unreadCount > 9 ? "9+" : unreadCount}
                            </b>
                          ) : null}
                        </div>

                        {hasOpenRequest ? (
                          <span className={chatStyles.requestFlag}>
                            Needs attention
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className={chatStyles.listEmpty}>
                  <strong>No conversations match.</strong>
                  <span>
                    Try another filter or search term.
                  </span>
                </div>
              )}

              {filter === "all" && upcomingConversations.length ? (
                <details className={chatStyles.upcomingGroup}>
                  <summary>
                    <span>
                      Start a conversation
                      <small>
                        Confirmed bookings with no messages yet
                      </small>
                    </span>
                    <b>{upcomingConversations.length}</b>
                  </summary>

                  <div>
                    {upcomingConversations.map(
                      ({ reservation, property }) => (
                        <Link
                          className={chatStyles.upcomingItem}
                          href={conversationHref(reservation.id)}
                          key={reservation.id}
                        >
                          <span>
                            <strong>
                              {reservation.guest_name || "Guest"}
                            </strong>
                            <small>
                              {property?.name || "Property"} ·{" "}
                              {shortDateRange(
                                reservation.check_in,
                                reservation.check_out,
                              )}
                            </small>
                          </span>
                          <b>Message →</b>
                        </Link>
                      ),
                    )}
                  </div>
                </details>
              ) : null}
            </div>
          </aside>

          <section className={chatStyles.centerPane} id="messages">
            <div className={chatStyles.centerHeader}>
              <div className={chatStyles.centerHeaderTop}>
                <Link
                  className={chatStyles.mobileBack}
                  href={filterHref(filter, query)}
                >
                  ← Messages
                </Link>

                <Link
                  className={chatStyles.reservationLink}
                  href={`/host/reservations/${active.reservation.id}`}
                >
                  View reservation
                </Link>
              </div>

              <div className={chatStyles.centerIdentity}>
                <div>
                  <p className="eyebrow dark">
                    {active.property?.name || "Reservation"}
                  </p>
                  <h2>
                    {active.reservation.guest_name || "Guest"}
                  </h2>
                  <div className={chatStyles.centerMeta}>
                    <span>
                      {shortDateRange(
                        active.reservation.check_in,
                        active.reservation.check_out,
                      )}
                    </span>
                    <span>·</span>
                    <span>
                      {active.reservation.confirmation_code}
                    </span>
                    <span
                      className={chatStyles.bookingStatus}
                    >
                      {readable(active.reservation.status)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {hasOpenRequest ? (
              <div className={chatStyles.requestBanner}>
                <div>
                  <span>Needs attention</span>
                  <strong>
                    {activeCancellation?.status === "REQUESTED" &&
                    activeChange?.status === "REQUESTED"
                      ? "Cancellation and change requests are waiting."
                      : activeCancellation?.status === "REQUESTED"
                        ? "Cancellation request needs review."
                        : "Reservation change request needs review."}
                  </strong>
                </div>
                <Link
                  href={`/host/reservations/${active.reservation.id}#guest-requests`}
                >
                  Review request →
                </Link>
              </div>
            ) : null}

            <details className={chatStyles.mobileReservationDetails}>
              <summary>Reservation details</summary>
              <div className={chatStyles.mobileReservationBody}>
                <div>
                  <span>Stay</span>
                  <strong>
                    {active.property?.name || "Property"}
                  </strong>
                </div>
                <div>
                  <span>Dates</span>
                  <strong>
                    {shortDateRange(
                      active.reservation.check_in,
                      active.reservation.check_out,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Guests / pets</span>
                  <strong>
                    {active.reservation.guest_count} /{" "}
                    {active.reservation.pet_count}
                  </strong>
                </div>
                <div>
                  <span>Payment</span>
                  <strong>
                    {readable(active.reservation.payment_status)} ·{" "}
                    {money(
                      active.reservation.guest_total_cents,
                      active.reservation.currency,
                    )}
                  </strong>
                </div>

                <div className={chatStyles.mobileContactLinks}>
                  {active.reservation.guest_email ? (
                    <a
                      className={chatStyles.actionLink}
                      href={`mailto:${active.reservation.guest_email}`}
                    >
                      Email
                    </a>
                  ) : null}
                  {guestPhone ? (
                    <a
                      className={chatStyles.actionLink}
                      href={`tel:${guestPhone}`}
                    >
                      Call
                    </a>
                  ) : null}
                  {guestPhone ? (
                    <a
                      className={chatStyles.actionLink}
                      href={`sms:${guestPhone}`}
                    >
                      Text
                    </a>
                  ) : null}
                </div>
              </div>
            </details>

            <div className={chatStyles.thread}>
              {activeMessages.length ? (
                activeMessages.map((message) => {
                  const host = message.sender_type === "HOST";
                  return (
                    <div
                      className={`${chatStyles.messageRow} ${
                        host
                          ? chatStyles.messageRowGuest
                          : chatStyles.messageRowHost
                      }`}
                      key={message.id}
                    >
                      <div
                        className={`${chatStyles.bubble} ${
                          host
                            ? chatStyles.bubbleGuest
                            : chatStyles.bubbleHost
                        }`}
                      >
                        <div className={chatStyles.bubbleMeta}>
                          <strong>
                            {host
                              ? "You"
                              : active.reservation.guest_name ||
                                "Guest"}
                          </strong>
                          <span>
                            {new Date(
                              message.created_at,
                            ).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className={chatStyles.bubbleBody}>
                          {message.body}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={chatStyles.emptyThread}>
                  <div>
                    <span className={chatStyles.emptyIcon}>✉</span>
                    <strong>No messages yet</strong>
                    <p>
                      Start the conversation with check-in details,
                      directions or anything the guest should know.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <form
              className={chatStyles.composer}
              action={sendHostReservationMessage}
            >
              <input
                type="hidden"
                name="reservation_id"
                value={active.reservation.id}
              />
              <input
                type="hidden"
                name="return_to"
                value={activeReturnPath}
              />
              <textarea
                name="body"
                placeholder={`Message ${
                  active.reservation.guest_name || "guest"
                }…`}
                required
              />
              <div className={chatStyles.composerFooter}>
                <span className={chatStyles.composerNote}>
                  Guest receives this in My Trip and by email.
                </span>
                <button
                  className={chatStyles.sendButton}
                  type="submit"
                >
                  Send message
                </button>
              </div>
            </form>
          </section>

          <aside className={chatStyles.sidePane}>
            <div className={chatStyles.sideSticky}>
              <div className={chatStyles.sideHeading}>
                <p className="eyebrow dark">Reservation</p>
                <h3>
                  {active.reservation.guest_name || "Guest"}
                </h3>
                <span>
                  {active.reservation.confirmation_code}
                </span>
              </div>

              <div className={chatStyles.sideSummary}>
                <div>
                  <span>Stay</span>
                  <strong>
                    {active.property?.name || "Property"}
                  </strong>
                </div>
                <div>
                  <span>Dates</span>
                  <strong>
                    {shortDateRange(
                      active.reservation.check_in,
                      active.reservation.check_out,
                    )}
                  </strong>
                </div>
                <div>
                  <span>Guests / pets</span>
                  <strong>
                    {active.reservation.guest_count} /{" "}
                    {active.reservation.pet_count}
                  </strong>
                </div>
                <div>
                  <span>Payment</span>
                  <strong>
                    {readable(active.reservation.payment_status)}
                  </strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>
                    {money(
                      active.reservation.guest_total_cents,
                      active.reservation.currency,
                    )}
                  </strong>
                </div>
              </div>

              <div className={chatStyles.contactLinks}>
                {active.reservation.guest_email ? (
                  <a
                    className={chatStyles.actionLink}
                    href={`mailto:${active.reservation.guest_email}`}
                  >
                    Email
                  </a>
                ) : null}
                {guestPhone ? (
                  <a
                    className={chatStyles.actionLink}
                    href={`tel:${guestPhone}`}
                  >
                    Call
                  </a>
                ) : null}
                {guestPhone ? (
                  <a
                    className={chatStyles.actionLink}
                    href={`sms:${guestPhone}`}
                  >
                    Text
                  </a>
                ) : null}
              </div>

              {hasOpenRequest ? (
                <div className={chatStyles.sideAlert}>
                  <strong>Guest request waiting</strong>
                  <span>
                    Open the reservation to review and respond.
                  </span>
                  <Link
                    href={`/host/reservations/${active.reservation.id}#guest-requests`}
                  >
                    Review request →
                  </Link>
                </div>
              ) : null}

              <Link
                className={chatStyles.fullReservation}
                href={`/host/reservations/${active.reservation.id}`}
              >
                View full reservation →
              </Link>
            </div>
          </aside>
        </div>
      ) : (
        <section className="panel">
          <div className="panel-empty panel-empty-large">
            <strong>No booking conversations yet.</strong>
            <span>
              Confirmed reservations will appear here so you can
              message guests from one inbox.
            </span>
          </div>
        </section>
      )}
    </DashboardShell>
  );
}
