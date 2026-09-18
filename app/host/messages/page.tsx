import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { getHostReservationWorkspace } from "@/lib/host/reservations";
import { createClient } from "@/lib/supabase/server";

export default async function MessagesPage() {
  const workspace = await getHostReservationWorkspace();
  const reservationIds = workspace.reservations.map((reservation) => reservation.id);
  const propertyByUnit = new Map(
    workspace.properties.map((property) => [property.unitId, property]),
  );

  const supabase = await createClient();
  const { data: messages } = reservationIds.length
    ? await supabase
        .from("reservation_messages")
        .select("id,reservation_id,sender_type,body,created_at")
        .in("reservation_id", reservationIds)
        .order("created_at", { ascending: false })
        .limit(300)
    : { data: [] };

  const latestByReservation = new Map<
    string,
    { sender_type: string; body: string; created_at: string }
  >();

  for (const message of messages ?? []) {
    if (!latestByReservation.has(message.reservation_id)) {
      latestByReservation.set(message.reservation_id, message);
    }
  }

  const conversations = workspace.reservations
    .filter((reservation) => latestByReservation.has(reservation.id))
    .map((reservation) => ({
      reservation,
      message: latestByReservation.get(reservation.id)!,
      property: propertyByUnit.get(reservation.unit_id),
    }));

  return (
    <DashboardShell active="Messages" title="Messages">
      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Reservation messages</p>
            <h2>Guest conversations stay tied to the booking.</h2>
          </div>
        </div>

        {conversations.length ? (
          <div className="admin-list">
            {conversations.map(({ reservation, message, property }) => (
              <Link
                className="admin-list-row"
                href={`/host/reservations/${reservation.id}`}
                key={reservation.id}
              >
                <span>
                  <strong>
                    {reservation.guest_name || "Guest"} ·{" "}
                    {property?.name || "Property"}
                  </strong>
                  <small>
                    {reservation.confirmation_code} · {message.sender_type}
                  </small>
                  <small>{message.body.slice(0, 180)}</small>
                </span>
                <span>
                  <small>
                    {new Date(message.created_at).toLocaleString("en-US")}
                  </small>
                  <b>Open booking →</b>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="panel-empty panel-empty-large">
            <strong>No conversations yet.</strong>
            <span>
              Guest and host messages tied to confirmed reservations will
              appear here.
            </span>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
