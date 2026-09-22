import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { getHostReport } from "@/lib/host/reports";
import { reportMoney } from "@/lib/reports/common";

function exportHref(report: Awaited<ReturnType<typeof getHostReport>>) {
  const params = new URLSearchParams({
    from: report.range.from,
    to: report.range.to,
  });
  if (report.propertyFilter) params.set("property", report.propertyFilter);
  return `/host/reports/export?${params.toString()}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; property?: string }>;
}) {
  const query = await searchParams;
  const report = await getHostReport({
    from: query.from,
    to: query.to,
    propertyId: query.property,
  });
  const currency = report.rows[0]?.currency || "USD";

  return (
    <DashboardShell
      active="Reports"
      title="Reports"
      eyebrow="Booking & payment reporting"
    >
      <div className="dash-toolbar">
        <div>
          <p>
            Booking, refund and payment reporting from your Find A Place
            reservations.
          </p>
          <small>
            Guest charges belong to your connected processor account. TEST and
            LIVE records remain separate.
          </small>
        </div>
        <Link
          className="button button-small button-quiet"
          href={exportHref(report)}
        >
          Export CSV
        </Link>
      </div>

      <form className="panel settings-form" method="get">
        <div className="form-row">
          <label>
            <span>From</span>
            <input type="date" name="from" defaultValue={report.range.from} />
          </label>
          <label>
            <span>Through</span>
            <input type="date" name="to" defaultValue={report.range.to} />
          </label>
        </div>
        <label>
          <span>Property</span>
          <select name="property" defaultValue={report.propertyFilter || ""}>
            <option value="">All properties</option>
            {report.properties.map((property) => (
              <option value={property.id} key={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </label>
        <div className="pricing-inline-actions">
          <button className="button button-small" type="submit">
            Run report
          </button>
          <span className="status-pill status-muted">
            {report.environment} money
          </span>
        </div>
      </form>

      <div className="dash-grid metrics">
        <div>
          <span>Guest payments</span>
          <strong>{reportMoney(report.totals.grossGuestCents, currency)}</strong>
          <small>Successful charges on your connected payment account</small>
        </div>
        <div>
          <span>Host net</span>
          <strong>{reportMoney(report.totals.hostProceedsCents, currency)}</strong>
          <small>After Find A Place amounts and Stripe processing</small>
        </div>
        <div>
          <span>Stripe processing</span>
          <strong>{reportMoney(report.totals.processingCents, currency)}</strong>
          <small>Processor fee charged to the host account</small>
        </div>
        <div>
          <span>Refunded</span>
          <strong>{reportMoney(report.totals.refundCents, currency)}</strong>
          <small>Successful guest refunds</small>
        </div>
      </div>

      <div className="dash-grid metrics">
        <div>
          <span>Confirmed stays</span>
          <strong>{report.totals.confirmedStays}</strong>
          <small>{report.totals.bookedNights} booked nights</small>
        </div>
        <div>
          <span>Taxes collected by FAP</span>
          <strong>{reportMoney(report.totals.taxCents, currency)}</strong>
          <small>Only taxes currently retained for platform remittance</small>
        </div>
        <div>
          <span>FAP commission</span>
          <strong>{reportMoney(report.totals.commissionCents, currency)}</strong>
          <small>5% / 7% of commissionable lodging</small>
        </div>
        <div>
          <span>Reservations</span>
          <strong>{report.totals.reservations}</strong>
          <small>{report.totals.cancelledStays} cancelled</small>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">By property</p>
            <h2>Booking payment summary</h2>
          </div>
          <span className="status-pill status-muted">
            {report.propertyBreakdown.length} properties
          </span>
        </div>
        {report.propertyBreakdown.length ? (
          <div className="big-table">
            <div className="big-row head">
              <span>Property</span>
              <span>Stays / nights</span>
              <span>Guest paid</span>
              <span>FAP fee</span>
              <span>Stripe fee</span>
              <span>Host net</span>
            </div>
            {report.propertyBreakdown.map((row) => (
              <div className="big-row" key={row.propertyId}>
                <span>
                  <strong>{row.propertyName}</strong>
                  <small>{row.reservations} reservation records</small>
                </span>
                <span>
                  <strong>
                    {row.confirmedStays} / {row.bookedNights}
                  </strong>
                  <small>{row.cancelledStays} cancelled</small>
                </span>
                <span>{reportMoney(row.grossGuestCents, row.currency)}</span>
                <span>{reportMoney(row.commissionCents, row.currency)}</span>
                <span>{reportMoney(row.processingCents, row.currency)}</span>
                <span>{reportMoney(row.hostProceedsCents, row.currency)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <strong>No reportable bookings in this period.</strong>
            <span>Choose a wider date range or another property.</span>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Reservations</p>
            <h2>Financial booking detail</h2>
          </div>
          <Link href="/host/reservations">Open reservations →</Link>
        </div>
        {report.rows.length ? (
          <div className="admin-list compact">
            {report.rows.map((row) => (
              <Link
                className="admin-list-row"
                href={`/host/reservations/${row.reservationId}`}
                key={row.reservationId}
              >
                <span>
                  <strong>
                    {row.confirmationCode} · {row.propertyName}
                  </strong>
                  <small>
                    {row.guestName} · {row.checkIn} → {row.checkOut}
                  </small>
                  <small>
                    {row.status.replaceAll("_", " ")} ·{" "}
                    {row.paymentStatus.replaceAll("_", " ")}
                  </small>
                </span>
                <span>
                  <strong>{reportMoney(row.guestPaidCents, row.currency)}</strong>
                  <small>
                    Host net {reportMoney(row.hostProceedsCents, row.currency)}
                  </small>
                  <small>
                    Stripe {reportMoney(row.processingCents, row.currency)} · FAP{" "}
                    {reportMoney(row.commissionCents, row.currency)}
                  </small>
                  {row.refundCents ? (
                    <small>
                      Refunded {reportMoney(row.refundCents, row.currency)}
                    </small>
                  ) : null}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <strong>No reservation rows for this report.</strong>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
