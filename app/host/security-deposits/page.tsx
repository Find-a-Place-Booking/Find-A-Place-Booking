import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { createClient } from "@/lib/supabase/server";
import { refundSecurityDeposit } from "./actions";

export default async function HostDepositsPage({ searchParams }: {
  searchParams: Promise<{ result?: string; error?: string }>;
}) {
  const query = await searchParams;
  const client = await createClient();
  const { data: deposits, error } = await client.from("reservation_security_deposits")
    .select("id,reservation_id,amount_cents,status,created_at,paid_at,refunded_at")
    .order("created_at", { ascending: false }).limit(100);
  const ids = (deposits || []).map((row) => row.reservation_id);
  const { data: reservations } = ids.length ? await client.from("reservations")
    .select("id,confirmation_code,guest_name,check_out").in("id", ids) : { data: [] };
  const byId = new Map((reservations || []).map((row) => [row.id, row]));
  return <DashboardShell active="Reservations" title="Refundable deposits">
    <p className="muted">Deposits are separate Stripe payments to the host. They are not guest booking fees or lodging tax. Refunds are available after checkout and are submitted to the host's connected Stripe account.</p>
    <p><Link href="/host/reservations">← Reservations</Link></p>
    {query.result ? <p className="admin-message success">Refund request submitted. Stripe may take additional time to return funds.</p> : null}
    {query.error || error ? <p className="admin-message error">The requested action could not be completed. Check the deposit status and try again; contact support before retrying a refund that may have started at Stripe.</p> : null}
    {(deposits || []).length === 0 ? <section className="panel">No refundable deposits recorded yet.</section> :
      <div className="admin-list">
        {(deposits || []).map((d) => {
          const r = byId.get(d.reservation_id);
          return <section key={d.id} className="panel">
            <strong>{r?.guest_name || "Guest"} · {r?.confirmation_code || "Reservation"}</strong>
            <p>${(d.amount_cents / 100).toFixed(2)} · <b>{d.status.replaceAll("_", " ")}</b> · Checkout {r?.check_out || "unknown"}</p>
            {d.status === "PAID" ? <form action={refundSecurityDeposit}>
              <input type="hidden" name="depositId" value={d.id} />
              <button className="button button-small" type="submit">Refund full deposit through Stripe</button>
            </form> : null}
          </section>;
        })}
      </div>}
  </DashboardShell>;
}
