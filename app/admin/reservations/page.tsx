import Link from "next/link";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

type ReservationRow = {
  id: string;
  confirmation_code: string;
  organization_id: string;
  property_id: string;
  unit_id: string;
  status: string;
  check_in: string;
  check_out: string;
  guest_name: string | null;
  guest_email: string | null;
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
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default async function AdminReservationsPage() {
  const context = await getAdminContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("id,confirmation_code,organization_id,property_id,unit_id,status,check_in,check_out,guest_name,guest_email,guest_total_cents,platform_commission_cents,currency,commission_tier,payment_provider,payment_status,tax_status,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Unable to load reservation operations. Apply Milestone 10A migration 016 and refresh.");

  const reservations = (data ?? []) as ReservationRow[];
  const propertyIds = [...new Set(reservations.map((reservation) => reservation.property_id))];
  const organizationIds = [...new Set(reservations.map((reservation) => reservation.organization_id))];
  const [propertyResult, organizationResult] = await Promise.all([
    propertyIds.length ? supabase.from("properties").select("id,name").in("id", propertyIds) : Promise.resolve({ data: [] as NameRow[], error: null }),
    organizationIds.length ? supabase.from("organizations").select("id,name").in("id", organizationIds) : Promise.resolve({ data: [] as NameRow[], error: null }),
  ]);
  if (propertyResult.error || organizationResult.error) throw new Error("Unable to resolve reservation ownership.");

  const propertyById = new Map(((propertyResult.data ?? []) as NameRow[]).map((row) => [row.id, row.name]));
  const organizationById = new Map(((organizationResult.data ?? []) as NameRow[]).map((row) => [row.id, row.name]));
  const holds = reservations.filter((reservation) => reservation.status === "HOLD").length;
  const confirmed = reservations.filter((reservation) => reservation.status === "CONFIRMED").length;
  const paymentIssues = reservations.filter((reservation) => ["FAILED", "DISPUTED"].includes(reservation.payment_status)).length;

  return <AdminShell active="reservations" eyebrow="Booking operations" title="Reservations" context={context}>
    <div className="metrics dash-grid">
      <div><span>Reservation records</span><strong>{reservations.length}</strong><small>Latest 100</small></div>
      <div><span>Active holds</span><strong>{holds}</strong><small>Temporary checkout locks</small></div>
      <div><span>Confirmed</span><strong>{confirmed}</strong><small>Live confirmation not enabled yet</small></div>
      <div><span>Payment issues</span><strong>{paymentIssues}</strong><small>Provider adapters not active</small></div>
    </div>

    <section className="panel">
      <div className="panel-head"><div><p className="eyebrow dark">Reservation ledger boundary</p><h2>Recent reservation snapshots</h2></div><span className="status-pill status-muted">Read only</span></div>
      {reservations.length ? <div className="admin-list compact">{reservations.map((reservation) => <div className="admin-list-row static" key={reservation.id}>
        <span><strong>{reservation.confirmation_code} · {reservation.guest_name || "Guest pending"}</strong><small>{organizationById.get(reservation.organization_id) ?? "Unknown organization"} · {propertyById.get(reservation.property_id) ?? "Unknown property"}</small><small>{reservation.check_in} → {reservation.check_out} · {money(reservation.guest_total_cents, reservation.currency)} guest total · {money(reservation.platform_commission_cents, reservation.currency)} platform commission</small>{reservation.guest_email ? <small>{reservation.guest_email}</small> : null}</span>
        <span><em>{reservation.status.replaceAll("_", " ")}</em><small>{reservation.commission_tier} · {reservation.payment_provider ?? "NO PROCESSOR"} / {reservation.payment_status.replaceAll("_", " ")}</small><small>Tax: {reservation.tax_status.replaceAll("_", " ")}</small><Link href={`/admin/properties/${reservation.property_id}`}>Open property →</Link></span>
      </div>)}</div> : <div className="panel-empty"><strong>No reservation records yet.</strong><span>Local test holds created by hosts will appear here before any payment processor is enabled.</span></div>}
    </section>
  </AdminShell>;
}
