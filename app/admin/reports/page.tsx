import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { getAdminReport } from "@/lib/admin/reports";
import { reportMoney } from "@/lib/reports/common";

function exportHref(report: Awaited<ReturnType<typeof getAdminReport>>) {
  const params = new URLSearchParams({
    from: report.range.from,
    to: report.range.to,
  });
  if (report.organizationFilter) {
    params.set("organization", report.organizationFilter);
  }
  if (report.propertyFilter) params.set("property", report.propertyFilter);
  return `/admin/reports/export?${params.toString()}`;
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    organization?: string;
    property?: string;
  }>;
}) {
  const query = await searchParams;
  const report = await getAdminReport({
    from: query.from,
    to: query.to,
    organizationId: query.organization,
    propertyId: query.property,
  });
  const currency = report.rows[0]?.currency || "USD";

  return (
    <AdminShell
      active="reports"
      eyebrow="Platform financial reporting"
      title="Reports"
      context={report.context}
    >
      <div className="admin-launch-banner">
        <div>
          <span>{report.environment} reporting</span>
          <p>
            <strong>
              Direct host charges, Find A Place fees, taxes, refunds and
              processor costs come from the platform database.
            </strong>{" "}
            Host bank-deposit timing is managed by Stripe and is no longer a
            Find A Place settlement workflow.
          </p>
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
            <span>Stay dates from</span>
            <input type="date" name="from" defaultValue={report.range.from} />
          </label>
          <label>
            <span>Through</span>
            <input type="date" name="to" defaultValue={report.range.to} />
          </label>
        </div>
        <div className="form-row">
          <label>
            <span>Host organization</span>
            <select
              name="organization"
              defaultValue={report.organizationFilter || ""}
            >
              <option value="">All organizations</option>
              {report.organizations.map((organization) => (
                <option value={organization.id} key={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
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
        </div>
        <button className="button button-small" type="submit">
          Run report
        </button>
      </form>

      <div className="dash-grid metrics admin-metrics admin-real-metrics">
        <div className="admin-metric-card admin-metric-card-static">
          <span>Guest payments</span>
          <strong>{reportMoney(report.totals.grossGuestCents, currency)}</strong>
          <small>{report.totals.reservations} reservation records</small>
        </div>
        <div className="admin-metric-card admin-metric-card-static">
          <span>FAP commission</span>
          <strong>{reportMoney(report.totals.commissionCents, currency)}</strong>
          <small>5% / 7% of commissionable lodging</small>
        </div>
        <div className="admin-metric-card admin-metric-card-static">
          <span>Guest tax charged</span>
          <strong>{reportMoney(report.totals.taxCents, currency)}</strong>
          <small>Tax included in the host connected charge</small>
        </div>
        <div className="admin-metric-card admin-metric-card-static">
          <span>Host net</span>
          <strong>{reportMoney(report.totals.hostProceedsCents, currency)}</strong>
          <small>Net recorded on direct host charges</small>
        </div>
        <div className="admin-metric-card admin-metric-card-static">
          <span>Stripe processing</span>
          <strong>{reportMoney(report.totals.processorActualCents, currency)}</strong>
          <small>Charged to connected host accounts</small>
        </div>
        <div className="admin-metric-card admin-metric-card-static">
          <span>Refunded</span>
          <strong>{reportMoney(report.totals.refundCents, currency)}</strong>
          <small>{report.totals.successfulRefunds} successful refunds</small>
        </div>
      </div>

      <div className="dash-grid metrics">
        <div>
          <span>Confirmed stays</span>
          <strong>{report.totals.confirmedStays}</strong>
          <small>{report.totals.bookedNights} booked nights</small>
        </div>
        <div>
          <span>Connected-account processing</span>
          <strong>{reportMoney(report.totals.processingCents, currency)}</strong>
          <small>Recorded host Stripe fee</small>
        </div>
        <div>
          <span>Disputes</span>
          <strong>{report.totals.disputes}</strong>
          <small>Reservations currently disputed</small>
        </div>
        <div>
          <span>Needs attention</span>
          <strong>{report.totals.failedNotifications}</strong>
          <small>Failed transactional email deliveries</small>
        </div>
      </div>

      <div className="dash-two">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">By host</p>
              <h2>Organization totals</h2>
            </div>
          </div>
          {report.organizationBreakdown.length ? (
            <div className="admin-list compact">
              {report.organizationBreakdown.map((row) => (
                <div className="admin-list-row static" key={row.id}>
                  <span>
                    <strong>{row.name}</strong>
                    <small>
                      {row.confirmedStays} confirmed · {row.cancelledStays}{" "}
                      cancelled · {row.bookedNights} nights
                    </small>
                  </span>
                  <span>
                    <strong>{reportMoney(row.grossGuestCents, currency)}</strong>
                    <small>
                      FAP {reportMoney(row.commissionCents, currency)} · host net{" "}
                      {reportMoney(row.hostProceedsCents, currency)}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel-empty">
              <strong>No host totals in this period.</strong>
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow dark">Guest tax</p>
              <h2>Host-owned guest taxes</h2>
            </div>
            <Link href="/admin/taxes">Review property rates →</Link>
          </div>
          <div className="tax-rule">
            <span>Guest tax charged in report</span>
            <strong>{reportMoney(report.totals.taxCents, currency)}</strong>
          </div>
          <div className="tax-rule">
            <span>Refunded guest money</span>
            <strong>{reportMoney(report.totals.refundCents, currency)}</strong>
          </div>
          <p className="muted">
            Hosts receive the guest tax in their connected charges and handle tax reporting and remittance. Property rate settings are available on the tax configuration page.
          </p>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">By property</p>
            <h2>Marketplace booking totals</h2>
          </div>
        </div>
        {report.propertyBreakdown.length ? (
          <div className="big-table">
            <div className="big-row head">
              <span>Property</span>
              <span>Stays / nights</span>
              <span>Guest paid</span>
              <span>FAP commission</span>
              <span>Stripe fee</span>
              <span>Host net</span>
            </div>
            {report.propertyBreakdown.map((row) => (
              <div className="big-row" key={row.id}>
                <span>
                  <strong>{row.name}</strong>
                  <small>{row.reservations} records</small>
                </span>
                <span>
                  {row.confirmedStays} / {row.bookedNights}
                </span>
                <span>{reportMoney(row.grossGuestCents, currency)}</span>
                <span>{reportMoney(row.commissionCents, currency)}</span>
                <span>{reportMoney(row.processingCents, currency)}</span>
                <span>{reportMoney(row.hostProceedsCents, currency)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <strong>No property totals in this period.</strong>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Reservation detail</p>
            <h2>Financial trace</h2>
          </div>
          <Link href="/admin/reservations">Reservation operations →</Link>
        </div>
        {report.rows.length ? (
          <div className="admin-list compact">
            {report.rows.map((row) => (
              <Link
                className="admin-list-row"
                href={`/admin/reservations/${row.reservationId}`}
                key={row.reservationId}
              >
                <span>
                  <strong>
                    {row.confirmationCode} · {row.propertyName}
                  </strong>
                  <small>
                    {row.organizationName} · {row.guestName}
                  </small>
                  <small>
                    {row.checkIn} → {row.checkOut} ·{" "}
                    {row.status.replaceAll("_", " ")} ·{" "}
                    {row.paymentStatus.replaceAll("_", " ")}
                  </small>
                </span>
                <span>
                  <strong>{reportMoney(row.guestPaidCents, row.currency)}</strong>
                  <small>
                    FAP {reportMoney(row.commissionCents, row.currency)} · tax{" "}
                    {reportMoney(row.taxCents, row.currency)}
                  </small>
                  <small>
                    Stripe {reportMoney(row.processingCents, row.currency)} · host net{" "}
                    {reportMoney(row.hostProceedsCents, row.currency)}
                  </small>
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
    </AdminShell>
  );
}
