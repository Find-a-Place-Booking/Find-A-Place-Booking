import { DashboardShell } from "@/components/DashboardShell";
import { getHostPaymentWorkspace } from "@/lib/host/payments";

export default async function PaymentsPage() {
  const workspace = await getHostPaymentWorkspace();
  const readyAccount = workspace.accounts.find((account) => account.status === "READY" && account.charges_enabled) ?? null;
  const stripe = workspace.readiness.find((provider) => provider.provider === "STRIPE")!;
  const square = workspace.readiness.find((provider) => provider.provider === "SQUARE")!;

  return <DashboardShell active="Payments & taxes" title="Payments & taxes" eyebrow="Money routing">
    <div className={`payment-status ${readyAccount ? "" : "payment-status-pending"}`}><div className="status-icon">$</div><div><p className="eyebrow dark">Connected payout method</p><h2>{readyAccount ? `${readyAccount.provider} account ready` : "No payout account connected"}</h2><p>{readyAccount ? "New reservations can snapshot this processor account when routing rules select it." : "The database can now route by organization/property/unit IDs, but no live provider connection exists yet. Raw bank details and identity data are never stored in Find A Place tables."}</p></div><strong>{readyAccount ? "Ready" : "Not connected"}</strong></div>

    <section className="payment-provider-options" aria-label="Supported payout providers">
      <div className="payment-provider-card"><div><small>Recommended</small><strong>Stripe Connect</strong><span>{stripe.configured ? "Platform environment is present, but the adapter remains intentionally disabled until the real Find A Place Stripe account is accepted in test mode." : "Waiting on the real Find A Place Stripe platform account. The reservation/payment schema does not depend on those credentials."}</span></div><button className="button button-small" disabled>Connect Stripe</button></div>
      <div className="payment-provider-card"><div><small>Supported alternative</small><strong>Square</strong><span>{square.configured ? "Platform environment is present, but seller OAuth and app-fee charging remain disabled until provider testing is accepted." : "Waiting on the Find A Place Square developer/business account. Square will sit behind the same payment-provider boundary."}</span></div><button className="button button-small button-quiet" disabled>Connect Square</button></div>
    </section>

    <div className="dash-grid metrics"><div><span>Payment accounts</span><strong>{workspace.accounts.length}</strong><small>Organization/property/unit routing supported</small></div><div><span>Processing policy</span><strong>Host pays</strong><small>HOST_FULL launch default</small></div><div><span>Platform commission</span><strong>5% / 7%</strong><small>Snapshotted per reservation</small></div><div><span>Live money</span><strong>Disabled</strong><small>Provider adapters fail closed</small></div></div>

    <div className="dash-two"><section className="panel"><p className="eyebrow dark">Routing records</p><h2>Connected processor accounts</h2>{workspace.accounts.length ? <div className="admin-list compact">{workspace.accounts.map((account) => <div className="admin-list-row static" key={account.id}><span><strong>{account.provider} · {account.status.replaceAll("_", " ")}</strong><small>{account.connection_mode.replaceAll("_", " ")} · {account.currency}{account.is_default ? " · organization default" : ""}</small></span><span><em>{account.charges_enabled ? "Charges enabled" : "Charges disabled"}</em></span></div>)}</div> : <div className="panel-empty"><strong>No processor account records yet.</strong><span>This is expected until Stripe Connect or Square OAuth is wired with the actual Find A Place platform accounts.</span></div>}</section><section className="panel"><p className="eyebrow dark">Tax boundary</p><h2>Tax remains separate from payment routing.</h2><div className="tax-rule"><span>Reservation tax state</span><strong>Not calculated</strong></div><div className="tax-rule"><span>Processor fee policy</span><strong>Host full</strong></div><div className="tax-rule"><span>Future processing subsidy</span><strong>Schema ready</strong></div><p className="muted">Reservation snapshots now preserve tax state, commission, processing policy and routed processor account independently. No jurisdiction or payout-delay policy is being guessed here.</p></section></div>
    <p className="payments-powered">Milestone 10A creates the financial boundary only. Stripe/Square network calls, OAuth, webhooks and live money remain disabled.</p>
  </DashboardShell>;
}
