import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { getHostPricingIndex, money } from "@/lib/host/pricing";

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, value => value.toUpperCase());
}

export default async function RatesPage() {
  const properties = await getHostPricingIndex();
  return <DashboardShell active="Rates & fees" title="Rates & fees">
    <div className="dash-toolbar pricing-toolbar">
      <div><p>Set nightly rates, holiday pricing, minimum stays, promo codes, host fees and optional guest extras for each property.</p></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Link className="button button-small button-quiet" href="/host/integrations/ownerrez">OwnerRez sync</Link><Link className="button button-small button-quiet" href="/host/agreements">Guest agreements</Link><Link className="button button-small button-quiet" href="/host/security-deposits">Refundable deposits</Link><Link className="button button-small button-quiet" href="/host/properties">Properties</Link></div>
    </div>

    {properties.length ? <div className="pricing-property-list">
      {properties.map(property => <div key={property.id}>
        <Link className="pricing-property-card" href={`/host/rates/${property.slug}`}>
          <div className="pricing-property-photo">{property.coverImageUrl ? <img src={property.coverImageUrl} alt="" /> : <span>No photo</span>}</div>
          <div className="pricing-property-copy">
            <small>{statusLabel(property.status)}</small><h2>{property.name}</h2>
            <p>{property.publicArea || [property.city, property.state].filter(Boolean).join(", ") || "Location not set"}</p>
          </div>
          <div className="pricing-property-rate"><small>Base night</small><strong>{money(property.weeknightCents)}</strong><span>{property.weekendCents ? `${money(property.weekendCents)} weekend` : "Weekend uses base rate"}</span></div>
          <div className="pricing-property-meta"><span><b>{property.rateRuleCount}</b> date rates</span><span><b>{property.stayRuleCount}</b> stay rules</span><span><b>{property.addOnCount}</b> add-ons</span><span><b>{property.promotionCount}</b> promo codes</span></div>
          <strong className="pricing-open">Manage →</strong>
        </Link>
        <p style={{ margin: "6px 0 18px", display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}><Link className="button button-small button-quiet" href={`/host/rates/${property.slug}/security-deposit`}>Refundable deposit</Link><Link className="button button-small button-quiet" href={`/host/rates/${property.slug}/extra-fees`}>+ Add optional fee / extra</Link></p>
      </div>)}
    </div> : <section className="panel"><div className="panel-empty panel-empty-large"><strong>Add a property before setting rates.</strong><span>Rates, specials, promo codes, minimum stays, guest fees and optional extras are set for each property.</span><Link className="button button-small" href="/host/properties/new">Add property</Link></div></section>}
  </DashboardShell>;
}
