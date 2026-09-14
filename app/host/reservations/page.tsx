import { DashboardShell } from "@/components/DashboardShell";
import { getHostReservationWorkspace } from "@/lib/host/reservations";
import { cancelTestHold, createTestHold } from "./actions";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function date(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function message(result?: string, detail?: string) {
  if (!result) return null;
  return detail || (result === "error" ? "Reservation operation failed." : "Reservation workspace updated.");
}

export default async function ReservationsPage({ searchParams }: { searchParams: Promise<{ result?: string; detail?: string }> }) {
  const params = await searchParams;
  const workspace = await getHostReservationWorkspace();
  const propertyByUnit = new Map(workspace.properties.map((property) => [property.unitId, property]));
  const notice = message(params.result, params.detail);
  const activeHolds = workspace.reservations.filter((reservation) => reservation.status === "HOLD").length;
  const confirmed = workspace.reservations.filter((reservation) => reservation.status === "CONFIRMED").length;
  const isDevelopment = process.env.NODE_ENV !== "production";

  return <DashboardShell active="Reservations" title="Reservations" eyebrow="Booking operations">
    {notice ? <div className={`panel ${params.result === "error" ? "status-danger" : ""}`}><strong>{notice}</strong></div> : null}

    <div className="dash-grid metrics">
      <div><span>Reservations</span><strong>{workspace.reservations.length}</strong><small>Current local dataset</small></div>
      <div><span>Active holds</span><strong>{activeHolds}</strong><small>10-minute checkout locks</small></div>
      <div><span>Confirmed</span><strong>{confirmed}</strong><small>No live payments enabled</small></div>
      <div><span>Payment foundation</span><strong>Local only</strong><small>Stripe / Square adapters fail closed</small></div>
    </div>

    {isDevelopment ? <section className="panel">
      <div className="panel-head"><div><p className="eyebrow dark">Development test tool</p><h2>Create a real canonical hold without charging money</h2></div><span className="status-pill status-muted">Local only</span></div>
      <p className="muted">This exercises the same unit IDs, 9B availability, 9A pricing/promo snapshot, 5%/7% commission snapshot and future payment-account routing boundary. It cannot contact Stripe or Square.</p>
      {workspace.properties.length ? <form action={createTestHold} className="settings-form">
        <label><span>Property / unit</span><select name="unitId" required>{workspace.properties.map((property) => <option value={property.unitId} key={property.unitId}>{property.name}</option>)}</select></label>
        <div className="form-row"><label><span>Check-in</span><input name="checkIn" type="date" required /></label><label><span>Check-out</span><input name="checkOut" type="date" required /></label></div>
        <div className="form-row"><label><span>Guests</span><input name="guestCount" type="number" min="1" defaultValue="2" required /></label><label><span>Pets</span><input name="petCount" type="number" min="0" defaultValue="0" required /></label></div>
        <div className="form-row"><label><span>Test guest</span><input name="guestName" defaultValue="Local test guest" /></label><label><span>Promo code</span><input name="promotionCode" placeholder="Optional" /></label></div>
        <label><span>Test email</span><input name="guestEmail" type="email" placeholder="Optional" /></label>
        <button className="button button-small" type="submit">Create 10-minute test hold</button>
      </form> : <div className="panel-empty"><strong>No property is ready.</strong><span>Create a rentable unit first.</span></div>}
    </section> : null}

    <section className="panel">
      <div className="panel-head"><div><p className="eyebrow dark">Reservation records</p><h2>Immutable commercial snapshots begin here</h2></div></div>
      {workspace.reservations.length ? <div className="big-table">
        <div className="big-row head"><span>Guest / confirmation</span><span>Property</span><span>Dates</span><span>Total</span><span>Status</span><span/></div>
        {workspace.reservations.map((reservation) => {
          const property = propertyByUnit.get(reservation.unit_id);
          return <div className="big-row" key={reservation.id}>
            <span><strong>{reservation.guest_name || "Guest pending"}</strong><small>{reservation.confirmation_code}</small></span>
            <span><strong>{property?.name ?? "Property"}</strong><small>{reservation.commission_tier} · {(reservation.commission_rate_bps / 100).toFixed(0)}% commission</small></span>
            <span>{date(reservation.check_in)} → {date(reservation.check_out)}</span>
            <span><strong>{money(reservation.guest_total_cents, reservation.currency)}</strong><small>Tax: {reservation.tax_status.replaceAll("_", " ")}</small></span>
            <span><strong>{reservation.status.replaceAll("_", " ")}</strong><small>{reservation.payment_provider ?? "No processor routed"} · {reservation.payment_status.replaceAll("_", " ")}</small></span>
            <span>{reservation.status === "HOLD" ? <form action={cancelTestHold}><input type="hidden" name="reservationId" value={reservation.id}/><button className="button button-small button-quiet" type="submit">Release hold</button></form> : null}</span>
          </div>;
        })}
      </div> : <div className="panel-empty panel-empty-large"><strong>No reservations yet.</strong><span>Create a local test hold above to verify the reservation/availability boundary without moving money.</span></div>}
    </section>
  </DashboardShell>;
}
