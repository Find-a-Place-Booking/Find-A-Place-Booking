import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

type ReservationRow = {
  id: string;
  confirmation_code: string;
  organization_id: string;
  property_id: string;
  status: string;
  check_in: string;
  check_out: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_total_cents: number;
  platform_commission_cents: number;
  currency: string;
  commission_tier: string;
  payment_provider: string | null;
  payment_status: string;
  tax_status: string;
  created_at: string;
};

type NameRow = { id: string; name: string };

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function matchesSearch(
  reservation: ReservationRow,
  query: string,
  propertyName: string,
  organizationName: string,
) {
  if (!query) return true;

  const haystack = [
    reservation.confirmation_code,
    reservation.guest_name,
    reservation.guest_email,
    reservation.guest_phone,
    propertyName,
    organizationName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export default async function AdminReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    payment?: string;
    sort?: string;
  }>;
}) {
  const [context, params] = await Promise.all([
    getAdminContext(),
    searchParams,
  ]);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      "id,confirmation_code,organization_id,property_id,status,check_in,check_out,guest_name,guest_email,guest_phone,guest_total_cents,platform_commission_cents,currency,commission_tier,payment_provider,payment_status,tax_status,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(
      "Unable to load reservation operations. Apply the reservation migrations and refresh.",
    );
  }

  const reservations = (data ?? []) as ReservationRow[];
  const propertyIds = [
    ...new Set(reservations.map((reservation) => reservation.property_id)),
  ];
  const organizationIds = [
    ...new Set(reservations.map((reservation) => reservation.organization_id)),
  ];

  const [propertyResult, organizationResult] = await Promise.all([
    propertyIds.length
      ? supabase.from("properties").select("id,name").in("id", propertyIds)
      : Promise.resolve({ data: [] as NameRow[], error: null }),
    organizationIds.length
      ? supabase
          .from("organizations")
          .select("id,name")
          .in("id", organizationIds)
      : Promise.resolve({ data: [] as NameRow[], error: null }),
  ]);

  if (propertyResult.error || organizationResult.error) {
    throw new Error("Unable to resolve reservation ownership.");
  }

  const propertyById = new Map(
    ((propertyResult.data ?? []) as NameRow[]).map((row) => [row.id, row.name]),
  );
  const organizationById = new Map(
    ((organizationResult.data ?? []) as NameRow[]).map((row) => [
      row.id,
      row.name,
    ]),
  );

  const q = (params.q ?? "").trim();
  const status = (params.status ?? "").trim();
  const payment = (params.payment ?? "").trim();
  const sort = (params.sort ?? "newest").trim();

  const filtered = reservations.filter((reservation) => {
    const propertyName = propertyById.get(reservation.property_id) ?? "";
    const organizationName =
      organizationById.get(reservation.organization_id) ?? "";

    return (
      matchesSearch(reservation, q, propertyName, organizationName) &&
      (!status || reservation.status === status) &&
      (!payment || reservation.payment_status === payment)
    );
  });

  filtered.sort((a, b) => {
    if (sort === "checkin") {
      return a.check_in.localeCompare(b.check_in);
    }

    if (sort === "total-high") {
      return b.guest_total_cents - a.guest_total_cents;
    }

    if (sort === "total-low") {
      return a.guest_total_cents - b.guest_total_cents;
    }

    return b.created_at.localeCompare(a.created_at);
  });

  const holds = reservations.filter((item) =>
    ["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(item.status),
  ).length;
  const confirmed = reservations.filter(
    (item) => item.status === "CONFIRMED",
  ).length;
  const paymentIssues = reservations.filter((item) =>
    ["FAILED", "DISPUTED"].includes(item.payment_status),
  ).length;

  return (
    <AdminShell
      active="reservations"
      eyebrow="Booking operations"
      title="Reservations"
      context={context}
    >
      <div className="metrics dash-grid">
        <div>
          <span>Reservation records</span>
          <strong>{reservations.length}</strong>
          <small>Latest 500 loaded</small>
        </div>
        <div>
          <span>Open checkout states</span>
          <strong>{holds}</strong>
          <small>Holds, pending and failed payments</small>
        </div>
        <div>
          <span>Confirmed</span>
          <strong>{confirmed}</strong>
          <small>Canonical confirmed reservations</small>
        </div>
        <div>
          <span>Payment issues</span>
          <strong>{paymentIssues}</strong>
          <small>Failed or disputed</small>
        </div>
      </div>

      <section className="panel admin-global-search">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Support lookup</p>
            <h2>Find any booking.</h2>
          </div>
          <span className="status-pill status-muted">
            {filtered.length} shown
          </span>
        </div>

        <form className="settings-form" action="/admin/reservations" method="get">
          <label>
            <span>Search</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Confirmation, guest, email, phone, property or host…"
            />
          </label>

          <div className="form-row">
            <label>
              <span>Reservation status</span>
              <select name="status" defaultValue={status}>
                <option value="">All statuses</option>
                <option value="HOLD">Hold</option>
                <option value="PAYMENT_PENDING">Payment pending</option>
                <option value="PAYMENT_FAILED">Payment failed</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </label>

            <label>
              <span>Payment status</span>
              <select name="payment" defaultValue={payment}>
                <option value="">All payments</option>
                <option value="NOT_STARTED">Not started</option>
                <option value="REQUIRES_ACTION">Requires action</option>
                <option value="PROCESSING">Processing</option>
                <option value="SUCCEEDED">Succeeded</option>
                <option value="FAILED">Failed</option>
                <option value="REFUNDED">Refunded</option>
                <option value="DISPUTED">Disputed</option>
              </select>
            </label>
          </div>

          <label>
            <span>Sort</span>
            <select name="sort" defaultValue={sort}>
              <option value="newest">Newest booking first</option>
              <option value="checkin">Check-in date</option>
              <option value="total-high">Highest total</option>
              <option value="total-low">Lowest total</option>
            </select>
          </label>

          <button className="button button-small" type="submit">
            Apply filters
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Reservation support console</p>
            <h2>Booking records</h2>
          </div>
        </div>

        {filtered.length ? (
          <div className="admin-list compact">
            {filtered.map((reservation) => (
              <Link
                className="admin-list-row"
                href={`/admin/reservations/${reservation.id}`}
                key={reservation.id}
              >
                <span>
                  <strong>
                    {reservation.confirmation_code} ·{" "}
                    {reservation.guest_name || "Guest pending"}
                  </strong>
                  <small>
                    {organizationById.get(reservation.organization_id) ??
                      "Unknown organization"}{" "}
                    ·{" "}
                    {propertyById.get(reservation.property_id) ??
                      "Unknown property"}
                  </small>
                  <small>
                    {reservation.check_in} → {reservation.check_out} ·{" "}
                    {money(
                      reservation.guest_total_cents,
                      reservation.currency,
                    )}{" "}
                    guest total ·{" "}
                    {money(
                      reservation.platform_commission_cents,
                      reservation.currency,
                    )}{" "}
                    commission
                  </small>
                  {reservation.guest_email ? (
                    <small>{reservation.guest_email}</small>
                  ) : null}
                </span>

                <span>
                  <em>{reservation.status.replaceAll("_", " ")}</em>
                  <small>
                    {reservation.payment_provider ?? "NO PROCESSOR"} /{" "}
                    {reservation.payment_status.replaceAll("_", " ")}
                  </small>
                  <small>Tax: {reservation.tax_status.replaceAll("_", " ")}</small>
                  <b>Open support view →</b>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <strong>No reservations match those filters.</strong>
            <span>Clear a filter or search for another booking.</span>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
