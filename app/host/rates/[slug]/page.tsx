import Link from "next/link";

import {
  deleteAddOn,
  deletePromotionCode,
  deleteRateRule,
  deleteStayRule,
  saveAddOn,
  saveBasePricing,
  savePromotionCode,
  saveRateRule,
  saveStayRule,
} from "@/app/host/rates/actions";
import { DashboardShell } from "@/components/DashboardShell";
import { calculationLabel, getHostQuotePreview, getPricingWorkspaceBySlug, money, promotionValueLabel } from "@/lib/host/pricing";
import petStyles from "./pet-fee-modes.module.css";

function dollars(cents: number | null | undefined) {
  return cents == null ? "" : (cents / 100).toFixed(cents % 100 ? 2 : 0);
}
function resultMessage(value?: string) {
  if (!value) return null;
  if (value === "base-saved") return "Base rates and fees saved.";
  if (value === "rate-created") return "Date rate created.";
  if (value === "rate-updated") return "Date rate updated.";
  if (value === "rate-deleted") return "Date rate removed.";
  if (value === "stay-created") return "Minimum-stay rule created.";
  if (value === "stay-updated") return "Minimum-stay rule updated.";
  if (value === "stay-deleted") return "Minimum-stay rule removed.";
  if (value === "addon-created") return "Add-on created.";
  if (value === "addon-updated") return "Add-on updated.";
  if (value === "addon-deleted") return "Add-on removed.";
  if (value === "promo-created") return "Promo code created.";
  if (value === "promo-updated") return "Promo code updated.";
  if (value === "promo-deleted") return "Promo code removed.";
  return null;
}

function petModeLabel(value: string | null | undefined) {
  if (value === "PER_NIGHT") return "per pet / night";
  if (value === "PER_PET_PER_STAY") return "per pet / stay";
  if (value === "FLAT_PER_STAY") return "flat per stay";
  return "per pet / night";
}

function normalizedPetMode(value: string | null | undefined) {
  if (value === "PER_NIGHT" || value === "PER_PET_PER_STAY" || value === "FLAT_PER_STAY") return value;
  return "PER_NIGHT";
}

