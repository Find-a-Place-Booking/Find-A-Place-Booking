import Link from "next/link";
import { Brand } from "@/components/Brand";

const nav = [
  ["Overview", "#top"],
  ["Property approvals", "#approvals"],
  ["Hosts", "#hosts"],
  ["Listings", "#listings"],
  ["Reservations", "#reservations"],
  ["Payments & ledger", "#finance"],
  ["Destinations", "#listings"],
  ["Reports", "#finance"],
  ["Support", "#attention"],
  ["Activity log", "#activity"]
];

export default function AdminPage(){
  return <div className="admin-layout">
    <aside className="admin-side"><Brand compact/><p className="admin-label">Find A Place team</p>{nav.map(([label,href],index)=><a className={index===0?"active":""} href={href} key={label}>{label}<span>›</span></a>)}<Link href="/">← Booking marketplace</Link></aside>
    <main className="admin-main" id="top">
      <header><div><small>Platform operations</small><h1>Admin workspace</h1></div><div className="admin-head-actions"><button className="notification" type="button" aria-label="Notifications">•</button><button className="avatar" type="button" aria-label="Admin account">FA</button></div></header>

      <div className="admin-launch-banner"><div><span>Production shell</span><p><strong>No live operational data is connected yet.</strong> Host, listing, booking, payment and system records will populate this workspace from Supabase.</p></div><span className="status-pill status-inverse">Local build</span></div>

      <div className="dash-grid metrics admin-metrics"><div><span>Active properties</span><strong>0</strong><small>No live inventory</small></div><div><span>Platform commission</span><strong>$0</strong><small>No booking revenue</small></div><div><span>Bookings</span><strong>0</strong><small>No reservations</small></div><div><span>Needs attention</span><strong>0</strong><small>No operational issues</small></div></div>

      <div className="dash-two">
        <section className="panel" id="approvals"><div className="panel-head"><div><p className="eyebrow dark">Property review</p><h2>Approval queue</h2></div><button type="button" disabled>View queue</button></div><div className="panel-empty"><strong>No property applications yet.</strong><span>Submitted host listings will appear here with review status and validation issues.</span></div></section>
        <section className="panel" id="attention"><p className="eyebrow dark">Operations</p><h2>What needs attention</h2><div className="panel-empty"><strong>No issues are being tracked yet.</strong><span>Payment failures, stale calendars, email delivery failures, incomplete onboarding and other exceptions will surface here automatically.</span></div></section>
      </div>

      <div className="dash-two">
        <section className="panel" id="hosts"><p className="eyebrow dark">Hosts</p><h2>Host search & account health</h2><div className="admin-search-shell"><input placeholder="Search owner, organization, email, property, booking or payment ID…" disabled/><button className="button button-small" disabled>Search</button></div><div className="panel-empty"><strong>No host records connected.</strong><span>Admins will be able to open a host and trace properties, reservations, payments, notifications, issues and activity without digging through email.</span></div></section>
        <section className="panel" id="listings"><p className="eyebrow dark">Marketplace</p><h2>Live properties by market</h2><div className="panel-empty"><strong>No market inventory yet.</strong><span>Regional counts and featured-property controls will appear when listings are approved.</span></div></section>
      </div>

      <div className="dash-two">
        <section className="panel" id="reservations"><p className="eyebrow dark">Reservations</p><h2>Booking operations</h2><div className="panel-empty"><strong>No bookings yet.</strong><span>Reservation state, guest, host, property, payment, calendar and notification history will be linked from one record.</span></div></section>
        <section className="panel" id="activity"><p className="eyebrow dark">Activity</p><h2>Platform event history</h2><div className="panel-empty"><strong>No events recorded.</strong><span>Operational events and admin actions will form a searchable timeline once the event and audit systems are connected.</span></div></section>
      </div>

      <section className="panel admin-revenue" id="finance"><div><p className="eyebrow dark">Finance</p><h2>Payments, commission & ledger</h2><p className="muted">The financial workspace will keep guest charges, lodging subtotal, host fees, taxes, 5%/7% commission, processor fees, host proceeds, refunds and adjustments separately traceable.</p></div><div className="finance-empty"><strong>$0</strong><span>No financial ledger activity</span></div></section>
    </main>
  </div>;
}
