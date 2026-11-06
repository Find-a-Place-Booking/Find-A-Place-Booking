import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { cleanStatus } from "@/lib/admin/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { finishAndPublishAdminListing, saveAdminListingSetup, toggleAdminListingCheckout } from "../actions";
import { AdminListingPhotoUpload } from "@/components/AdminListingPhotoUpload";

export const dynamic = "force-dynamic";

const money = (cents: number | null | undefined) =>
  typeof cents === "number" ? (cents / 100).toFixed(2) : "";

export default async function AdminFinishListing({
  params, searchParams,
}: {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const context = await getAdminContext();
  if (!hasAnyAdminRole(context, ["SUPER_ADMIN", "OPERATIONS_ADMIN"])) redirect("/admin");
  const [{ propertyId }, query] = await Promise.all([params, searchParams]);
  const admin = createAdminClient();
  const userClient = await createClient();

  const { data: property, error: propertyError } = await admin.from("properties")
    .select("id,organization_id,name,description,property_type,status,public_area,street_address,city,region_code,postal_code,calendar_preference,live_checkout_enabled,source_onboarding_draft_id")
    .eq("id", propertyId).maybeSingle();
  if (!property || propertyError) notFound();

  const [{ data: organization }, { data: unit }, { data: issues, error: checkError }, { data: preferences }] = await Promise.all([
    admin.from("organizations").select("id,name,commission_tier,partner_status").eq("id", property.organization_id).maybeSingle(),
    admin.from("property_units").select("id,slug,max_guests,cancellation_policy,is_active").eq("property_id", propertyId).eq("is_primary", true).maybeSingle(),
    userClient.rpc("admin_property_publication_issues", { target_property_id: propertyId }),
    admin.from("host_marketing_preferences")
      .select("three_discounted_stays_interest,additional_social_advertising_interest,request_notes,updated_at")
      .eq("organization_id", property.organization_id).maybeSingle(),
  ]);

  const [{ data: rates }, { count: photoCount }, { data: calendars }] = await Promise.all([
    unit ? admin.from("unit_rate_settings").select("weeknight_cents,weekend_cents").eq("unit_id", unit.id).maybeSingle() : Promise.resolve({ data: null }),
    unit ? admin.from("property_images").select("id", { count: "exact", head: true }).eq("unit_id", unit.id) : Promise.resolve({ count: 0 }),
    unit ? admin.from("calendar_connections").select("provider,sync_status,last_success_at,is_active").eq("unit_id", unit.id).eq("is_active", true) : Promise.resolve({ data: [] }),
  ]);
  const missing = (issues || []) as string[];
  const canPublish = !checkError && missing.length === 0 && property.status !== "PUBLISHED" && property.status !== "ARCHIVED";
  const canEdit = !["PUBLISHED", "ARCHIVED"].includes(property.status);
  const isPartner = organization?.partner_status === "VERIFIED" && organization?.commission_tier === "PARTNER_5";

  return (
    <AdminShell active="publishing" eyebrow="Admin host completion" title={property.name} context={context}>
      <p><Link href="/admin/publishing">← Back to publishing queue</Link> · <Link href={`/admin/properties/${property.id}`}>Full property record</Link></p>
      {query.saved ? <div className="admin-message success">{query.saved}</div> : null}
      {query.error ? <div className="admin-message error">{query.error}</div> : null}
      <section className="panel">
        <p className="eyebrow dark">Property review</p>
        <h2>{cleanStatus(property.status)} · {organization?.name || "Unknown host"}</h2>
        <p className="muted">Partner status: {isPartner ? "Verified Find A Place Partner (5%)" : "Standard / not verified (7%)"}.
          This is determined from the organization's existing admin-only assignment, not a self-reported checkbox.</p>
        <div className="admin-state-stack">
          <div><span>Photos</span><strong>{photoCount ?? 0}</strong></div>
          <div><span>Live checkout</span><strong>{property.live_checkout_enabled ? "Enabled" : "Disabled"}</strong></div>
          <div><span>Calendar</span><strong>{cleanStatus(property.calendar_preference)}</strong></div>
          <div><span>Connected calendars</span><strong>{(calendars || []).length}</strong></div>
          <div><span>Calendar warnings</span><strong>{(calendars || []).some((c) => c.sync_status !== "HEALTHY") ? "Needs attention" : "None reported"}</strong></div>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow dark">Exact publication blockers</p>
        <h2>{checkError ? "Readiness check unavailable" : canPublish ? "Ready to publish" : property.status === "PUBLISHED" ? "Already public" : `${missing.length} item(s) to resolve`}</h2>
        {checkError ? <div className="admin-message error">{checkError.message}. Do not publish while readiness checks are unavailable.</div> : null}
        {!checkError && missing.length ? (
          <ul>{missing.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        ) : null}
        {!checkError && !missing.length ? <p className="muted">The prerequisite checks passed. The final action still runs the existing database publication triggers, which can reject a listing if its status changes.</p> : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link className="button button-small button-quiet" href="/admin/taxes">Review property tax settings</Link>
          <Link className="button button-small button-quiet" href="/admin/calendars">Inspect calendar connections</Link>
          <Link className="button button-small button-quiet" href="/admin/hosts">Review host onboarding</Link>
        </div>
      </section>

      {canEdit && unit ? (
        <section className="panel">
          <p className="eyebrow dark">Admin assistance</p>
          <h2>Finish missing listing details for the host</h2>
          <p className="muted">Only changed, nonblank fields are saved. This does not replace the host's personal policy acceptance or their Stripe/PMS authentication. Every change is logged under your admin account.</p>
          <form className="settings-form" action={saveAdminListingSetup}>
            <input type="hidden" name="property_id" value={property.id} />
            <label><span>Property name</span><input name="name" defaultValue={property.name || ""} maxLength={160} /></label>
            <label><span>Description</span><textarea name="description" rows={4} defaultValue={property.description || ""} maxLength={10000} /></label>
            <label><span>Property type</span><input name="property_type" defaultValue={property.property_type || ""} maxLength={100} /></label>
            <label><span>Public area</span><input name="public_area" defaultValue={property.public_area || ""} maxLength={160} /></label>
            <label><span>Street address (internal)</span><input name="street_address" defaultValue={property.street_address || ""} maxLength={250} /></label>
            <label><span>City</span><input name="city" defaultValue={property.city || ""} maxLength={160} /></label>
            <label><span>State code</span><input name="region_code" defaultValue={property.region_code || ""} maxLength={2} /></label>
            <label><span>ZIP code</span><input name="postal_code" defaultValue={property.postal_code || ""} maxLength={20} /></label>
            <label><span>Maximum guests</span><input name="max_guests" type="number" min={1} max={100} defaultValue={unit.max_guests ?? ""} /></label>
            <label><span>Weeknight nightly rate ($)</span><input name="weeknight_price" inputMode="decimal" defaultValue={money(rates?.weeknight_cents)} /></label>
            <label><span>Weekend nightly rate ($)</span><input name="weekend_price" inputMode="decimal" defaultValue={money(rates?.weekend_cents)} /></label>
            <label><span>Calendar source</span>
              <select name="calendar_preference" defaultValue={property.calendar_preference}>
                <option value="UNSET">Choose a calendar source</option>
                <option value="NONE">Find A Place only (manually manage availability)</option>
                <option value="ICAL">iCal import</option>
                <option value="PMS">PMS / channel manager</option>
              </select>
            </label>
            <label><span>Detailed cancellation/refund terms</span><textarea name="cancellation_policy" rows={4} defaultValue={unit.cancellation_policy || ""} /></label>
            <label><span>Reason for admin assistance (required)</span><input name="reason" required minLength={8} placeholder="For example: Completed property address and rate settings after talking with host" maxLength={500} /></label>
            <button className="button" type="submit">Save listing setup</button>
          </form>
        </section>
      ) : null}

      {canEdit && unit ? (
        <section className="panel">
          <p className="eyebrow dark">Listing photos</p>
          <h2>Upload photos for the host</h2>
          <p className="muted">{photoCount ?? 0} of 25 photos. JPG, PNG or WebP, up to 10 MB each. Admins can add a missing listing photo without signing in as the host. All uploads are audited.</p>
          <AdminListingPhotoUpload propertyId={property.id} organizationId={property.organization_id}
            currentCount={photoCount ?? 0} />
        </section>
      ) : null}

      {canEdit ? (
        <section className="panel">
          <p className="eyebrow dark">Live checkout</p>
          <h2>{property.live_checkout_enabled ? "Enabled" : "Disabled"}</h2>
          <p className="muted">You may enable checkout on an unpublished listing after verifying payment, taxes and property information. Enabling does not publish it; the final publish action still runs mandatory safety checks.</p>
          <form className="settings-form" action={toggleAdminListingCheckout}>
            <input type="hidden" name="property_id" value={property.id} />
            <input type="hidden" name="enabled" value={property.live_checkout_enabled ? "false" : "true"} />
            <label><span>Reason (required)</span><input name="reason" maxLength={500} required placeholder="Verified tax and Stripe setup" /></label>
            <button className="button button-quiet" type="submit">{property.live_checkout_enabled ? "Disable live checkout" : "Enable live checkout"}</button>
          </form>
        </section>
      ) : null}

      {canPublish ? (
        <section className="panel">
          <p className="eyebrow dark">Go live</p>
          <h2>Complete review and publish</h2>
          <p className="muted">For a completed draft, the admin action records approval and publishes in one database transaction. Existing calendar, state tax and Stripe safety triggers remain enforced.</p>
          <form className="settings-form" action={finishAndPublishAdminListing}>
            <input type="hidden" name="property_id" value={property.id} />
            <label><span>Internal reason and host approval confirmation</span><input name="reason" maxLength={500} required placeholder="Completed host setup, verified host permission and reviewed property" /></label>
            <button className="button" type="submit">Approve & publish to marketplace</button>
          </form>
        </section>
      ) : null}

      <section className="panel">
        <p className="eyebrow dark">Optional host promotions</p>
        <h2>Host marketing requests</h2>
        <div className="setting-row"><span>Interested in 3 discounted stays</span><strong>{preferences?.three_discounted_stays_interest ? "Yes" : "Not requested"}</strong></div>
        <div className="setting-row"><span>Extra social media advertising</span><strong>{preferences?.additional_social_advertising_interest ? "Interested" : "Not requested"}</strong></div>
        {preferences?.request_notes ? <p className="muted">Host notes: {preferences.request_notes}</p> : null}
        <p className="muted">These are opt-ins only. No discount codes, stay prices or advertising charges are created automatically. Hosts can manage their preferences under Host → Marketing.</p>
      </section>
    </AdminShell>
  );
}