export default async function PropertyRatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ result?: string; detail?: string; preview?: string; checkIn?: string; checkOut?: string; guests?: string; pets?: string; addOn?: string | string[]; promoCode?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const { property, pricing } = await getPricingWorkspaceBySlug(slug);
  const feeRecord = (type: string) => pricing.fees.find((item) => item.fee_type === type) ?? null;
  const fee = (type: string) => feeRecord(type)?.amount_cents ?? null;
  const petFee = feeRecord("PET");
  const petMode = normalizedPetMode(petFee?.calculation);
  const success = resultMessage(query.result);
  const selectedAddOns = Array.isArray(query.addOn) ? query.addOn : query.addOn ? [query.addOn] : [];
  const preview = query.preview ? await getHostQuotePreview({
    unitId: property.unitId,
    checkIn: query.checkIn || "",
    checkOut: query.checkOut || "",
    guests: Math.max(1, Number.parseInt(query.guests || "1", 10) || 1),
    pets: Math.max(0, Number.parseInt(query.pets || "0", 10) || 0),
    addOnIds: selectedAddOns,
    promotionCode: query.promoCode || "",
  }) : { quote: null, error: null };

  return <DashboardShell active="Rates & fees" title={property.form.name || "Property pricing"} eyebrow="Pricing & stay rules">
    <div className="pricing-detail-head">
      <div><Link href="/host/rates">← All property rates</Link><p>Set your standard rates, seasonal pricing, minimum stays, fees, discounts and optional extras for this property.</p></div>
      <Link className="button button-small button-quiet" href={`/host/properties/${property.form.slug}`}>Property details</Link>
    </div>

    {success ? <div className="admin-message success">{success}</div> : null}
    {query.result === "error" ? <div className="admin-message error">{query.detail || "Pricing could not be saved."}</div> : null}

    <section className="panel pricing-base-panel">
      <div className="panel-head"><div><p className="eyebrow dark">Base pricing</p><h2>Normal nightly rate & standard fees</h2></div><span className="pricing-currency">{pricing.base.currency || "USD"}</span></div>
      <form action={saveBasePricing} className="pricing-form-grid">
        <input type="hidden" name="unitId" value={property.unitId} /><input type="hidden" name="slug" value={property.form.slug} />
        <label><span>Weeknight rate</span><div className="money-input"><i>$</i><input required type="number" min="1" step="0.01" name="weeknight" defaultValue={dollars(pricing.base.weeknight_cents)} /></div><small>Sunday–Thursday.</small></label>
        <label><span>Weekend rate</span><div className="money-input"><i>$</i><input type="number" min="1" step="0.01" name="weekend" defaultValue={dollars(pricing.base.weekend_cents)} /></div><small>Friday–Saturday. Blank uses weeknight rate.</small></label>
        <label><span>Default minimum stay</span><input required type="number" min="1" max="365" name="minimumStay" defaultValue={pricing.base.minimum_stay_nights || 1} /><small>Used unless a date-specific minimum-stay rule overrides it.</small></label>
        <label><span>Cleaning fee</span><div className="money-input"><i>$</i><input type="number" min="0" step="0.01" name="cleaning" defaultValue={dollars(fee("CLEANING"))} /></div><small>Flat per stay.</small></label>
        <label><span>Pet fee amount</span><div className="money-input"><i>$</i><input type="number" min="0" step="0.01" name="pet" defaultValue={dollars(fee("PET"))} /></div><small>Enter the amount guests should be charged.</small></label>
        <label><span>Pet fee charge</span><select className={petStyles.modeSelect} name="petCalculation" defaultValue={petMode}><option value="PER_NIGHT">Per pet, per night</option><option value="PER_PET_PER_STAY">Per pet, per stay</option><option value="FLAT_PER_STAY">Flat per stay</option></select><small>Choose how the pet fee is applied to a reservation.</small></label>
        <label><span>Guests included in nightly rate</span><input type="number" min="1" max={property.form.maxGuests || "100"} name="includedGuests" defaultValue={pricing.base.included_guests ?? ""} placeholder={property.form.maxGuests || "All guests"} /><small>Leave blank if there is no additional-guest fee.</small></label>
        <label><span>Additional guest fee</span><div className="money-input"><i>$</i><input type="number" min="0" step="0.01" name="extraGuest" defaultValue={dollars(fee("EXTRA_GUEST"))} /></div><small>Per additional guest, per night.</small></label>
        <div className="pricing-form-actions"><div><strong>Commission basis</strong><span>Find A Place commission is based on the nightly lodging subtotal. Standard fees and optional add-ons stay separate.</span></div><button className="button" type="submit">Save base pricing</button></div>
      </form>
    </section>

    <div className="pricing-two-column">
      <section className="panel pricing-rule-section">
        <div className="panel-head"><div><p className="eyebrow dark">Special & seasonal rates</p><h2>Date-based nightly pricing</h2></div><span>{pricing.rate_rules.length}</span></div>
        <p className="muted">Use these for holidays, events, seasons or an advertised special. Higher priority wins when date ranges overlap.</p>
        <details className="pricing-create" open={!pricing.rate_rules.length}>
          <summary>+ Add date rate</summary>
          <RateRuleForm unitId={property.unitId} slug={property.form.slug} />
        </details>
        <div className="pricing-rule-list">{pricing.rate_rules.map((rule) => <details key={rule.id} className="pricing-rule-card">
          <summary><div><strong>{rule.label}</strong><span>{rule.start_date} → {rule.end_date}</span></div><div><b>{money(rule.nightly_cents)}</b>{rule.is_public_special ? <em>{rule.special_badge || "Special"}</em> : null}</div></summary>
          <RateRuleForm unitId={property.unitId} slug={property.form.slug} rule={rule} />
          <form action={deleteRateRule} className="pricing-delete"><input type="hidden" name="unitId" value={property.unitId} /><input type="hidden" name="slug" value={property.form.slug} /><input type="hidden" name="ruleId" value={rule.id} /><button type="submit">Remove date rate</button></form>
        </details>)}</div>
      </section>

      <section className="panel pricing-rule-section">
        <div className="panel-head"><div><p className="eyebrow dark">Minimum stays</p><h2>Holiday & date requirements</h2></div><span>{pricing.stay_rules.length}</span></div>
        <p className="muted">The property's normal minimum stay remains the fallback. A matching date rule overrides it for arrivals in that range.</p>
        <details className="pricing-create" open={!pricing.stay_rules.length}>
          <summary>+ Add minimum-stay rule</summary>
          <StayRuleForm unitId={property.unitId} slug={property.form.slug} />
        </details>
        <div className="pricing-rule-list">{pricing.stay_rules.map((rule) => <details key={rule.id} className="pricing-rule-card">
          <summary><div><strong>{rule.label}</strong><span>{rule.start_date} → {rule.end_date}</span></div><div><b>{rule.minimum_nights} nights</b></div></summary>
          <StayRuleForm unitId={property.unitId} slug={property.form.slug} rule={rule} />
          <form action={deleteStayRule} className="pricing-delete"><input type="hidden" name="unitId" value={property.unitId} /><input type="hidden" name="slug" value={property.form.slug} /><input type="hidden" name="ruleId" value={rule.id} /><button type="submit">Remove stay rule</button></form>
        </details>)}</div>
      </section>
    </div>

    <section className="panel pricing-rule-section pricing-addons-section">
      <div className="panel-head"><div><p className="eyebrow dark">Optional extras</p><h2>Guest add-ons</h2></div><span>{pricing.add_ons.length}</span></div>
      <p className="muted">Offer property-specific extras such as firewood, breakfast baskets, early check-in or special packages. Guests can select available extras during booking.</p>
      <details className="pricing-create" open={!pricing.add_ons.length}>
        <summary>+ Add optional extra</summary>
        <AddOnForm unitId={property.unitId} slug={property.form.slug} />
      </details>
      <div className="pricing-addon-grid">{pricing.add_ons.map((addon) => <details className="pricing-addon-card" key={addon.id}>
        <summary><div><strong>{addon.name}</strong><span>{addon.description || "No description"}</span></div><div><b>{money(addon.amount_cents)}</b><em>{calculationLabel(addon.calculation)}</em></div></summary>
        <AddOnForm unitId={property.unitId} slug={property.form.slug} addon={addon} />
        <form action={deleteAddOn} className="pricing-delete"><input type="hidden" name="unitId" value={property.unitId} /><input type="hidden" name="slug" value={property.form.slug} /><input type="hidden" name="addOnId" value={addon.id} /><button type="submit">Remove add-on</button></form>
      </details>)}</div>
    </section>

    <section className="panel pricing-rule-section pricing-promotions-section">
      <div className="panel-head"><div><p className="eyebrow dark">Promo & discount codes</p><h2>Host-controlled lodging discounts</h2></div><span>{pricing.promotion_codes.length}</span></div>
      <p className="muted">Create a percentage or fixed-dollar discount without changing your normal nightly rate. Promo codes apply to lodging only, and advertised special rates do not stack with a code unless you choose to allow it.</p>
      <details className="pricing-create" open={!pricing.promotion_codes.length}>
        <summary>+ Add promo code</summary>
        <PromotionCodeForm unitId={property.unitId} slug={property.form.slug} />
      </details>
      <div className="pricing-addon-grid">{pricing.promotion_codes.map((promotion) => <details className="pricing-addon-card" key={promotion.id}>
        <summary><div><strong>{promotion.code}</strong><span>{promotion.label} · {promotion.scope === "ORGANIZATION" ? "All host properties" : "This property"}</span></div><div><b>{promotionValueLabel(promotion)}</b><em>{promotion.is_active ? "Active" : "Inactive"}</em></div></summary>
        <PromotionCodeForm unitId={property.unitId} slug={property.form.slug} promotion={promotion} />
        <form action={deletePromotionCode} className="pricing-delete"><input type="hidden" name="unitId" value={property.unitId} /><input type="hidden" name="slug" value={property.form.slug} /><input type="hidden" name="promotionId" value={promotion.id} /><button type="submit">{promotion.scope === "ORGANIZATION" ? "Remove code from all host properties" : "Remove promo code"}</button></form>
      </details>)}</div>
    </section>

    <section className="panel pricing-preview-panel">
      <div className="panel-head"><div><p className="eyebrow dark">Pricing preview</p><h2>Preview a guest total</h2></div><span className="status-pill status-muted">Preview only</span></div>
      <p className="muted">Enter sample dates and guest details to see how your rates, fees, add-ons and promo codes come together before taxes. This preview does not create a reservation, charge a card or use a promo redemption.</p>
      <form method="get" className="pricing-preview-form">
        <input type="hidden" name="preview" value="1" />
        <label><span>Check-in</span><input required type="date" name="checkIn" defaultValue={query.checkIn || ""} /></label>
        <label><span>Checkout</span><input required type="date" name="checkOut" defaultValue={query.checkOut || ""} /></label>
        <label><span>Guests</span><input required type="number" min="1" max={property.form.maxGuests || "100"} name="guests" defaultValue={query.guests || "2"} /></label>
        <label><span>Pets</span><input type="number" min="0" name="pets" defaultValue={query.pets || "0"} /></label>
        <label><span>Promo code</span><input name="promoCode" maxLength={40} defaultValue={query.promoCode || ""} placeholder="FANCY25" /></label>
        {pricing.add_ons.filter((addon) => addon.is_active).length ? <div className="pricing-preview-addons"><strong>Optional add-ons</strong>{pricing.add_ons.filter((addon) => addon.is_active).map((addon) => <label className="checkline" key={addon.id}><input type="checkbox" name="addOn" value={addon.id} defaultChecked={selectedAddOns.includes(addon.id)} /><span>{addon.name} · {money(addon.amount_cents)} {calculationLabel(addon.calculation)}</span></label>)}</div> : null}
        <button className="button button-small" type="submit">Preview price</button>
      </form>
      {preview.error ? <div className="admin-message error pricing-preview-message">{preview.error}</div> : null}
      {preview.quote ? <div className="pricing-quote-result">
        <div className="pricing-quote-summary"><div><span>Nights</span><strong>{preview.quote.nights}</strong></div><div><span>Minimum stay</span><strong>{preview.quote.minimum_stay_nights}</strong></div><div><span>Lodging</span><strong>{money(preview.quote.lodging_subtotal_cents)}</strong>{preview.quote.discount_cents > 0 ? <small>{money(preview.quote.lodging_subtotal_before_discount_cents)} before discount</small> : null}</div><div><span>Pre-tax total</span><strong>{money(preview.quote.pre_tax_total_cents)}</strong></div></div>
        <div className="pricing-quote-lines"><strong>Nightly breakdown</strong>{preview.quote.lodging_lines.map((line) => <div key={line.date}><span>{line.date}{line.special_label ? ` · ${line.special_label}` : ""}</span><b>{money(line.amount_cents)}</b></div>)}{preview.quote.promotion ? <div className="discount-line"><span>Promo {preview.quote.promotion.code} · {preview.quote.promotion.label}</span><b>−{money(preview.quote.discount_cents)}</b></div> : null}{preview.quote.fee_lines.map((line) => <div key={line.id}><span>{line.label}{line.type === "PET" && petFee ? ` · ${petModeLabel(petFee.calculation)}` : ""}</span><b>{money(line.amount_cents)}</b></div>)}{preview.quote.add_on_lines.map((line) => <div key={line.id}><span>{line.name}</span><b>{money(line.amount_cents)}</b></div>)}</div>
        <div className="pricing-quote-boundary"><span>Commissionable lodging: <b>{money(preview.quote.commission_base_cents)}</b></span><span>Availability: <b>Not checked in preview</b></span><span>Taxes: <b>Added at checkout</b></span><span>Payment: <b>No charge created</b></span><span>Promo use: <b>Not counted</b></span></div>
      </div> : null}
    </section>
  </DashboardShell>;
}

