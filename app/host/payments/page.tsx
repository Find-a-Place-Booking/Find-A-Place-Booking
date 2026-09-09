import { DashboardShell } from "@/components/DashboardShell";

export default function PaymentsPage(){
  return <DashboardShell active="Payments & taxes" title="Payments & taxes">
    <div className="payment-status payment-status-pending"><div className="status-icon">$</div><div><p className="eyebrow dark">Connected payout method</p><h2>No payout account connected</h2><p>When a provider is connected, this card will show the active provider/account and its status. Find A Place Booking will not store raw bank-account or identity details.</p></div><strong>Not connected</strong></div>

    <section className="payment-provider-options" aria-label="Supported payout providers">
      <div className="payment-provider-card"><div><small>Recommended</small><strong>Stripe Connect</strong><span>Connect a bank account or an existing Stripe-backed payout setup. The real connection flow activates in the payment milestone.</span></div><button className="button button-small" disabled>Connect Stripe</button></div>
      <div className="payment-provider-card"><div><small>Supported alternative</small><strong>Square</strong><span>Hosts already using Square will be able to connect/manage it here and switch supported property assignments later.</span></div><button className="button button-small button-quiet" disabled>Connect Square</button></div>
    </section>

    <div className="dash-grid metrics"><div><span>Available balance</span><strong>$0</strong><small>No payment activity</small></div><div><span>Upcoming payouts</span><strong>$0</strong><small>No payouts scheduled</small></div><div><span>Taxes tracked</span><strong>$0</strong><small>No bookings yet</small></div><div><span>Refunds</span><strong>$0</strong><small>No refund activity</small></div></div>
    <div className="dash-two"><section className="panel"><p className="eyebrow dark">Payout activity</p><h2>Transactions</h2><div className="panel-empty"><strong>No transactions yet.</strong><span>Booking charges, host proceeds, platform commission, processor fees, refunds and adjustments will be recorded separately.</span></div></section><section className="panel"><p className="eyebrow dark">Tax setup</p><h2>Keep tax amounts visible and separate.</h2><div className="tax-rule"><span>Property tax setup</span><strong>Not configured</strong></div><div className="tax-rule"><span>Tax collected on bookings</span><strong>$0</strong></div><div className="tax-rule"><span>Tax reporting</span><strong>Not active</strong></div><p className="muted">Tax amounts will remain separate from lodging revenue and Find A Place platform commission in the financial ledger. Responsibility will be configured by jurisdiction rather than assumed to always belong to the host.</p></section></div>
    <p className="payments-powered">Live money remains disabled until the dedicated payment-readiness gate is completed.</p>
  </DashboardShell>;
}
