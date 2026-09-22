import {
  createTaxAuthority,
  createTaxRule,
  savePropertyTaxProfile,
} from "@/app/admin/taxes/actions";
import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

type PropertyRow = {
  id: string;
  name: string;
  street_address: string | null;
  city: string | null;
  region_code: string | null;
  postal_code: string | null;
  country_code: string | null;
  status: string;
};

type AuthorityRow = {
  id: string;
  code: string;
  name: string;
  jurisdiction_type: string;
  country_code: string;
  region_code: string | null;
  locality_name: string | null;
  remittance_agency: string;
  source_url: string | null;
  is_active: boolean;
};

type RuleRow = {
  id: string;
  authority_id: string;
  code: string;
  label: string;
  rate_bps: number;
  base_scope: string;
  automatic_region: boolean;
  assignment_required: boolean;
  maximum_stay_nights: number | null;
  effective_from: string;
  effective_to: string | null;
  source_url: string | null;
  is_active: boolean;
};

type ProfileRow = {
  property_id: string;
  verification_status: string;
  county_name: string | null;
  locality_name: string | null;
  verification_notes: string | null;
  verified_at: string | null;
  last_rate_review_at: string | null;
};

type AssignmentRow = { property_id: string; tax_rule_id: string };

function percent(bps: number) {
  return `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;
}

function when(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default async function AdminTaxesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [context, query] = await Promise.all([getAdminContext(), searchParams]);
  const canManage = hasAnyAdminRole(context, ["SUPER_ADMIN", "FINANCE_ADMIN"]);
  const supabase = await createClient();

  const [
    propertyResult,
    authorityResult,
    ruleResult,
    profileResult,
    assignmentResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select("id,name,street_address,city,region_code,postal_code,country_code,status")
      .neq("status", "ARCHIVED")
      .order("name"),
    supabase.from("tax_authorities").select("*").eq("is_active", true).order("name"),
    supabase.from("tax_rules").select("*").eq("is_active", true).order("label"),
    supabase.from("property_tax_profiles").select("*"),
    supabase.from("property_tax_rule_assignments").select("property_id,tax_rule_id"),
  ]);

  const firstError =
    propertyResult.error ??
    authorityResult.error ??
    ruleResult.error ??
    profileResult.error ??
    assignmentResult.error;

  if (firstError) {
    throw new Error(
      "Unable to load tax operations. Apply the marketplace lodging-tax migration and refresh.",
    );
  }

  const properties = (propertyResult.data ?? []) as PropertyRow[];
  const authorities = (authorityResult.data ?? []) as AuthorityRow[];
  const rules = (ruleResult.data ?? []) as RuleRow[];
  const profiles = (profileResult.data ?? []) as ProfileRow[];
  const assignments = (assignmentResult.data ?? []) as AssignmentRow[];

  const authorityById = new Map(authorities.map((authority) => [authority.id, authority]));
  const profileByProperty = new Map(profiles.map((profile) => [profile.property_id, profile]));
  const assignedByProperty = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const set = assignedByProperty.get(assignment.property_id) ?? new Set<string>();
    set.add(assignment.tax_rule_id);
    assignedByProperty.set(assignment.property_id, set);
  }

  const automaticRules = rules.filter((rule) => rule.automatic_region && !rule.assignment_required);
  const assignableRules = rules.filter((rule) => rule.assignment_required);
  const verifiedCount = profiles.filter((profile) => profile.verification_status === "VERIFIED").length;
  const needsReview = Math.max(properties.length - verifiedCount, 0);

  return (
    <AdminShell
      active="taxes"
      eyebrow="Guest tax configuration"
      title="Property tax rates"
      context={context}
    >
      {query.saved ? <div className="admin-message success">{query.saved}</div> : null}
      {query.error ? <div className="admin-message error">{query.error}</div> : null}

      <div className="metrics dash-grid">
        <div><span>Properties verified</span><strong>{verifiedCount}</strong><small>{needsReview} still need locality review</small></div>
        <div><span>Payment settlement</span><strong>Host</strong><small>Guest tax goes into the host's connected charge</small></div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">How checkout works</p>
            <h2>Guest taxes settle with the host.</h2>
          </div>
        </div>
        <p className="muted">
          Commission still uses the existing discounted lodging subtotal. Tax is added to the guest total,
          charged directly on the host's connected Stripe account, and kept by the host for reporting and remittance.
          Find A Place keeps only its commission. Local rules do not turn on until the property jurisdiction is verified here.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Property jurisdiction</p>
            <h2>Verify the exact taxes for each stay.</h2>
          </div>
          <span className="status-pill status-muted">{properties.length} properties</span>
        </div>

        <div className="admin-list">
          {properties.map((property) => {
            const profile = profileByProperty.get(property.id);
            const assigned = assignedByProperty.get(property.id) ?? new Set<string>();
            const regionAutomaticRules = automaticRules.filter((rule) => {
              const authority = authorityById.get(rule.authority_id);
              return (
                (!authority?.region_code || authority.region_code === property.region_code) &&
                (!authority?.country_code || authority.country_code === (property.country_code || "US"))
              );
            });

            return (
              <details className="admin-list-row static" key={property.id}>
                <summary>
                  <span>
                    <strong>{property.name}</strong>
                    <small>
                      {[property.street_address, property.city, property.region_code, property.postal_code]
                        .filter(Boolean)
                        .join(", ") || "Address incomplete"}
                    </small>
                    <small>
                      {profile?.verification_status === "VERIFIED"
                        ? `Verified ${when(profile.verified_at)}`
                        : "Local tax review required before LIVE checkout"}
                    </small>
                  </span>
                  <span>
                    <em>{profile?.verification_status ?? "PENDING"}</em>
                    <b>Configure ↓</b>
                  </span>
                </summary>

                <div className="panel" style={{ marginTop: 16 }}>
                  <div className="inline-note commission-note">
                    <strong>Automatic rules</strong>
                    <span>
                      {regionAutomaticRules.length
                        ? regionAutomaticRules
                            .map((rule) => `${rule.label} ${percent(rule.rate_bps)}`)
                            .join(" · ")
                        : "No automatic rules match this property region."}
                    </span>
                  </div>

                  {canManage ? (
                    <form action={savePropertyTaxProfile} className="settings-form">
                      <input type="hidden" name="propertyId" value={property.id} />
                      <div className="form-row">
                        <label>
                          <span>County</span>
                          <input name="countyName" defaultValue={profile?.county_name ?? ""} placeholder="Garland" />
                        </label>
                        <label>
                          <span>Tax locality / city</span>
                          <input name="localityName" defaultValue={profile?.locality_name ?? property.city ?? ""} placeholder="Hot Springs" />
                        </label>
                      </div>

                      <label>
                        <span>Verification notes</span>
                        <textarea
                          name="verificationNotes"
                          defaultValue={profile?.verification_notes ?? ""}
                          placeholder="DFA address lookup checked; inside Hot Springs city limits; A&P applies."
                        />
                      </label>

                      <div className="selection-groups">
                        <details open>
                          <summary><strong>Local rules assigned to this property</strong><span>{assigned.size} selected</span></summary>
                          <div className="amenity-picker">
                            {assignableRules.map((rule) => {
                              const authority = authorityById.get(rule.authority_id);
                              return (
                                <label className={assigned.has(rule.id) ? "selected" : ""} key={rule.id}>
                                  <input
                                    type="checkbox"
                                    name="taxRuleId"
                                    value={rule.id}
                                    defaultChecked={assigned.has(rule.id)}
                                  />
                                  <span>
                                    {rule.label} · {percent(rule.rate_bps)} · {authority?.remittance_agency ?? "Tax authority"}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </details>
                      </div>

                      <div className="inline-note">
                        <strong>30+ night stays</strong>
                        <span>LIVE checkout is blocked for 30 nights or more until contract-based transient-tax handling is implemented.</span>
                      </div>

                      <label className="checkline">
                        <input
                          type="checkbox"
                          name="verified"
                          defaultChecked={profile?.verification_status === "VERIFIED"}
                        />
                        <span>
                          Mark this exact address/locality configuration verified for LIVE checkout.
                        </span>
                      </label>

                      <button className="button button-small" type="submit">Save tax configuration</button>
                    </form>
                  ) : (
                    <p className="muted">Finance-admin access is required to change property tax rules.</p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </section>

      <div className="dash-two">
        <section className="panel">
          <div className="panel-head">
            <div><p className="eyebrow dark">Tax rules</p><h2>Effective-dated rates</h2></div>
          </div>
          <div className="admin-list compact">
            {rules.map((rule) => {
              const authority = authorityById.get(rule.authority_id);
              return (
                <div className="admin-list-row static" key={rule.id}>
                  <span>
                    <strong>{rule.label} · {percent(rule.rate_bps)}</strong>
                    <small>{authority?.name ?? "Unknown authority"}</small>
                    <small>
                      {rule.effective_from} → {rule.effective_to ?? "current"} · {rule.base_scope.replaceAll("_", " ")}
                    </small>
                  </span>
                  <span>
                    <em>{rule.assignment_required ? "PROPERTY ASSIGNMENT" : "AUTOMATIC"}</em>
                    <small>{rule.maximum_stay_nights ? `≤ ${rule.maximum_stay_nights} nights` : "No night cap"}</small>
                  </span>
                </div>
              );
            })}
          </div>

          {canManage ? (
            <details className="pricing-create">
              <summary>+ Add local tax rule</summary>
              <form action={createTaxRule} className="settings-form">
                <label><span>Authority</span><select name="authorityId" required>{authorities.map((authority) => <option key={authority.id} value={authority.id}>{authority.name}</option>)}</select></label>
                <div className="form-row">
                  <label><span>Rule code</span><input name="code" required placeholder="EUREKA_SPRINGS_CAP_2026" /></label>
                  <label><span>Label</span><input name="label" required placeholder="Local lodging tax" /></label>
                </div>
                <div className="form-row">
                  <label><span>Rate %</span><input type="number" min="0" max="100" step="0.001" name="ratePercent" required placeholder="3" /></label>
                  <label><span>Tax base</span><select name="baseScope" defaultValue="ACCOMMODATION_TOTAL"><option value="ACCOMMODATION_TOTAL">Accommodation total</option><option value="LODGING_ONLY">Lodging only</option><option value="PRE_TAX_TOTAL">All pre-tax charges</option></select></label>
                </div>
                <div className="form-row">
                  <label><span>Effective from</span><input type="date" name="effectiveFrom" required /></label>
                  <label><span>Effective through</span><input type="date" name="effectiveTo" /></label>
                </div>
                <label><span>Maximum transient stay nights</span><input type="number" min="1" name="maximumStayNights" placeholder="29" /></label>
                <label><span>Official source URL</span><input type="url" name="sourceUrl" /></label>
                <button className="button button-small" type="submit">Create tax rule</button>
              </form>
            </details>
          ) : null}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div><p className="eyebrow dark">Authorities</p><h2>Who receives the tax</h2></div>
          </div>
          <div className="admin-list compact">
            {authorities.map((authority) => (
              <div className="admin-list-row static" key={authority.id}>
                <span><strong>{authority.name}</strong><small>{authority.remittance_agency}</small></span>
                <span><em>{authority.jurisdiction_type.replaceAll("_", " ")}</em><small>{authority.locality_name || authority.region_code || authority.country_code}</small></span>
              </div>
            ))}
          </div>

          {canManage ? (
            <details className="pricing-create">
              <summary>+ Add tax authority</summary>
              <form action={createTaxAuthority} className="settings-form">
                <div className="form-row">
                  <label><span>Code</span><input name="code" required placeholder="EUREKA_SPRINGS_CAP" /></label>
                  <label><span>Name</span><input name="name" required placeholder="Eureka Springs CAPC" /></label>
                </div>
                <label><span>Type</span><select name="jurisdictionType" defaultValue="LOCAL_LODGING"><option value="LOCAL_LODGING">Local lodging</option><option value="CITY_SALES">City sales</option><option value="COUNTY_SALES">County sales</option><option value="STATE_SALES">State sales</option><option value="STATE_TOURISM">State tourism</option><option value="OTHER">Other</option></select></label>
                <div className="form-row">
                  <label><span>Country</span><input name="countryCode" defaultValue="US" maxLength={2} /></label>
                  <label><span>State / region</span><input name="regionCode" defaultValue="AR" /></label>
                </div>
                <label><span>Locality</span><input name="localityName" placeholder="Eureka Springs" /></label>
                <label><span>Remittance agency</span><input name="remittanceAgency" required /></label>
                <label><span>Official source URL</span><input type="url" name="sourceUrl" /></label>
                <button className="button button-small" type="submit">Create authority</button>
              </form>
            </details>
          ) : null}
        </section>
      </div>

    </AdminShell>
  );
}