function RateRuleForm({ unitId, slug, rule }: { unitId: string; slug: string; rule?: import("@/lib/host/pricing").PricingRule }) {
  return <form action={saveRateRule} className="pricing-inline-form">
    <input type="hidden" name="unitId" value={unitId} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="ruleId" value={rule?.id || ""} />
    <label className="wide"><span>Rule name</span><input required name="label" defaultValue={rule?.label || ""} placeholder="Christmas week, Fall special…" /></label>
    <label><span>Type</span><select name="kind" defaultValue={rule?.kind || "SPECIAL"}><option value="SPECIAL">Special</option><option value="SEASONAL">Seasonal</option><option value="CUSTOM">Custom</option></select></label>
    <label><span>Start</span><input required type="date" name="startDate" defaultValue={rule?.start_date || ""} /></label>
    <label><span>End</span><input required type="date" name="endDate" defaultValue={rule?.end_date || ""} /></label>
    <label><span>Nightly rate</span><div className="money-input"><i>$</i><input required type="number" min="1" step="0.01" name="nightly" defaultValue={dollars(rule?.nightly_cents)} /></div></label>
    <label><span>Weekend override</span><div className="money-input"><i>$</i><input type="number" min="1" step="0.01" name="weekend" defaultValue={dollars(rule?.weekend_cents)} /></div></label>
    <label><span>Priority</span><input type="number" min="0" max="1000" name="priority" defaultValue={rule?.priority ?? 100} /><small>Higher priority is used if date ranges overlap.</small></label>
    <label className="wide"><span>Guest-facing special label</span><input name="specialBadge" maxLength={80} defaultValue={rule?.special_badge || ""} placeholder="Holiday Special" /></label>
    <label className="checkline wide"><input type="checkbox" name="isPublicSpecial" defaultChecked={rule?.is_public_special ?? false} /><span>Allow this rate to be highlighted to guests as a special.</span></label>
    <label className="checkline wide"><input type="checkbox" name="isActive" defaultChecked={rule?.is_active ?? true} /><span>Rule active</span></label>
    <div className="pricing-inline-actions"><button className="button button-small" type="submit">{rule ? "Save date rate" : "Add date rate"}</button></div>
  </form>;
}

