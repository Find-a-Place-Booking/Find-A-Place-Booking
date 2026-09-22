import Link from "next/link";
import { notFound } from "next/navigation";

import { applyChangeRequest } from "@/app/host/reservations/detail-actions";
import { DashboardShell } from "@/components/DashboardShell";
import { createClient } from "@/lib/supabase/server";

export default async function ApplyReservationChangePage({
  params,
  searchParams,
}: {
  params: Promise<{ reservationId: string; requestId: string }>;
  searchParams: Promise<{ note?: string; error?: string }>;
}) {
  const [{ reservationId, requestId }, query] = await Promise.all([
    params,
    searchParams,
  ]);

  const supabase = await createClient();

  const [{ data: reservation }, { data: request }] = await Promise.all([
    supabase
      .from("reservations")
      .select(
        "id,confirmation_code,status,check_in,check_out,guest_count,pet_count,property_id",
      )
      .eq("id", reservationId)
      .maybeSingle(),
    supabase
      .from("reservation_change_requests")
      .select(
        "id,reservation_id,status,request_text,host_response,requested_at",
      )
      .eq("id", requestId)
      .eq("reservation_id", reservationId)
      .maybeSingle(),
  ]);

  if (!reservation || !request) notFound();

  const { data: property } = await supabase
    .from("properties")
    .select("id,name")
    .eq("id", reservation.property_id)
    .maybeSingle();

  const active =
    reservation.status === "CONFIRMED" && request.status === "REQUESTED";

  return (
    <DashboardShell
      active="Reservations"
      title="Apply booking change"
      eyebrow={reservation.confirmation_code}
    >
      <div className="property-editor-heading">
        <Link href={`/host/reservations/${reservationId}`}>
          ← Back to reservation
        </Link>
        <span className="status-pill">{request.status}</span>
      </div>

      {query.error ? (
        <div className="admin-message error">{query.error}</div>
      ) : null}

      <div className="dash-two">
        <section className="panel">
          <p className="eyebrow dark">Guest request</p>
          <h2>{property?.name || "Reservation change"}</h2>
          <p>{request.request_text}</p>
          <small>
            Requested{" "}
            {new Date(request.requested_at).toLocaleString("en-US")}
          </small>
        </section>

        <section className="panel">
          <p className="eyebrow dark">Current booking</p>
          <h2>
            {reservation.check_in} → {reservation.check_out}
          </h2>
          <div className="setting-row">
            <span>Guests</span>
            <strong>{reservation.guest_count}</strong>
          </div>
          <div className="setting-row">
            <span>Pets</span>
            <strong>{reservation.pet_count}</strong>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Approve and apply</p>
            <h2>Enter the exact updated reservation.</h2>
          </div>
        </div>

        <p className="muted">
          The new dates are checked against the live Find A Place calendar
          before anything changes. If they are available, the reservation and
          its calendar block update together. This does not silently change the
          amount already charged to the guest.
        </p>

        {active ? (
          <form className="settings-form" action={applyChangeRequest}>
            <input
              type="hidden"
              name="reservation_id"
              value={reservation.id}
            />
            <input type="hidden" name="request_id" value={request.id} />

            <div className="form-row">
              <label>
                <span>New check-in</span>
                <input
                  name="check_in"
                  type="date"
                  defaultValue={reservation.check_in}
                  required
                />
              </label>

              <label>
                <span>New check-out</span>
                <input
                  name="check_out"
                  type="date"
                  defaultValue={reservation.check_out}
                  required
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                <span>Guests</span>
                <input
                  name="guest_count"
                  type="number"
                  min={1}
                  defaultValue={reservation.guest_count}
                  required
                />
              </label>

              <label>
                <span>Pets</span>
                <input
                  name="pet_count"
                  type="number"
                  min={0}
                  defaultValue={reservation.pet_count}
                  required
                />
              </label>
            </div>

            <label>
              <span>Message to guest</span>
              <textarea
                name="host_response"
                rows={4}
                defaultValue={query.note || ""}
                placeholder="Optional note about what you approved or changed…"
              />
            </label>

            <div className="form-row">
              <button className="button" type="submit">
                Apply change to reservation
              </button>
              <Link
                className="button button-quiet"
                href={`/host/reservations/${reservationId}`}
              >
                Go back
              </Link>
            </div>
          </form>
        ) : (
          <div className="panel-empty">
            <strong>This change request is no longer open.</strong>
            <span>
              Return to the reservation to review the current booking record.
            </span>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
