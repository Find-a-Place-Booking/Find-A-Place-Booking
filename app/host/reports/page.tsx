import { DashboardShell } from "@/components/DashboardShell";

const reportGroups = [
  ["Stay activity", "Completed stays, upcoming stays, cancellations and occupancy."],
  ["Host money", "Booked revenue, host proceeds, payout eligible/pending/completed and refunds."],
  ["Platform & processing", "Find A Place commission, commission tier, processor fees and adjustments."],
  ["Taxes", "Taxes collected, remitted and still pending by property/jurisdiction."],
  ["Issues", "Refund exposure, disputes, chargebacks and financial adjustments."],
  ["Performance", "Revenue by property, average nightly rate, listing views, discovery and booking sources."],
];

export default function ReportsPage(){return <DashboardShell active="Reports" title="Reports">
  <div className="dash-toolbar"><p>See how listings perform across bookings, occupancy, money and Find A Place discovery.</p><button className="button button-small button-quiet" disabled>Export report</button></div>
  <div className="dash-grid metrics"><div><span>Booked revenue</span><strong>$0</strong><small>No bookings yet</small></div><div><span>Occupancy</span><strong>—</strong><small>No reporting period yet</small></div><div><span>Avg. nightly rate</span><strong>—</strong><small>No completed stays yet</small></div><div><span>Listing views</span><strong>0</strong><small>No live listings yet</small></div></div>
  <div className="dash-two"><section className="panel performance"><p className="eyebrow dark">Discovery</p><h2>Listing performance</h2><div className="panel-empty"><strong>No listing data yet.</strong><span>Search impressions and property views will appear after listings are live.</span></div></section><section className="panel"><p className="eyebrow dark">Booking sources</p><h2>Where stays came from</h2><div className="panel-empty"><strong>No booking-source data yet.</strong><span>Find A Place bookings and connected-calendar activity will be reported separately.</span></div></section></div>
  <section className="panel report-library"><p className="eyebrow dark">Reporting library</p><h2>Operational and accounting reports planned for the finished system</h2><div className="report-filter-preview"><button disabled>Date range</button><button disabled>Property</button><button disabled>Booking status</button><button disabled>Payout status</button><button disabled>Tax jurisdiction</button></div><div className="report-library-grid">{reportGroups.map(([title, detail])=><div key={title}><strong>{title}</strong><span>{detail}</span></div>)}</div><p className="muted">These reports will be generated from reservation, payment and immutable-ledger records rather than email history. CSV/accounting export activates with the reporting/ledger milestones.</p></section>
</DashboardShell>}
