import Link from "next/link";

import { DashboardShell } from "@/components/DashboardShell";
import { getHostPricingIndex, money } from "@/lib/host/pricing";

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (value) => value.toUpperCase());
}

export default async function RatesPage() {
  const properties = await getHostPricingIndex();

  return <DashboardShell active="Rates & fees" title="Rates & fees">
    <div className="dash-toolbar pricing-toolbar">
      <div><p>Control base pricing, date specials, holiday minimum stays, promo codes, guest fees and optional extras by property.</p><small>Pricing stays separate from calendar availability and payment processing so each integration can be changed without rewriting host rates.</small></div>
      <Link className="button button-small button-quiet" href="/host/properties">Properties</Link>
    </div>

    {properties.length ? <div className="pricing-property-list">
      {properties.map((property) => <Link className="pricing-property-card" href={`/host/rates/${property.slug}`} key={property.id}>
        <div className="pricing-property-photo">{property.coverImageUrl ? <img src={property.coverImageUrl} alt="" /> : <span>No photo</span>}</div>
        <div className="pricing-property-copy">
          <small>{statusLabel(property.status)}</small>
          <h2>{property.name}</h2>
          <p>{property.publicArea || [property.city, property.state].filter(Boolean).join(", ") || "Location not set"}</p>
        </div>
        <div className="pricing-property-rate"><small>Base night</small><strong>{money(property.weeknightCents)}</strong><span>{property.weekendCents ? `${money(property.weekendCents)} weekend` : "Weekend uses base rate"}</span></div>
        <div className="pricing-property-meta"><span><b>{property.rateRuleCount}</b> date rates</span><span><b>{property.stayRuleCount}</b> stay rules</span><span><b>{property.addOnCount}</b> add-ons</span><span><b>{property.promotionCount}</b> promo codes</span></div>
        <strong className="pricing-open">Manage →</strong>
      </Link>)}
    </div> : <section className="panel"><div className="panel-empty panel-empty-large"><strong>Add a property before setting rates.</strong><span>Base rates, specials, promo codes, minimum stays, guest fees and optional extras are configured per rentable property.</span><Link className="button button-small" href="/host/properties/new">Add property</Link></div></section>}

    <section className="panel pricing-architecture-note">
      <p className="eyebrow dark">How pricing is separated</p>
      <h2>Your rates stay owned by Find A Place.</h2>
      <div className="pricing-boundaries">
        <div><strong>Calendar / PMS</strong><span>Controls whether nights are open or blocked. Future connected providers can sync availability without silently replacing platform pricing.</span></div>
        <div><strong>Checkout</strong><span>Will consume a structured quote containing resolved lodging, host discounts, fees and selected add-ons. Availability must be rechecked before a reservation can be created.</span></div>
        <div><strong>Payments & taxes</strong><span>Processors will receive final line items later. Processor fees and taxes are deliberately not baked into the rate tables.</span></div>
      </div>
    </section>
  </DashboardShell>;
}
