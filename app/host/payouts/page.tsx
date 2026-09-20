import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { getHostPayoutWorkspace } from "@/lib/host/payouts";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
  }).format(cents / 100);
}

function readable(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default async function HostPayoutsPage() {
  const workspace = await getHostPayoutWorkspace();
  const scheduled = workspace.payouts.filter((payout) =>
    ["SCHEDULED", "WAITING_FUNDS", "WAITING_REFUND", "RETRY"].includes(
      payout.status,
    ),
  );
  const moving = workspace.payouts.filter((payout) =>
    ["PENDING", "IN_TRANSIT"].includes(payout.status),
  );
  const paid = workspace.payouts.filter((payout) => payout.status === "PAID");
  const scheduledCents = scheduled.reduce(
    (sum, payout) => sum + payout.amountCents,
    0,
  );

  return (
    <DashboardShell
      active="Payouts"
      title="Payouts"
      eyebrow="Host settlement schedule"
    >
      <div className="payment-status">
        <div className="status-icon">$</div>
        <div>
          <p className="eyebrow dark">Find A Place payout policy</p>
          <h2>Host payouts become eligible 13 days before check-in.</h2>
          <p>
            Normal guest cancellation closes 14 days before check-in. Stripe
            connected-account payouts are kept on a manual schedule so the bank
            payout does not leave before the cancellation window has closed.
          </p>
        </div>
        <strong>13 days</strong>
      </div>

      <div className="dash-grid metrics">
        <div>
          <span>Scheduled</span>
          <strong>{money(scheduledCents, scheduled[0]?.currency || "USD")}</strong>
          <small>{scheduled.length} upcoming payout{scheduled.length === 1 ? "" : "s"}</small>
        </div>
        <div>
          <span>Moving to bank</span>
          <strong>{moving.length}</strong>
          <small>Pending / in transit</small>
        </div>
        <div>
          <span>Paid</span>
          <strong>{paid.length}</strong>
          <small>Completed bank payouts</small>
        </div>
        <div>
          <span>Cancellation cutoff</span>
          <strong>14 days</strong>
          <small>Normal self-service cancellation closes</small>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Reservation payouts</p>
            <h2>Scheduled and completed payouts</h2>
          </div>
          <Link href="/host/payments">Payment account settings →</Link>
        </div>

        {workspace.payouts.length ? (
          <div className="admin-list compact">
            {workspace.payouts.map((payout) => (
              <div className="admin-list-row static" key={payout.id}>
                <span>
                  <strong>
                    {payout.propertyName} · {payout.confirmationCode}
                  </strong>
                  <small>
                    Eligible {payout.payoutEligibleDate} · cancellation closes {payout.cancellationCutoffDate}
                  </small>
                  {payout.lastError ? <small>{payout.lastError}</small> : null}
                </span>
                <span>
                  <strong>{money(payout.amountCents, payout.currency)}</strong>
                  <em>{readable(payout.status)}</em>
                  {payout.estimatedArrivalAt ? (
                    <small>
                      Estimated arrival {new Date(payout.estimatedArrivalAt).toLocaleDateString("en-US")}
                    </small>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <strong>No reservation payouts yet.</strong>
            <span>
              Confirmed paid reservations will appear here automatically with
              their cancellation cutoff and payout eligibility date.
            </span>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