function StayRuleForm({ unitId, slug, rule }: { unitId: string; slug: string; rule?: import("@/lib/host/pricing").StayRule }) {
  return <form action={saveStayRule} className="pricing-inline-form">
    <input type="hidden" name="unitId" value={unitId} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="ruleId" value={rule?.id || ""} />
    <label className="wide"><span>Rule name</span><input required name="label" defaultValue={rule?.label || ""} placeholder="Christmas minimum stay" /></label>
    <label><span>Start</span><input required type="date" name="startDate" defaultValue={rule?.start_date || ""} /></label>
    <label><span>End</span><input required type="date" name="endDate" defaultValue={rule?.end_date || ""} /></label>
    <label><span>Minimum nights</span><input required type="number" min="1" max="365" name="minimumNights" defaultValue={rule?.minimum_nights ?? 2} /></label>
    <label><span>Priority</span><input type="number" min="0" max="1000" name="priority" defaultValue={rule?.priority ?? 100} /></label>
    <label className="checkline wide"><input type="checkbox" name="isActive" defaultChecked={rule?.is_active ?? true} /><span>Rule active</span></label>
    <div className="pricing-inline-actions"><button className="button button-small" type="submit">{rule ? "Save stay rule" : "Add stay rule"}</button></div>
  </form>;
}

