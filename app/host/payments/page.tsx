import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { EmbeddedStripeOnboarding } from "@/components/payments/EmbeddedStripeOnboarding";
import { getHostPaymentWorkspace } from "@/lib/host/payments";

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(Number(cents || 0) / 100);
}

function readable(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function PaymentsPage() {
  const workspace = await getHostPaymentWorkspace();
  const readyAccount =
    workspace.accounts.find(
      (account) =>
        account.provider === "STRIPE" &&
        account.status === "READY" &&
        account.charges_enabled,
    ) ?? null;
  const stripe = workspace.readiness.find(
    (provider) => provider.provider === "STRIPE",
  )!;
  const stripeAccount =
    workspace.accounts.find((account) => account.provider === "STRIPE") ?? null;
  const organization = workspace.organizations[0] ?? null;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

  return (
    <DashboardShell
      active="Payments & taxes"
      title="Payments & taxes"
      eyebrow="Host payment settings"
    >
      <div
        className={`payment-status ${readyAccount ? "" : "payment-status-pending"}`}
      >
        <div className="status-icon">$</div>
        <div>
          <p className="eyebrow dark">Connected payment account</p>
          <h2>
            {readyAccount
              ? "Stripe account ready"
              : stripeAccount
                ? "Stripe setup in progress"
                : "No payment account connected"}
          </h2>
          <p>
            {readyAccount
              ? `Guest payments are charged directly on this host Stripe account for ${workspace.environment === "TEST" ? "test" : "live"} bookings. Stripe handles processing, balance availability and bank deposits.`
              : "Connect Stripe here so guest payments can be processed directly on your host account. Bank and identity details stay with Stripe."}
          </p>
        </div>
        <strong>{readyAccount ? "Ready" : "Not ready"}</strong>
      </div>

      <section className="payment-provider-options" aria-label="Payment provider">
        <div className="payment-provider-card">
          <div>
            <small>Recommended</small>
            <strong>Stripe Connect</strong>
            <span>
              {stripe.configured
                ? "Connect or finish Stripe setup to accept booking payments directly on your host account."
                : "Stripe setup is temporarily unavailable. Contact Find A Place for help."}
            </span>
          </div>

          {organization && stripe.configured && publishableKey ? (
            <EmbeddedStripeOnboarding
              organizationId={organization.id}
              publishableKey={publishableKey}
            />
          ) : (
            <button className="button button-small" disabled>
              Connect Stripe
            </button>
          )}
        </div>
      </section>

      <div className="dash-grid metrics">
        <div>
          <span>Payment accounts</span>
          <strong>{workspace.accounts.length}</strong>
          <small>Active connected accounts</small>
        </div>
        <div>
          <span>Stripe processing</span>
          <strong>Host pays</strong>
          <small>Stripe charges the connected host account</small>
        </div>
        <div>
          <span>Find A Place fee</span>
          <strong>5% / 7%</strong>
          <small>Commission based on the lodging subtotal</small>
        </div>
        <div>
          <span>Payment mode</span>
          <strong>{workspace.environment === "TEST" ? "Test" : "Live"}</strong>
          <small>
            {workspace.environment === "TEST"
              ? "Stripe test data only"
              : "Real guest payments"}
          </small>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Transactions</p>
            <h2>Booking payments</h2>
          </div>
          <span className="status-pill status-muted">
            {workspace.transactions.length} shown
          </span>
        </div>

        {workspace.transactions.length ? (
          <div className="admin-list compact">
            {workspace.transactions.map((transaction) => (
              <Link
                className="admin-list-row"
                href={`/host/reservations/${transaction.reservationId}`}
                key={transaction.paymentId}
              >
                <span>
                  <strong>
                    {transaction.confirmationCode} · {transaction.propertyName}
                  </strong>
                  <small>
                    {transaction.guestName || "Guest"} · {transaction.checkIn} →{" "}
                    {transaction.checkOut}
                  </small>
                  <small>
                    Guest paid {money(transaction.amountCents, transaction.currency)}
                    {" · "}Find A Place {money(transaction.commissionCents, transaction.currency)}
                    {" · "}Tax retained {money(transaction.taxCents, transaction.currency)}
                  </small>
                  <small>
                    Stripe processing {money(transaction.processorFeeActualCents, transaction.currency)}
                  </small>
                </span>
                <span>
                  <em>
                    Host net {money(transaction.hostProceedsCents, transaction.currency)}
                  </em>
                  <small>{readable(transaction.status)}</small>
                  <b>View breakdown →</b>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="panel-empty">
            <strong>No booking transactions yet.</strong>
            <span>Completed and in-progress Stripe booking payments will appear here.</span>
          </div>
        )}
      </section>

      <div className="dash-two">
        <section className="panel">
          <p className="eyebrow dark">Connected account</p>
          <h2>Your payment processor</h2>
          {workspace.accounts.length ? (
            <div className="admin-list compact">
              {workspace.accounts.map((account) => (
                <div className="admin-list-row static" key={account.id}>
                  <span>
                    <strong>
                      {readable(account.provider)} · {readable(account.status)}
                    </strong>
                    <small>
                      {account.currency}
                      {account.is_default ? " · Default payment account" : ""}
                    </small>
                  </span>
                  <span>
                    <em>
                      {account.charges_enabled
                        ? "Direct charges enabled"
                        : "Payment setup pending"}
                    </em>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel-empty">
              <strong>No Stripe payment account connected yet.</strong>
              <span>Use Connect Stripe above to complete payment setup.</span>
            </div>
          )}
        </section>

        <section className="panel">
          <p className="eyebrow dark">How money moves</p>
          <h2>Your booking money stays with your processor.</h2>
          <div className="tax-rule">
            <span>Guest charge</span>
            <strong>Created on your Stripe account</strong>
          </div>
          <div className="tax-rule">
            <span>Stripe processing</span>
            <strong>Charged to your Stripe account</strong>
          </div>
          <div className="tax-rule">
            <span>Find A Place</span>
            <strong>Receives the 5% / 7% application fee</strong>
          </div>
          <div className="tax-rule">
            <span>Bank deposit</span>
            <strong>Handled by Stripe under your bank-deposit settings</strong>
          </div>
          <p className="muted">
            Find A Place does not hold or manually release your booking proceeds.
            Stripe controls settlement, balance availability and bank deposits.
          </p>
        </section>
      </div>
    </DashboardShell>
  );
}
