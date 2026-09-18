import { DashboardShell } from "@/components/DashboardShell";
import { EmbeddedStripeOnboarding } from "@/components/payments/EmbeddedStripeOnboarding";
import { getHostPaymentWorkspace } from "@/lib/host/payments";

export default async function PaymentsPage() {
  const workspace = await getHostPaymentWorkspace();
  const readyAccount =
    workspace.accounts.find(
      (account) =>
        account.provider === "STRIPE" &&
        account.status === "READY" &&
        account.payouts_enabled,
    ) ?? null;
  const stripe = workspace.readiness.find(
    (provider) => provider.provider === "STRIPE",
  )!;
  const square = workspace.readiness.find(
    (provider) => provider.provider === "SQUARE",
  )!;
  const stripeAccount =
    workspace.accounts.find((account) => account.provider === "STRIPE") ?? null;
  const organization = workspace.organizations[0] ?? null;
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

  return (
    <DashboardShell
      active="Payments & taxes"
      title="Payments & taxes"
      eyebrow="Money routing"
    >
      <div
        className={`payment-status ${
          readyAccount ? "" : "payment-status-pending"
        }`}
      >
        <div className="status-icon">$</div>
        <div>
          <p className="eyebrow dark">Connected payout method</p>
          <h2>
            {readyAccount
              ? "Stripe account ready"
              : stripeAccount
                ? "Stripe setup in progress"
                : "No payout account connected"}
          </h2>
          <p>
            {readyAccount
              ? `This organization can receive its share of Stripe ${workspace.environment === "TEST" ? "test" : "live"} bookings.`
              : "Connect payouts here without leaving Find A Place. Stripe securely handles bank and identity information inside the embedded component."}
          </p>
        </div>
        <strong>{readyAccount ? "Ready" : "Not ready"}</strong>
      </div>

      <section
        className="payment-provider-options"
        aria-label="Supported payout providers"
      >
        <div className="payment-provider-card">
          <div>
            <small>Recommended</small>
            <strong>Stripe Connect</strong>
            <span>
              {stripe.configured
                ? "Stripe onboarding stays inside the Find A Place host dashboard."
                : `Stripe is waiting on: ${stripe.missingEnvironment.join(", ")}`}
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

        <div className="payment-provider-card">
          <div>
            <small>Supported alternative</small>
            <strong>Square</strong>
            <span>
              {square.configured
                ? "Square seller OAuth is reserved for the later Square integration."
                : "Square will use the same provider boundary after Stripe testing."}
            </span>
          </div>
          <button className="button button-small button-quiet" disabled>
            Connect Square
          </button>
        </div>
      </section>

      <div className="dash-grid metrics">
        <div>
          <span>Payment accounts</span>
          <strong>{workspace.accounts.length}</strong>
          <small>Organization/property/unit routing supported</small>
        </div>
        <div>
          <span>Processing policy</span>
          <strong>Host pays</strong>
          <small>HOST_FULL launch default</small>
        </div>
        <div>
          <span>Platform commission</span>
          <strong>5% / 7%</strong>
          <small>Snapshotted per reservation</small>
        </div>
        <div>
          <span>Money mode</span>
          <strong>{workspace.environment === "TEST" ? "Test" : "Live"}</strong>
          <small>{workspace.environment === "TEST" ? "Stripe test data only" : "Real cards and payouts"}</small>
        </div>
      </div>

      <div className="dash-two">
        <section className="panel">
          <p className="eyebrow dark">Routing records</p>
          <h2>Connected processor accounts</h2>
          {workspace.accounts.length ? (
            <div className="admin-list compact">
              {workspace.accounts.map((account) => (
                <div className="admin-list-row static" key={account.id}>
                  <span>
                    <strong>
                      {account.provider} · {account.status.replaceAll("_", " ")}
                    </strong>
                    <small>
                      {account.connection_mode.replaceAll("_", " ")} ·{" "}
                      {account.currency}
                      {account.is_default ? " · organization default" : ""}
                    </small>
                  </span>
                  <span>
                    <em>
                      {account.payouts_enabled
                        ? "Payouts enabled"
                        : "Payouts pending"}
                    </em>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="panel-empty">
              <strong>No processor account records yet.</strong>
              <span>
                Use Connect Stripe above. The onboarding form will open directly
                inside this page.
              </span>
            </div>
          )}
        </section>

        <section className="panel">
          <p className="eyebrow dark">Stripe boundary</p>
          <h2>Stripe owns sensitive financial fields.</h2>
          <div className="tax-rule">
            <span>Host bank information</span>
            <strong>Stripe component</strong>
          </div>
          <div className="tax-rule">
            <span>Identity verification</span>
            <strong>Stripe component</strong>
          </div>
          <div className="tax-rule">
            <span>Find A Place stores</span>
            <strong>acct_ reference only</strong>
          </div>
          <p className="muted">
            The host never has to leave Find A Place, but Find A Place still does
            not receive raw bank numbers, identity documents or SSNs.
          </p>
        </section>
      </div>
    </DashboardShell>
  );
}
