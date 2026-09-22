import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { getHostReservationWorkspace } from "@/lib/host/reservations";
import { cancelTestHold, createTestHold } from "./actions";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function date(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function readable(value: string | null | undefined) {
  if (!value) return "Not set";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function message(result?: string, detail?: string) {
  if (!result) return null;
  return (
    detail ||
    (result === "error"
      ? "Reservation operation failed."
      : "Reservation workspace updated.")
  );
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; detail?: string }>;
}) {
  const params = await searchParams;
  const workspace = await getHostReservationWorkspace();
  const propertyByUnit = new Map(
    workspace.properties.map((property) => [property.unitId, property]),
  );
  const notice = message(params.result, params.detail);

  const activeHolds = workspace.reservations.filter((reservation) =>
    ["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(
      reservation.status,
    ),
  ).length;

  const confirmed = workspace.reservations.filter(
    (reservation) => reservation.status === "CONFIRMED",
  ).length;

  const cancelled = workspace.reservations.filter(
    (reservation) => reservation.status === "CANCELLED",
  ).length;

  const localToolsAvailable =
    process.env.NODE_ENV !== "production" && workspace.testToolsEnabled;

  return (
    <DashboardShell
      active="Reservations"
      title="Reservations"
      eyebrow="Booking operations"
    >
      {notice ? (
        <div
          className={`panel ${
            params.result === "error" ? "status-danger" : ""
          }`}
        >
          <strong>{notice}</strong>
        </div>
      ) : null}

      <div className="dash-grid metrics">
        <div>
          <span>Reservations</span>
          <strong>{workspace.reservations.length}</strong>
          <small>Booking history, including cancellations</small>
        </div>
        <div>
          <span>Open checkout states</span>
          <strong>{activeHolds}</strong>
          <small>Holds, pending and failed payments</small>
        </div>
        <div>
          <span>Confirmed</span>
          <strong>{confirmed}</strong>
          <small>Active confirmed reservations</small>
        </div>
        <div>
          <span>Cancelled</span>
          <strong>{cancelled}</strong>
          <small>Retained in reservation history</small>
        </div>
      </div>

      {localToolsAvailable ? (
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">Development test tool</p>
              <h2>Create a local test hold without charging money</h2>
            </div>
            <span className="status-pill status-muted">Local only</span>
          </div>

          {workspace.properties.length ? (
            <form action={createTestHold} className="settings-form">
              <label>
                <span>Property / unit</span>
                <select name="unitId" required>
                  {workspace.properties.map((property) => (
                    <option value={property.unitId} key={property.unitId}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="form-row">
                <label>
                  <span>Check-in</span>
                  <input name="checkIn" type="date" required />
                </label>
                <label>
                  <span>Check-out</span>
                  <input name="checkOut" type="date" required />
                </label>
              </div>

              <button className="button button-small" type="submit">
                Create test hold
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Booking records</p>
            <h2>Review every reservation in one place</h2>
          </div>
        </div>

        {workspace.reservations.length ? (
          <div className="big-table">
            <div className="big-row head">
              <span>Guest / confirmation</span>
              <span>Property</span>
              <span>Dates</span>
              <span>Total</span>
              <span>Status</span>
              <span />
            </div>

            {workspace.reservations.map((reservation) => {
              const property = propertyByUnit.get(reservation.unit_id);
              const isCancelled = reservation.status === "CANCELLED";

              return (
                <div
                  className={`big-row ${isCancelled ? "reservation-cancelled-row" : ""}`}
                  key={reservation.id}
                >
                  <span>
                    <strong>{reservation.guest_name || "Guest pending"}</strong>
                    <small>{reservation.confirmation_code}</small>
                  </span>

                  <span>
                    <strong>{property?.name ?? "Property"}</strong>
                    <small>
                      {(reservation.commission_rate_bps / 100).toFixed(0)}% Find
                      A Place commission
                    </small>
                  </span>

                  <span>
                    {date(reservation.check_in)} → {date(reservation.check_out)}
                  </span>

                  <span>
                    <strong>
                      {money(
                        reservation.guest_total_cents,
                        reservation.currency,
                      )}
                    </strong>
                    <small>Tax: {readable(reservation.tax_status)}</small>
                  </span>

                  <span>
                    <strong>{readable(reservation.status)}</strong>
                    <small>
                      {reservation.payment_provider
                        ? readable(reservation.payment_provider)
                        : "Payment method pending"}{" "}
                      · {readable(reservation.payment_status)}
                    </small>
                    {isCancelled && reservation.cancelled_at ? (
                      <small>
                        Cancelled{" "}
                        {new Date(reservation.cancelled_at).toLocaleString(
                          "en-US",
                        )}
                      </small>
                    ) : null}
                  </span>

                  <span>
                    <Link
                      className="button button-small button-quiet"
                      href={`/host/reservations/${reservation.id}`}
                    >
                      Review booking
                    </Link>

                    {localToolsAvailable && reservation.status === "HOLD" ? (
                      <form action={cancelTestHold}>
                        <input
                          type="hidden"
                          name="reservationId"
                          value={reservation.id}
                        />
                        <button
                          className="button button-small button-quiet"
                          type="submit"
                        >
                          Release test hold
                        </button>
                      </form>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="panel-empty panel-empty-large">
            <strong>No reservations yet.</strong>
            <span>Booking records will appear here automatically.</span>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
