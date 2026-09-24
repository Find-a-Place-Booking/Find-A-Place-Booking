import {
  createTaxAuthority,
  createTaxRule,
  savePropertyTaxAssistance,
} from "@/app/admin/taxes/actions";
import { AdminShell } from "@/components/AdminShell";
import {
  PropertyTaxLineFields,
  type PropertyTaxLineInput,
} from "@/components/taxes/PropertyTaxLineFields";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";
import { getStateTaxSetup } from "@/lib/taxes/state-config";

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
  county_name: string | null;
  locality_name: string | null;
  verification_notes: string | null;
  host_responsibility_ack: boolean;
  host_certified_at: string | null;
  configuration_source: string | null;
  legacy_checkout_allowed: boolean;
};

type TaxLineRow = PropertyTaxLineInput & {
  id: string;
  property_id: string;
  sort_order: number;
};

function percent(bps: number) {
  return `${(Number(bps || 0) / 100).toFixed(bps % 100 ? 2 : 0)}%`;
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
  const [context, query] = await Promise.all([
    getAdminContext(),
    searchParams,
  ]);
  const canManage = hasAnyAdminRole(context, [
    "SUPER_ADMIN",
    "FINANCE_ADMIN",
  ]);
  const supabase = await createClient();

  const [
    propertyResult,
    authorityResult,
    ruleResult,
    profileResult,
    taxLineResult,
  ] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id,name,street_address,city,region_code,postal_code,country_code,status",
      )
      .neq("status", "ARCHIVED")
      .order("name"),
    supabase
      .from("tax_authorities")
      .select("*")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("tax_rules")
      .select("*")
      .eq("is_active", true)
      .order("label"),
    supabase
      .from("property_tax_profiles")
      .select(
        "property_id,county_name,locality_name,verification_notes,host_responsibility_ack,host_certified_at,configuration_source,legacy_checkout_allowed",
      ),
    supabase
      .from("property_tax_lines")
      .select("id,property_id,category,label,rate_bps,base_scope,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const firstError =
    propertyResult.error ??
    authorityResult.error ??
    ruleResult.error ??
    profileResult.error ??
    taxLineResult.error;

  if (firstError) {
    throw new Error("Unable to load tax operations.");
  }

  const properties = (propertyResult.data ?? []) as PropertyRow[];
  const authorities = (authorityResult.data ?? []) as AuthorityRow[];
  const rules = (ruleResult.data ?? []) as RuleRow[];
  const profiles = (profileResult.data ?? []) as ProfileRow[];
  const taxLines = (taxLineResult.data ?? []) as TaxLineRow[];

  const authorityById = new Map(
    authorities.map((authority) => [authority.id, authority]),
  );
  const profileByProperty = new Map(
    profiles.map((profile) => [profile.property_id, profile]),
  );

  const linesByProperty = new Map<string, TaxLineRow[]>();
  for (const line of taxLines) {
    const current = linesByProperty.get(line.property_id) ?? [];
    current.push(line);
    linesByProperty.set(line.property_id, current);
  }

  const propertiesByState = new Map<string, PropertyRow[]>();
  for (const property of properties) {
    const stateCode = (property.region_code || "OTHER").toUpperCase();
    const current = propertiesByState.get(stateCode) ?? [];
    current.push(property);
    propertiesByState.set(stateCode, current);
  }
  const stateGroups = [...propertiesByState.entries()].sort(([a], [b]) =>
    getStateTaxSetup(a).name.localeCompare(getStateTaxSetup(b).name),
  );

  const hostConfiguredCount = profiles.filter(
    (profile) =>
      profile.host_responsibility_ack && profile.host_certified_at,
  ).length;
  const needsHostCount = Math.max(properties.length - hostConfiguredCount, 0);

  return (
    <AdminShell
      active="taxes"
      eyebrow="Host tax support"
      title="Property tax setup"
      context={context}
    >
      {query.saved ? (
        <div className="admin-message success">{query.saved}</div>
      ) : null}
      {query.error ? (
        <div className="admin-message error">{query.error}</div>
      ) : null}

      <div className="metrics dash-grid">
        <div>
          <span>Host certified</span>
          <strong>{hostConfiguredCount}</strong>
          <small>Properties confirmed by the host</small>
        </div>
        <div>
          <span>Needs host</span>
          <strong>{needsHostCount}</strong>
          <small>Setup or certification still needed</small>
        </div>
        <div>
          <span>Tax settlement</span>
          <strong>Host</strong>
          <small>Guest tax remains in the connected host charge</small>
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow dark">Admin role</p>
            <h2>Help when needed. The host owns the final setup.</h2>
          </div>
        </div>
        <p className="muted">
          Property tax setup is grouped by the property's state. Admins can
          enter or correct local tax lines for a host, but an assisted change
          clears the existing host certification and requires the host to
          review and certify it again.
        </p>
      </section>

      {stateGroups.map(([stateCode, stateProperties]) => {
        const config = getStateTaxSetup(stateCode);
        return (
          <section className="panel" key={stateCode}>
            <div className="panel-head">
              <div>
                <p className="eyebrow dark">{config.name}</p>
                <h2>{stateProperties.length} property tax setups</h2>
                <p className="muted">{config.intro}</p>
              </div>
              <span className="status-pill status-muted">
                {stateCode}
              </span>
            </div>

            {config.reviewNote ? (
              <div className="inline-note commission-note">
                <strong>State note</strong>
                <span>{config.reviewNote}</span>
              </div>
            ) : null}

            <div className="admin-list">
              {stateProperties.map((property) => {
                const profile = profileByProperty.get(property.id);
                const hostCertified =
                  Boolean(profile?.host_responsibility_ack) &&
                  Boolean(profile?.host_certified_at);
                const legacy =
                  !hostCertified &&
                  Boolean(profile?.legacy_checkout_allowed);

                return (
                  <details
                    className="admin-list-row static"
                    key={property.id}
                  >
                    <summary>
                      <span>
                        <strong>{property.name}</strong>
                        <small>
                          {[
                            property.street_address,
                            property.city,
                            property.region_code,
                            property.postal_code,
                          ]
                            .filter(Boolean)
                            .join(", ") || "Address incomplete"}
                        </small>
                        <small>
                          {hostCertified
                            ? `Host certified ${when(
                                profile?.host_certified_at ?? null,
                              )}`
                            : legacy
                              ? "Legacy setup · host confirmation recommended"
                              : "Host setup or certification required"}
                        </small>
                      </span>
                      <span>
                        <em>
                          {hostCertified
                            ? "HOST CONFIGURED"
                            : legacy
                              ? "LEGACY"
                              : "NEEDS HOST"}
                        </em>
                        <b>Assist ↓</b>
                      </span>
                    </summary>

                    <div className="panel" style={{ marginTop: 16 }}>
                      {canManage ? (
                        <form
                          action={savePropertyTaxAssistance}
                          className="settings-form"
                        >
                          <input
                            type="hidden"
                            name="propertyId"
                            value={property.id}
                          />

                          <div className="form-row">
                            <label>
                              <span>County</span>
                              <input
                                name="countyName"
                                defaultValue={
                                  profile?.county_name ?? ""
                                }
                              />
                            </label>
                            <label>
                              <span>Tax locality / city</span>
                              <input
                                name="localityName"
                                defaultValue={
                                  profile?.locality_name ??
                                  property.city ??
                                  ""
                                }
                              />
                            </label>
                          </div>

                          <PropertyTaxLineFields
                            stateCode={stateCode}
                            initialLines={
                              (linesByProperty.get(property.id) ??
                                []) as PropertyTaxLineInput[]
                            }
                          />

                          <label>
                            <span>Admin assistance notes</span>
                            <textarea
                              name="notes"
                              defaultValue={
                                profile?.verification_notes ?? ""
                              }
                              placeholder="What was checked or changed while assisting the host."
                            />
                          </label>

                          <div className="inline-note">
                            <strong>Host confirmation required</strong>
                            <span>
                              Saving here clears the host certification. The
                              host reviews the final setup in Payments &amp;
                              taxes and certifies it before a new property uses
                              live checkout.
                            </span>
                          </div>

                          <button
                            className="button button-small"
                            type="submit"
                          >
                            Save assisted setup
                          </button>
                        </form>
                      ) : (
                        <p className="muted">
                          Finance-admin access is required to change property
                          tax information.
                        </p>
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        );
      })}

      <details className="panel">
        <summary>
          <strong>Tax rule reference</strong>
          <span className="muted">
            Statewide automatic rules and internal references
          </span>
        </summary>
        <div className="admin-list compact" style={{ marginTop: 16 }}>
          {rules.map((rule) => {
            const authority = authorityById.get(rule.authority_id);
            return (
              <div className="admin-list-row static" key={rule.id}>
                <span>
                  <strong>
                    {rule.label} · {percent(rule.rate_bps)}
                  </strong>
                  <small>{authority?.name ?? "Unknown authority"}</small>
                  <small>
                    {rule.effective_from} →{" "}
                    {rule.effective_to ?? "current"}
                  </small>
                </span>
                <span>
                  <em>
                    {rule.automatic_region ? "AUTOMATIC" : "REFERENCE"}
                  </em>
                  <small>
                    {rule.maximum_stay_nights
                      ? `≤ ${rule.maximum_stay_nights} nights`
                      : "No night cap"}
                  </small>
                </span>
              </div>
            );
          })}
        </div>

        {canManage ? (
          <details className="pricing-create">
            <summary>+ Add reference tax rule</summary>
            <form action={createTaxRule} className="settings-form">
              <label>
                <span>Authority</span>
                <select name="authorityId" required>
                  {authorities.map((authority) => (
                    <option key={authority.id} value={authority.id}>
                      {authority.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  <span>Rule code</span>
                  <input name="code" required />
                </label>
                <label>
                  <span>Label</span>
                  <input name="label" required />
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span>Rate %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.001"
                    name="ratePercent"
                    required
                  />
                </label>
                <label>
                  <span>Tax base</span>
                  <select
                    name="baseScope"
                    defaultValue="ACCOMMODATION_TOTAL"
                  >
                    <option value="ACCOMMODATION_TOTAL">
                      Accommodation total
                    </option>
                    <option value="LODGING_ONLY">Lodging only</option>
                    <option value="PRE_TAX_TOTAL">
                      All pre-tax charges
                    </option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  <span>Effective from</span>
                  <input type="date" name="effectiveFrom" required />
                </label>
                <label>
                  <span>Effective through</span>
                  <input type="date" name="effectiveTo" />
                </label>
              </div>
              <label>
                <span>Maximum transient stay nights</span>
                <input type="number" min="1" name="maximumStayNights" />
              </label>
              <label>
                <span>Official source URL</span>
                <input type="url" name="sourceUrl" />
              </label>
              <button className="button button-small" type="submit">
                Create reference rule
              </button>
            </form>
          </details>
        ) : null}
      </details>

      <details className="panel">
        <summary>
          <strong>Tax authority reference</strong>
          <span className="muted">
            Agencies attached to automatic and reference rules
          </span>
        </summary>
        <div className="admin-list compact" style={{ marginTop: 16 }}>
          {authorities.map((authority) => (
            <div className="admin-list-row static" key={authority.id}>
              <span>
                <strong>{authority.name}</strong>
                <small>{authority.remittance_agency}</small>
              </span>
              <span>
                <em>{authority.jurisdiction_type.replaceAll("_", " ")}</em>
                <small>
                  {authority.locality_name ||
                    authority.region_code ||
                    authority.country_code}
                </small>
              </span>
            </div>
          ))}
        </div>

        {canManage ? (
          <details className="pricing-create">
            <summary>+ Add tax authority</summary>
            <form action={createTaxAuthority} className="settings-form">
              <div className="form-row">
                <label>
                  <span>Code</span>
                  <input name="code" required />
                </label>
                <label>
                  <span>Name</span>
                  <input name="name" required />
                </label>
              </div>
              <label>
                <span>Type</span>
                <select
                  name="jurisdictionType"
                  defaultValue="LOCAL_LODGING"
                >
                  <option value="LOCAL_LODGING">Local lodging</option>
                  <option value="CITY_SALES">City sales</option>
                  <option value="COUNTY_SALES">County sales</option>
                  <option value="STATE_SALES">State sales</option>
                  <option value="STATE_TOURISM">State tourism</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <div className="form-row">
                <label>
                  <span>Country</span>
                  <input
                    name="countryCode"
                    defaultValue="US"
                    maxLength={2}
                  />
                </label>
                <label>
                  <span>State / region</span>
                  <input name="regionCode" defaultValue="AR" />
                </label>
              </div>
              <label>
                <span>Locality</span>
                <input name="localityName" />
              </label>
              <label>
                <span>Remittance agency</span>
                <input name="remittanceAgency" required />
              </label>
              <label>
                <span>Official source URL</span>
                <input type="url" name="sourceUrl" />
              </label>
              <button className="button button-small" type="submit">
                Create authority
              </button>
            </form>
          </details>
        ) : null}
      </details>
    </AdminShell>
  );
}
