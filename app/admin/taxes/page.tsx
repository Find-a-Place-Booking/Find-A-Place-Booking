import { createTaxAuthority, createTaxRule, savePropertyTaxAssistance } from "@/app/admin/taxes/actions";
import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createClient } from "@/lib/supabase/server";

type PropertyRow={id:string;name:string;street_address:string|null;city:string|null;region_code:string|null;postal_code:string|null;country_code:string|null;status:string};
type AuthorityRow={id:string;code:string;name:string;jurisdiction_type:string;country_code:string;region_code:string|null;locality_name:string|null;remittance_agency:string;source_url:string|null;is_active:boolean};
type RuleRow={id:string;authority_id:string;code:string;label:string;rate_bps:number;base_scope:string;automatic_region:boolean;assignment_required:boolean;maximum_stay_nights:number|null;effective_from:string;effective_to:string|null;source_url:string|null;is_active:boolean};
type ProfileRow={property_id:string;verification_status:string;county_name:string|null;locality_name:string|null;verification_notes:string|null;local_sales_rate_bps:number|null;local_lodging_rate_bps:number|null;local_lodging_label:string|null;host_responsibility_ack:boolean;host_certified_at:string|null;configuration_source:string|null;legacy_checkout_allowed:boolean};

function percent(bps:number|null|undefined){const value=Number(bps??0);return (value/100).toFixed(value%100?2:0)}
function when(value:string|null){if(!value)return "—";return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric"}).format(new Date(value))}

export default async function AdminTaxesPage({searchParams}:{searchParams:Promise<{saved?:string;error?:string}>}) {
  const [context,query]=await Promise.all([getAdminContext(),searchParams]);
  const canManage=hasAnyAdminRole(context,["SUPER_ADMIN","FINANCE_ADMIN"]);
  const supabase=await createClient();

  const [propertyResult,authorityResult,ruleResult,profileResult]=await Promise.all([
    supabase.from("properties").select("id,name,street_address,city,region_code,postal_code,country_code,status").neq("status","ARCHIVED").order("name"),
    supabase.from("tax_authorities").select("*").eq("is_active",true).order("name"),
    supabase.from("tax_rules").select("*").eq("is_active",true).order("label"),
    supabase.from("property_tax_profiles").select("property_id,verification_status,county_name,locality_name,verification_notes,local_sales_rate_bps,local_lodging_rate_bps,local_lodging_label,host_responsibility_ack,host_certified_at,configuration_source,legacy_checkout_allowed"),
  ]);
  const firstError=propertyResult.error??authorityResult.error??ruleResult.error??profileResult.error;
  if(firstError) throw new Error("Unable to load tax operations.");

  const properties=(propertyResult.data??[]) as PropertyRow[];
  const authorities=(authorityResult.data??[]) as AuthorityRow[];
  const rules=(ruleResult.data??[]) as RuleRow[];
  const profiles=(profileResult.data??[]) as ProfileRow[];
  const authorityById=new Map(authorities.map(a=>[a.id,a]));
  const profileByProperty=new Map(profiles.map(p=>[p.property_id,p]));
  const hostConfiguredCount=profiles.filter(p=>p.host_responsibility_ack&&p.host_certified_at).length;
  const legacyCount=profiles.filter(p=>!p.host_certified_at&&p.legacy_checkout_allowed).length;

  return (
    <AdminShell active="taxes" eyebrow="Host tax support" title="Property tax setup" context={context}>
      {query.saved?<div className="admin-message success">{query.saved}</div>:null}
      {query.error?<div className="admin-message error">{query.error}</div>:null}

      <div className="metrics dash-grid">
        <div><span>Host certified</span><strong>{hostConfiguredCount}</strong><small>Properties where the host confirmed responsibility</small></div>
        <div><span>Legacy setups</span><strong>{legacyCount}</strong><small>Older admin configurations awaiting host confirmation</small></div>
        <div><span>Tax settlement</span><strong>Host</strong><small>Guest tax remains in the connected host charge</small></div>
      </div>

      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow dark">Admin role</p><h2>Support the host without taking over their tax responsibility.</h2></div></div>
        <p className="muted">Hosts configure and certify the taxes that apply to each property. Admins can enter or correct information when helping a host, but an admin-assisted change clears the host certification and requires the host to review and certify the final setup again.</p>
      </section>

      <section className="panel">
        <div className="panel-head"><div><p className="eyebrow dark">Property tax support</p><h2>Review or assist with a property's setup.</h2></div><span className="status-pill status-muted">{properties.length} properties</span></div>
        <div className="admin-list">
          {properties.map(property=>{
            const profile=profileByProperty.get(property.id);
            const hostCertified=Boolean(profile?.host_responsibility_ack)&&Boolean(profile?.host_certified_at);
            const legacy=!hostCertified&&Boolean(profile?.legacy_checkout_allowed);
            return (
              <details className="admin-list-row static" key={property.id}>
                <summary>
                  <span>
                    <strong>{property.name}</strong>
                    <small>{[property.street_address,property.city,property.region_code,property.postal_code].filter(Boolean).join(", ")||"Address incomplete"}</small>
                    <small>{hostCertified?`Host certified ${when(profile?.host_certified_at??null)}`:legacy?"Legacy admin setup · host confirmation recommended":"Host tax setup required"}</small>
                  </span>
                  <span><em>{hostCertified?"HOST CONFIGURED":legacy?"LEGACY":"NEEDS HOST"}</em><b>Assist ↓</b></span>
                </summary>

                <div className="panel" style={{marginTop:16}}>
                  <div className="inline-note commission-note"><strong>Responsibility</strong><span>Taxes settle with the host. Find A Place can assist with data entry, but the host confirms the final rates and is responsible for reporting and remittance.</span></div>
                  {canManage?(
                    <form action={savePropertyTaxAssistance} className="settings-form">
                      <input type="hidden" name="propertyId" value={property.id}/>
                      <div className="form-row">
                        <label><span>County</span><input name="countyName" defaultValue={profile?.county_name??""} placeholder="Garland"/></label>
                        <label><span>Tax locality / city</span><input name="localityName" defaultValue={profile?.locality_name??property.city??""} placeholder="Hot Springs"/></label>
                      </div>
                      <div className="form-row">
                        <label><span>City + county sales tax %</span><input type="number" min="0" max="100" step="0.001" name="localSalesRatePercent" defaultValue={percent(profile?.local_sales_rate_bps)}/></label>
                        <label><span>Local lodging / occupancy tax %</span><input type="number" min="0" max="100" step="0.001" name="localLodgingRatePercent" defaultValue={percent(profile?.local_lodging_rate_bps)}/></label>
                      </div>
                      <label><span>Local lodging tax name</span><input name="localLodgingLabel" defaultValue={profile?.local_lodging_label??""} placeholder="Hot Springs A&P lodging tax"/></label>
                      <label><span>Admin notes</span><textarea name="notes" defaultValue={profile?.verification_notes??""} placeholder="What was checked or changed while assisting the host."/></label>
                      <div className="inline-note"><strong>Important</strong><span>Saving here invalidates any previous host certification. The host must open Payments &amp; taxes and certify the assisted setup before a new property can use live checkout.</span></div>
                      <button className="button button-small" type="submit">Save assisted configuration</button>
                    </form>
                  ):<p className="muted">Finance-admin access is required to change property tax information.</p>}
                </div>
              </details>
            )
          })}
        </div>
      </section>

      <div className="dash-two">
        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow dark">Platform tax references</p><h2>Statewide and reference rules</h2></div></div>
          <div className="admin-list compact">
            {rules.map(rule=>{const authority=authorityById.get(rule.authority_id);return(
              <div className="admin-list-row static" key={rule.id}>
                <span><strong>{rule.label} · {percent(rule.rate_bps)}%</strong><small>{authority?.name??"Unknown authority"}</small><small>{rule.effective_from} → {rule.effective_to??"current"}</small></span>
                <span><em>{rule.automatic_region?"AUTOMATIC":"REFERENCE"}</em><small>{rule.maximum_stay_nights?`≤ ${rule.maximum_stay_nights} nights`:"No night cap"}</small></span>
              </div>
            )})}
          </div>
          {canManage?(
            <details className="pricing-create">
              <summary>+ Add reference tax rule</summary>
              <form action={createTaxRule} className="settings-form">
                <label><span>Authority</span><select name="authorityId" required>{authorities.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
                <div className="form-row"><label><span>Rule code</span><input name="code" required placeholder="LOCAL_LODGING_2026"/></label><label><span>Label</span><input name="label" required placeholder="Local lodging tax"/></label></div>
                <div className="form-row"><label><span>Rate %</span><input type="number" min="0" max="100" step="0.001" name="ratePercent" required/></label><label><span>Tax base</span><select name="baseScope" defaultValue="ACCOMMODATION_TOTAL"><option value="ACCOMMODATION_TOTAL">Accommodation total</option><option value="LODGING_ONLY">Lodging only</option><option value="PRE_TAX_TOTAL">All pre-tax charges</option></select></label></div>
                <div className="form-row"><label><span>Effective from</span><input type="date" name="effectiveFrom" required/></label><label><span>Effective through</span><input type="date" name="effectiveTo"/></label></div>
                <label><span>Maximum transient stay nights</span><input type="number" min="1" name="maximumStayNights" placeholder="29"/></label>
                <label><span>Official source URL</span><input type="url" name="sourceUrl"/></label>
                <button className="button button-small" type="submit">Create reference rule</button>
              </form>
            </details>
          ):null}
        </section>

        <section className="panel">
          <div className="panel-head"><div><p className="eyebrow dark">Authorities</p><h2>Tax authority reference list</h2></div></div>
          <div className="admin-list compact">
            {authorities.map(a=><div className="admin-list-row static" key={a.id}><span><strong>{a.name}</strong><small>{a.remittance_agency}</small></span><span><em>{a.jurisdiction_type.replaceAll("_"," ")}</em><small>{a.locality_name||a.region_code||a.country_code}</small></span></div>)}
          </div>
          {canManage?(
            <details className="pricing-create">
              <summary>+ Add tax authority</summary>
              <form action={createTaxAuthority} className="settings-form">
                <div className="form-row"><label><span>Code</span><input name="code" required placeholder="LOCAL_TAX_AUTHORITY"/></label><label><span>Name</span><input name="name" required/></label></div>
                <label><span>Type</span><select name="jurisdictionType" defaultValue="LOCAL_LODGING"><option value="LOCAL_LODGING">Local lodging</option><option value="CITY_SALES">City sales</option><option value="COUNTY_SALES">County sales</option><option value="STATE_SALES">State sales</option><option value="STATE_TOURISM">State tourism</option><option value="OTHER">Other</option></select></label>
                <div className="form-row"><label><span>Country</span><input name="countryCode" defaultValue="US" maxLength={2}/></label><label><span>State / region</span><input name="regionCode" defaultValue="AR"/></label></div>
                <label><span>Locality</span><input name="localityName"/></label>
                <label><span>Remittance agency</span><input name="remittanceAgency" required/></label>
                <label><span>Official source URL</span><input type="url" name="sourceUrl"/></label>
                <button className="button button-small" type="submit">Create authority</button>
              </form>
            </details>
          ):null}
        </section>
      </div>
    </AdminShell>
  );
}
