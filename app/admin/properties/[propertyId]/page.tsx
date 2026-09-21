import Link from "next/link";
import { notFound } from "next/navigation";

import { reviewPropertyListing, setPropertyLiveCheckout, setPropertyPublication } from "@/app/admin/actions";
import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { cleanStatus, formatAdminDate } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/server";
import { createSignedUrlMap } from "@/lib/storage/signed-urls";

export default async function AdminPropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const context = await getAdminContext();
  const [{ propertyId }, query] = await Promise.all([params, searchParams]);
  const canReview = hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"]);
  const supabase = await createClient();
  const { data: property } = await supabase.from("properties").select("id,organization_id,name,description,property_type,status,live_checkout_enabled,public_area,street_address,city,region_code,postal_code,country_code,exact_address_public,notification_email,operations_email,calendar_preference,custom_amenities,custom_policies,submitted_at,approved_at,published_at,reviewed_at,review_note,created_at,updated_at").eq("id", propertyId).maybeSingle();
  if (!property) notFound();

  const [{ data: organization }, { data: unit }, { data: reviewEvents }] = await Promise.all([
    supabase.from("organizations").select("id,name,partner_status,commission_tier,contact_email").eq("id", property.organization_id).maybeSingle(),
    supabase.from("property_units").select("id,name,slug,max_guests,bedrooms,beds,bathrooms,minimum_stay_nights,check_in,checkout,cancellation_policy").eq("property_id", propertyId).eq("is_primary", true).maybeSingle(),
    supabase.from("property_review_events").select("id,event_type,from_status,to_status,note,created_at,actor_profile_id").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(20),
  ]);
  if (!unit) notFound();

  const [ratesResult, feesResult, imagesResult, amenitiesResult, policiesResult, rateRulesResult, stayRulesResult, addOnsResult, promotionsResult] = await Promise.all([
    supabase.from("unit_rate_settings").select("weeknight_cents,weekend_cents,currency,included_guests").eq("unit_id", unit.id).maybeSingle(),
    supabase.from("unit_fees").select("fee_type,label,amount_cents,calculation").eq("unit_id", unit.id),
    supabase.from("property_images").select("id,storage_path,original_name,alt_text,sort_order").eq("unit_id", unit.id).order("sort_order", { ascending: true }),
    supabase.from("unit_amenities").select("amenity_code").eq("unit_id", unit.id),
    supabase.from("unit_policies").select("policy_code,configuration").eq("unit_id", unit.id),
    supabase.from("unit_rate_rules").select("id,label,kind,start_date,end_date,nightly_cents,weekend_cents,is_public_special,special_badge,is_active").eq("unit_id", unit.id).order("start_date", { ascending: true }),
    supabase.from("unit_stay_rules").select("id,label,start_date,end_date,minimum_nights,is_active").eq("unit_id", unit.id).order("start_date", { ascending: true }),
    supabase.from("unit_add_ons").select("id,name,amount_cents,calculation,guest_visible,is_active").eq("unit_id", unit.id).order("sort_order", { ascending: true }),
    supabase.from("promotion_codes").select("id,unit_id,code,label,discount_type,percent_bps,amount_cents,eligible_check_in_start,eligible_check_in_end,minimum_nights,max_redemptions,redemption_count,allow_with_public_special,is_active,archived_at").eq("organization_id", property.organization_id).is("archived_at", null).order("created_at", { ascending: false }),
  ]);
  const promotions = (promotionsResult.data ?? []).filter((promo) => promo.unit_id === null || promo.unit_id === unit.id);
  const amenityCodes = (amenitiesResult.data ?? []).map((row) => row.amenity_code as string);
  const policyCodes = (policiesResult.data ?? []).map((row) => row.policy_code as string);
  const [{ data: amenityCatalog }, { data: policyCatalog }] = await Promise.all([
    amenityCodes.length ? supabase.from("amenity_catalog").select("code,label").in("code", amenityCodes) : Promise.resolve({ data: [] as { code: string; label: string }[] }),
    policyCodes.length ? supabase.from("policy_catalog").select("code,label").in("code", policyCodes) : Promise.resolve({ data: [] as { code: string; label: string }[] }),
  ]);
  const amenityMap = new Map((amenityCatalog ?? []).map((row) => [row.code as string, row.label as string]));
  const policyMap = new Map((policyCatalog ?? []).map((row) => [row.code as string, row.label as string]));
  const imageRows = imagesResult.data ?? [];
  const signedImageByPath = await createSignedUrlMap(supabase, "property-images", imageRows.map((image) => image.storage_path as string), 3600);
  const images = imageRows.map((image) => ({ ...image, signedUrl: signedImageByPath.get(image.storage_path as string) ?? null }));
  const money = (cents: number | null | undefined) => cents == null ? "Not set" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  return <AdminShell active="properties" eyebrow="Property review" title={property.name} context={context}>
    <div className="admin-detail-back"><Link href="/admin/properties">← Back to properties</Link>{property.status === "PUBLISHED" ? <Link href={`/stays/${unit.slug}`} target="_blank">Open public listing ↗</Link> : null}</div>
    {query.saved ? <div className="admin-message success">{query.saved}</div> : null}
    {query.error ? <div className="admin-message error">{query.error}</div> : null}

    <div className="admin-detail-grid"><section className="panel"><p className="eyebrow dark">Listing identity</p><h2>{property.name}</h2><dl className="admin-detail-list"><div><dt>Status</dt><dd>{cleanStatus(property.status)}</dd></div><div><dt>Organization</dt><dd>{organization?.name || "Unknown"}</dd></div><div><dt>Commission tier</dt><dd>{organization ? cleanStatus(organization.commission_tier) : "—"}</dd></div><div><dt>Shareable URL</dt><dd><code>/stays/{unit.slug}</code></dd></div><div><dt>Submitted</dt><dd>{property.submitted_at ? formatAdminDate(property.submitted_at) : "Not submitted"}</dd></div><div><dt>Approved</dt><dd>{property.approved_at ? formatAdminDate(property.approved_at) : "Not approved"}</dd></div><div><dt>Published</dt><dd>{property.published_at ? formatAdminDate(property.published_at) : "Not published"}</dd></div></dl></section><section className="panel"><p className="eyebrow dark">Operations</p><h2>Current state</h2><div className="admin-state-stack"><div><span>Calendar preference</span><strong>{cleanStatus(property.calendar_preference)}</strong></div><div><span>Photos</span><strong>{images.length}</strong></div><div><span>Max guests</span><strong>{unit.max_guests || "Not set"}</strong></div><div><span>Weeknight</span><strong>{money(ratesResult.data?.weeknight_cents)}</strong></div><div><span>Weekend</span><strong>{money(ratesResult.data?.weekend_cents)}</strong></div><div><span>Date rates</span><strong>{rateRulesResult.data?.filter((rule) => rule.is_active).length ?? 0}</strong></div><div><span>Stay rules</span><strong>{stayRulesResult.data?.filter((rule) => rule.is_active).length ?? 0}</strong></div><div><span>Add-ons</span><strong>{addOnsResult.data?.filter((addon) => addon.is_active).length ?? 0}</strong></div><div><span>Promo codes</span><strong>{promotions.filter((promo) => promo.is_active).length}</strong></div><div><span>Live checkout</span><strong>{property.live_checkout_enabled ? "Enabled" : "Blocked"}</strong></div></div></section></div>

    {canReview && property.status === "PUBLISHED" ? <section className="panel admin-publication-actions"><div><p className="eyebrow dark">Live checkout access</p><h2>{property.live_checkout_enabled ? "Live checkout is enabled" : "Live checkout is blocked"}</h2><p>Test bookings are unaffected. Live checkout will only proceed after tax, payout, security, email and calendar checks pass.</p></div><form action={setPropertyLiveCheckout}><input type="hidden" name="property_id" value={property.id} /><input type="hidden" name="live_checkout_enabled" value={property.live_checkout_enabled ? "false" : "true"} /><label><span>Required reason</span><input name="live_checkout_reason" required placeholder={property.live_checkout_enabled ? "Why live checkout is being disabled" : "Pilot approval and verification note"} /></label><button className={`button ${property.live_checkout_enabled ? "button-quiet" : ""}`} type="submit">{property.live_checkout_enabled ? "Disable live checkout" : "Enable live checkout"}</button></form></section> : null}

    {property.review_note ? <section className="panel admin-review-note"><p className="eyebrow dark">Latest review note</p><p>{property.review_note}</p></section> : null}

    {canReview && property.status === "PENDING_REVIEW" ? <section className="panel admin-review-actions"><div><p className="eyebrow dark">Review decision</p><h2>Approve, return for changes or reject</h2><p>Approval is separate from publication. Approving this property does not make it public until a second publish action is taken.</p></div><form action={reviewPropertyListing}><input type="hidden" name="property_id" value={property.id} /><label><span>Review note</span><textarea name="review_note" placeholder="Required when requesting changes or rejecting. Optional for approval." /></label><div className="admin-review-buttons"><button className="button button-quiet" name="decision" value="request_changes" type="submit">Request changes</button><button className="button button-quiet danger" name="decision" value="reject" type="submit">Reject</button><button className="button" name="decision" value="approve" type="submit">Approve listing</button></div></form></section> : null}

    {canReview && ["APPROVED", "PAUSED"].includes(property.status) ? <section className="panel admin-publication-actions"><div><p className="eyebrow dark">Publication</p><h2>{property.status === "PAUSED" ? "Return this approved listing to the marketplace" : "Publish this approved listing"}</h2><p>Publication makes the guest-facing listing visible. Calendar availability and test checkout can operate after their own setup; live payments still require live checkout access to be enabled.</p></div><form action={setPropertyPublication}><input type="hidden" name="property_id" value={property.id} /><input type="hidden" name="publication_action" value="publish" /><label><span>Optional publication note</span><input name="publication_note" placeholder="Internal note" /></label><button className="button" type="submit">Publish to marketplace →</button></form></section> : null}

    {canReview && property.status === "PUBLISHED" ? <section className="panel admin-publication-actions"><div><p className="eyebrow dark">Publication</p><h2>Listing is public</h2><p>Pause removes it from guest-facing marketplace results without deleting the property or review history.</p></div><form action={setPropertyPublication}><input type="hidden" name="property_id" value={property.id} /><input type="hidden" name="publication_action" value="pause" /><label><span>Optional reason</span><input name="publication_note" placeholder="Internal note" /></label><button className="button button-quiet" type="submit">Pause public listing</button></form></section> : null}

    {images.length ? <section className="panel admin-property-photos"><div className="panel-head"><div><p className="eyebrow dark">Photos</p><h2>Stored property imagery</h2></div><span className="status-pill status-muted">{property.status === "PUBLISHED" ? "Guest-visible signed assets" : "Private bucket"}</span></div><div className="admin-photo-grid">{images.map((image) => image.signedUrl ? <img key={image.id} src={image.signedUrl} alt={image.alt_text || property.name} /> : null)}</div></section> : null}

    <div className="dash-two"><section className="panel"><p className="eyebrow dark">Property</p><h2>Location & capacity</h2><dl className="admin-detail-list"><div><dt>Type</dt><dd>{property.property_type || "Not set"}</dd></div><div><dt>Public area</dt><dd>{property.public_area || "Not set"}</dd></div><div><dt>Exact address</dt><dd>{[property.street_address, property.city, property.region_code, property.postal_code].filter(Boolean).join(", ") || "Not set"}</dd></div><div><dt>Address public</dt><dd>{property.exact_address_public ? "Yes" : "No"}</dd></div><div><dt>Bedrooms / beds</dt><dd>{unit.bedrooms ?? "—"} / {unit.beds ?? "—"}</dd></div><div><dt>Bathrooms</dt><dd>{unit.bathrooms ?? "—"}</dd></div><div><dt>Minimum stay</dt><dd>{unit.minimum_stay_nights} nights</dd></div></dl></section><section className="panel"><p className="eyebrow dark">Routing</p><h2>Contacts & fees</h2><dl className="admin-detail-list"><div><dt>Booking email</dt><dd>{property.notification_email || "Not set"}</dd></div><div><dt>Operations email</dt><dd>{property.operations_email || "Not set"}</dd></div>{(feesResult.data ?? []).map((fee) => <div key={fee.fee_type}><dt>{cleanStatus(fee.fee_type)}</dt><dd>{money(fee.amount_cents)}</dd></div>)}</dl></section></div>

    <section className="panel admin-pricing-ops"><div className="panel-head"><div><p className="eyebrow dark">Pricing operations</p><h2>Rates, stay rules, promos & extras</h2></div><span className="status-pill status-muted">Operational pricing</span></div><div className="admin-pricing-columns"><div><strong>Date rates</strong>{rateRulesResult.data?.length ? rateRulesResult.data.map((rule) => <span key={rule.id}>{rule.label} · {rule.start_date}–{rule.end_date} · {money(rule.nightly_cents)}{rule.is_public_special ? ` · ${rule.special_badge || "Special"}` : ""}{rule.is_active ? "" : " · inactive"}</span>) : <span>No date rates</span>}</div><div><strong>Minimum-stay rules</strong>{stayRulesResult.data?.length ? stayRulesResult.data.map((rule) => <span key={rule.id}>{rule.label} · {rule.start_date}–{rule.end_date} · {rule.minimum_nights} nights{rule.is_active ? "" : " · inactive"}</span>) : <span>No date-specific stay rules</span>}</div><div><strong>Promo codes</strong>{promotions.length ? promotions.map((promo) => <span key={promo.id}>{promo.code} · {promo.discount_type === "PERCENT" ? `${((promo.percent_bps ?? 0) / 100).toFixed((promo.percent_bps ?? 0) % 100 ? 2 : 0)}% off` : `${money(promo.amount_cents)} off`} · {promo.unit_id ? "property" : "organization"}{promo.allow_with_public_special ? " · may stack with advertised specials" : ""}{promo.is_active ? "" : " · inactive"}</span>) : <span>No promo codes</span>}</div><div><strong>Add-ons</strong>{addOnsResult.data?.length ? addOnsResult.data.map((addon) => <span key={addon.id}>{addon.name} · {money(addon.amount_cents)} · {cleanStatus(addon.calculation)}{addon.is_active ? "" : " · inactive"}</span>) : <span>No optional add-ons</span>}</div></div></section>

    <section className="panel"><div className="panel-head"><div><p className="eyebrow dark">Guest-facing structure</p><h2>Amenities & policies</h2></div><span className="status-pill status-muted">Review data</span></div><div className="admin-capability-grid"><div><strong>Amenities</strong>{amenityCodes.length ? amenityCodes.map((code) => <span key={code}>{amenityMap.get(code) || code}</span>) : <span>None selected</span>}{property.custom_amenities ? <span>Custom: {property.custom_amenities}</span> : null}</div><div><strong>Policies</strong>{policyCodes.length ? policyCodes.map((code) => <span key={code}>{policyMap.get(code) || code}</span>) : <span>None selected</span>}{property.custom_policies ? <span>Custom: {property.custom_policies}</span> : null}</div></div></section>

    <section className="panel admin-review-history"><div className="panel-head"><div><p className="eyebrow dark">Review history</p><h2>Property lifecycle</h2></div><span className="status-pill status-muted">Append only</span></div>{reviewEvents?.length ? <div className="admin-list compact">{reviewEvents.map((event) => <div className="admin-list-row static" key={event.id}><span><strong>{cleanStatus(event.event_type)}</strong><small>{cleanStatus(event.from_status || "NEW")} → {cleanStatus(event.to_status)} · {formatAdminDate(event.created_at)}</small>{event.note ? <small>{event.note}</small> : null}</span></div>)}</div> : <div className="panel-empty"><strong>No review events yet.</strong><span>The first host submission will start this permanent timeline.</span></div>}</section>
  </AdminShell>;
}
