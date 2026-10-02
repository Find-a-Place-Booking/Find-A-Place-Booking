import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext } from "@/lib/admin/context";
import { formatAdminDate } from "@/lib/admin/format";
import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createClient } from "@/lib/supabase/server";

export default async function BookingAttemptDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const context = await getAdminContext();
  const supabase = await createClient();
  const environment = stripeEnvironment();

  const { data: attempt } = await supabase
    .from("booking_attempts")
    .select(
      "id,unit_id,reservation_id,payment_environment,current_stage,last_event,outcome,landing_path,referrer,user_agent,started_at,last_seen_at,completed_at",
    )
    .eq("id", attemptId)
    .eq("payment_environment", environment)
    .maybeSingle();

  if (!attempt) notFound();

  const [{ data: events }, { data: unit }, { data: reservation }] =
    await Promise.all([
      supabase
        .from("booking_attempt_events")
        .select(
          "id,event_name,stage,success,status_code,error_code,error_message,path,metadata,created_at",
        )
        .eq("attempt_id", attemptId)
        .order("created_at", { ascending: true }),
      attempt.unit_id
        ? supabase
            .from("property_units")
            .select("id,name,property_id")
            .eq("id", attempt.unit_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      attempt.reservation_id
        ? supabase
            .from("reservations")
            .select(
              "id,confirmation_code,status,payment_status,check_in,check_out,guest_total_cents,created_at,confirmed_at,cancelled_at",
            )
            .eq("id", attempt.reservation_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const { data: property } = unit?.property_id
    ? await supabase
        .from("properties")
        .select("id,name")
        .eq("id", unit.property_id)
        .maybeSingle()
    : { data: null };

  return (
    <AdminShell
      active="booking-health"
      eyebrow="Guest booking timeline"
      title={property?.name || unit?.name || "Booking attempt"}
      context={context}
    >
      <p>
        <Link href="/admin/booking-health">
          ← Back to booking health
        </Link>
      </p>

      <div className="dash-grid metrics admin-metrics admin-real-metrics">
        <div className="admin-metric-card admin-metric-card-static">
          <span>Current stage</span>
          <strong>{attempt.current_stage}</strong>
          <small>{attempt.last_event.replaceAll("_", " ")}</small>
        </div>

        <div className="admin-metric-card admin-metric-card-static">
          <span>Outcome</span>
          <strong>{attempt.outcome || "INCOMPLETE"}</strong>
          <small>Last seen {formatAdminDate(attempt.last_seen_at)}</small>
        </div>

        <div className="admin-metric-card admin-metric-card-static">
          <span>Reservation</span>
          <strong>{reservation?.status || "Not created"}</strong>
          <small>
            {reservation
              ? `${reservation.payment_status} · ${reservation.confirmation_code}`
              : "Guest did not reach a reservation hold"}
          </small>
        </div>

        <div className="admin-metric-card admin-metric-card-static">
          <span>Events</span>
          <strong>{events?.length ?? 0}</strong>
          <small>Started {formatAdminDate(attempt.started_at)}</small>
        </div>
      </div>

      {reservation ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">Reservation state</p>
              <h2>{reservation.confirmation_code}</h2>
            </div>
          </div>

          <div className="admin-list">
            <div className="admin-list-row static">
              <span>
                <strong>
                  {reservation.check_in} → {reservation.check_out}
                </strong>
                <small>
                  Status {reservation.status} · payment {reservation.payment_status}
                </small>
              </span>
              <b>
                ${(Number(reservation.guest_total_cents || 0) / 100).toFixed(2)}
              </b>
            </div>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Timeline</p>
            <h2>Everything this guest session did</h2>
          </div>
        </div>

        {events?.length ? (
          <div className="admin-list">
            {events.map((event) => (
              <div className="admin-list-row static" key={event.id}>
                <span>
                  <strong>
                    {event.event_name.replaceAll("_", " ")}
                  </strong>
                  <small>
                    {event.stage} · {formatAdminDate(event.created_at)}
                    {event.status_code ? ` · HTTP ${event.status_code}` : ""}
                    {event.error_message ? ` · ${event.error_message}` : ""}
                  </small>
                  {event.metadata &&
                  Object.keys(event.metadata as Record<string, unknown>).length ? (
                    <small>
                      {JSON.stringify(event.metadata)}
                    </small>
                  ) : null}
                </span>
                <b>
                  {event.success === true
                    ? "OK"
                    : event.success === false
                      ? "ERROR"
                      : "EVENT"}
                </b>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <strong>No events recorded for this attempt.</strong>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