function PromotionCodeForm({ unitId, slug, promotion }: { unitId: string; slug: string; promotion?: import("@/lib/host/pricing").PromotionCode }) {
  const discountValue = promotion?.discount_type === "PERCENT"
    ? ((promotion.percent_bps ?? 0) / 100).toString()
    : dollars(promotion?.amount_cents);
  return <form action={savePromotionCode} className="pricing-inline-form promo-form">
    <input type="hidden" name="unitId" value={unitId} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="promotionId" value={promotion?.id || ""} />
    <label><span>Promo code</span><input required name="code" maxLength={40} defaultValue={promotion?.code || ""} placeholder="FANCY25" autoCapitalize="characters" /><small>Letters, numbers, dashes and underscores.</small></label>
    <label className="wide"><span>Promo name</span><input required name="label" maxLength={120} defaultValue={promotion?.label || ""} placeholder="25% direct booking special" /></label>
    <label><span>Applies to</span><select name="scope" defaultValue={promotion?.scope || "PROPERTY"}><option value="PROPERTY">This property</option><option value="ORGANIZATION">All properties on this host account</option></select></label>
    <label><span>Discount type</span><select name="discountType" defaultValue={promotion?.discount_type || "PERCENT"}><option value="PERCENT">Percentage off lodging</option><option value="FIXED">Fixed dollars off lodging</option></select></label>
    <label><span>Discount value</span><input required type="number" min="0.01" step="0.01" name="discountValue" defaultValue={discountValue} placeholder="25" /><small>For percentage codes, 25 means 25%.</small></label>
    <label><span>Eligible check-in starts</span><input type="date" name="eligibleStart" defaultValue={promotion?.eligible_check_in_start || ""} /></label>
    <label><span>Eligible check-in ends</span><input type="date" name="eligibleEnd" defaultValue={promotion?.eligible_check_in_end || ""} /></label>
    <label><span>Minimum nights</span><input type="number" min="1" max="365" name="minimumNights" defaultValue={promotion?.minimum_nights ?? ""} /></label>
    <label><span>Minimum lodging subtotal</span><div className="money-input"><i>$</i><input type="number" min="0" step="0.01" name="minimumLodging" defaultValue={dollars(promotion?.minimum_lodging_cents)} /></div></label>
    <label><span>Maximum uses</span><input type="number" min="1" name="maxRedemptions" defaultValue={promotion?.max_redemptions ?? ""} /><small>Set the total number of times this code can be used. Leave blank for no limit.</small></label>
    <label className="checkline wide"><input type="checkbox" name="allowWithPublicSpecial" defaultChecked={promotion?.allow_with_public_special ?? false} /><span>Allow this code to combine with an advertised special rate.</span></label>
    <label className="checkline wide"><input type="checkbox" name="isActive" defaultChecked={promotion?.is_active ?? true} /><span>Promo code active</span></label>
    <div className="pricing-inline-actions"><button className="button button-small" type="submit">{promotion ? "Save promo code" : "Add promo code"}</button></div>
  </form>;
}

