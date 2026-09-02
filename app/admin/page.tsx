import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function AdminPage(){
  return <div className="admin-layout">
    <aside className="admin-side"><Brand compact/><p className="admin-label">Find A Place team</p>{[["Overview","#top"],["Property approvals","#approvals"],["Hosts","#subscriptions"],["Listings","#growth"],["Reservations","#top"],["Subscriptions","#subscriptions"],["Destinations","#growth"],["Reports","#revenue"],["Support","#attention"],["Activity log","#attention"]].map(([x,href],i)=><a className={i===0?"active":""} href={href} key={x}>{x}<span>›</span></a>)}<Link href="/">← Booking marketplace</Link></aside>
    <main className="admin-main" id="top">
      <header><div><small>Platform operations</small><h1>Good morning, team.</h1></div><div className="admin-head-actions"><button className="notification" type="button">•<span>5</span></button><button className="avatar">FA</button></div></header>
      <div className="admin-launch-banner"><div><span>Launch snapshot</span><p><strong>42 founding properties are live</strong> across Arkansas and southern Missouri, with 17 more applications waiting for review.</p></div><button type="button" className="button button-small">Review applications</button></div>
      <div className="dash-grid metrics admin-metrics"><div><span>Active properties</span><strong>42</strong><small>+9 this month</small></div><div><span>Platform MRR</span><strong>$1,890</strong><small>At current host mix</small></div><div><span>Bookings this month</span><strong>184</strong><small>Across live listings</small></div><div><span>Pending review</span><strong>17</strong><small>Property applications</small></div></div>
      <div className="dash-two">
        <section className="panel" id="approvals"><div className="panel-head"><div><p className="eyebrow dark">Needs review</p><h2>Property applications</h2></div><button type="button">View queue</button></div>{[["Cedar Bend Cabins","Mountain View, AR","Submitted 2h ago"],["Table Rock A-Frame","Branson West, MO","Submitted 6h ago"],["Lake Hamilton Cottage","Hot Springs, AR","Submitted yesterday"],["Buffalo Bluff Camp","Jasper, AR","Submitted yesterday"]].map(x=><div className="approval-row" key={x[0]}><span><strong>{x[0]}</strong><small>{x[1]} · {x[2]}</small></span><div><button type="button">Review</button><button type="button">•••</button></div></div>)}</section>
        <section className="panel" id="attention"><p className="eyebrow dark">Marketplace pulse</p><h2>What needs attention</h2>{[["2 listings","Missing payout setup","warning"],["3 calendars","Sync needs review","warning"],["11 hosts","Annual plan eligible","good"],["5 messages","Waiting on support","neutral"]].map(x=><div className={`ops-row ${x[2]}`} key={x[1]}><strong>{x[0]}</strong><span>{x[1]}</span><button type="button">Open →</button></div>)}</section>
      </div>
      <div className="dash-two">
        <section className="panel" id="growth"><p className="eyebrow dark">Regional growth</p><h2>Live properties by market</h2>{[["Hot Springs / Lake Hamilton",12,84],["Ouachita / Caddo River",10,70],["Buffalo / North Arkansas",8,56],["Northwest Arkansas",7,49],["Southern Missouri",5,35]].map(([name,count,width])=><div className="market-row" key={String(name)}><span>{name}</span><i><b style={{width:`${width}%`}}/></i><strong>{count}</strong></div>)}</section>
        <section className="panel" id="subscriptions"><p className="eyebrow dark">Subscriptions</p><h2>Host plan mix</h2><div className="subscription-ring"><div><strong>31</strong><span>host accounts</span></div></div><div className="subscription-split"><p><span>Monthly accounts</span><strong>21</strong></p><p><span>Annual accounts</span><strong>10</strong></p></div><Link href="/hosts" className="under-link">View public host offer →</Link></section>
      </div>
      <section className="panel admin-revenue" id="revenue"><div><p className="eyebrow dark">Subscription growth</p><h2>Recurring platform revenue</h2><p className="muted">A simple view of what host subscriptions are producing as the network grows.</p></div><div className="fake-chart">{[24,28,31,36,41,47,51,59,67,76,87,100].map((n,i)=><i key={i} style={{height:`${n}%`}}><span>{["Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug"][i]}</span></i>)}</div></section>
    </main>
  </div>;
}
