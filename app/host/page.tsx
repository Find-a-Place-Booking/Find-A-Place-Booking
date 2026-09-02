import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { reservations } from "@/data/demo";

export default function HostDashboardPage() {
  return <DashboardShell active="Overview" title="Good morning, Fancy Hill.">
    <div className="host-alert"><div><span>3</span><p><strong>Three arrivals this week.</strong> Check-in messages are ready to review.</p></div><Link href="/host/messages">Open messages →</Link></div>
    <div className="dash-grid metrics"><div><span>September revenue</span><strong>$8,420</strong><small>Across direct bookings</small></div><div><span>Upcoming stays</span><strong>31</strong><small>Next 30 days</small></div><div><span>Occupancy</span><strong>62%</strong><small>September</small></div><div><span>Listing views</span><strong>4,812</strong><small>+18% this month</small></div></div>
    <div className="dash-two">
      <section className="panel"><div className="panel-head"><div><p className="eyebrow dark">Next arrivals</p><h2>Upcoming reservations</h2></div><Link href="/host/reservations">View all</Link></div><div className="table">{reservations.slice(0,4).map(r=><div className="table-row" key={r.guest}><div><strong>{r.guest}</strong><span>{r.property}</span></div><span>{r.dates}</span><strong>{r.total}</strong><em className={r.status.toLowerCase()}>{r.status}</em></div>)}</div></section>
      <section className="panel occupancy-panel"><div className="panel-head"><div><p className="eyebrow dark">30-day outlook</p><h2>Availability</h2></div><Link href="/host/calendar">Open calendar</Link></div><div className="mini-calendar">{Array.from({length:35},(_,i)=><span className={i%7===0||[11,12,13,20,21,22,28].includes(i)?"booked":""} key={i}>{i<4?"":i-3}</span>)}</div><div className="calendar-key"><span><i className="key-booked"/>Booked</span><span><i/>Available</span></div></section>
    </div>
    <div className="dash-two">
      <section className="panel"><div className="panel-head"><div><p className="eyebrow dark">Account checklist</p><h2>Ready to take bookings</h2></div><span className="status-pill">All set</span></div><div className="setup-list"><div><b>✓</b><span><strong>Business profile</strong><small>Owner information and public contact details</small></span></div><div><b>✓</b><span><strong>Property listings</strong><small>8 listings live in network search</small></span></div><div><b>✓</b><span><strong>Payout account</strong><small>Verified and ready to receive guest payments</small></span></div><div><b>✓</b><span><strong>Calendar connections</strong><small>External availability feeds connected</small></span></div></div></section>
      <section className="panel performance"><p className="eyebrow dark">Network reach</p><h2>Where guests found you</h2><div className="bar"><span>Find A Place search</span><i style={{width:"78%"}}/><b>43%</b></div><div className="bar"><span>Property page</span><i style={{width:"62%"}}/><b>31%</b></div><div className="bar"><span>Shared link</span><i style={{width:"38%"}}/><b>18%</b></div><div className="bar"><span>Other</span><i style={{width:"18%"}}/><b>8%</b></div></section>
    </div>
  </DashboardShell>
}