function AddOnForm({ unitId, slug, addon }: { unitId: string; slug: string; addon?: import("@/lib/host/pricing").UnitAddOn }) {
  return <form action={saveAddOn} className="pricing-inline-form addon-form">
    <input type="hidden" name="unitId" value={unitId} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="addOnId" value={addon?.id || ""} />
    <label className="wide"><span>Name</span><input required name="name" maxLength={120} defaultValue={addon?.name || ""} placeholder="Romance package" /></label>
    <label className="wide"><span>Description</span><textarea name="description" maxLength={1000} defaultValue={addon?.description || ""} placeholder="What the guest receives." /></label>
    <label><span>Price</span><div className="money-input"><i>$</i><input required type="number" min="0" step="0.01" name="amount" defaultValue={dollars(addon?.amount_cents)} /></div></label>
    <label><span>Charge</span><select name="calculation" defaultValue={addon?.calculation || "FLAT_PER_STAY"}><option value="FLAT_PER_STAY">Per stay</option><option value="PER_NIGHT">Per night</option><option value="PER_PERSON">Per person</option><option value="PER_PERSON_PER_NIGHT">Per person / night</option></select></label>
    <label><span>Display order</span><input type="number" name="sortOrder" defaultValue={addon?.sort_order ?? 0} /><small>Lower numbers appear first.</small></label>
    <label className="checkline wide"><input type="checkbox" name="guestVisible" defaultChecked={addon?.guest_visible ?? true} /><span>Show this extra to guests during booking.</span></label>
    <label className="checkline wide"><input type="checkbox" name="isActive" defaultChecked={addon?.is_active ?? true} /><span>Add-on active</span></label>
    <div className="pricing-inline-actions"><button className="button button-small" type="submit">{addon ? "Save add-on" : "Add extra"}</button></div>
  </form>;
}
