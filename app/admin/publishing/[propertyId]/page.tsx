import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { AdminListingPhotoUpload } from "@/components/AdminListingPhotoUpload";
import { getAdminContext, hasAnyAdminRole } from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  explainPublishingIssue,
  issueOwnerLabel,
  sortPublishingIssues,
} from "@/lib/admin/publishing-steps";
import {
  finishAndPublishAdminListing,
  saveAdminListingSetup,
  toggleAdminListingCheckout,
  refreshAdminListingStripe,
} from "../actions";
import styles from "../PublishingFlow.module.css";

export const dynamic = "force-dynamic";

const dollars = (cents: number | null | undefined) =>
  typeof cents === "number" ? (cents / 100).toFixed(2) : "";

function NoteField() {
  return (
    <label className={styles.wide}>
      <span>Why are you making this change?</span>
      <input name="reason" required minLength={8} maxLength={500}
        placeholder="Example: Host asked me to update the details" />
      <small className={styles.helper}>Internal note for the activity log. At least 8 characters.</small>
    </label>
  );
}

function SaveDetails({ propertyId, children, originals }: {
  propertyId: string;
  children: React.ReactNode;
  originals: Record<string, string | number | null | undefined>;
}) {
  return (
    <form action={saveAdminListingSetup} className={styles.form}>
      <input type="hidden" name="property_id" value={propertyId} />
      {Object.entries(originals).map(([key, previous]) => (
        <input key={key} type="hidden" name={`original_${key}`} value={String(previous ?? "")} />
      ))}
      <div className={styles.fields}>{children}<NoteField /></div>
      <button className="button button-small" type="submit">Save changes</button>
    </form>
  );
}

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
    .select("id,organization_id,name,description,property_type,status,public_area,street_address,city,region_code,postal_code,calendar_preference,live_checkout_enabled")
    .eq("id", propertyId).maybeSingle();
  if (!property || propertyError) notFound();
  const [organizationResult, unitResult, issuesResult, ownerResult] = await Promise.all([
    admin.from("organizations").select("id,name,commission_tier,partner_status").eq("id", property.organization_id).maybeSingle(),
    admin.from("property_units").select("id,slug,max_guests,cancellation_policy,is_active").eq("property_id", propertyId).eq("is_primary", true).maybeSingle(),
    userClient.rpc("admin_property_publication_issues", { target_property_id: propertyId }),
    admin.from("organization_members").select("profile_id,role,status")
      .eq("organization_id", property.organization_id).eq("role", "OWNER").eq("status", "ACTIVE").limit(1),
  ]);
  const organization = organizationResult.data;
  const unit = unitResult.data;
  const issues = (issuesResult.data || []) as string[];
  const checkError = issuesResult.error;
  const problems = sortPublishingIssues(issues.map(explainPublishingIssue));
  const canEdit = property.status !== "PUBLISHED" && property.status !== "ARCHIVED";
  const rejected = property.status === "REJECTED";
  // Rejections require a deliberate review in the existing property workflow.
  const canPublish = canEdit && !rejected && !checkError && !problems.length;
  const paused = property.status === "PAUSED";
  const ownerId = ownerResult.data?.[0]?.profile_id || null;
  const hostLink = ownerId ? `/admin/hosts/${ownerId}` : "/admin/hosts";
  const { data: stripeAccount } = await admin.from("payment_accounts")
    .select("id,status,charges_enabled,payouts_enabled,updated_at,metadata")
    .eq("organization_id", property.organization_id)
    .eq("provider", "STRIPE")
    .eq("environment", "LIVE")
    .eq("is_default", true)
    .neq("status", "DISABLED")
    .limit(1).maybeSingle();
  const cardStatus = typeof stripeAccount?.metadata?.card_payments_status === "string"
    ? stripeAccount.metadata.card_payments_status : null;
  const outstanding = stripeAccount?.metadata?.outstanding_requirement_count;
  const stripeNeedsAttention = !stripeAccount || stripeAccount.status !== "READY" ||
    !stripeAccount.charges_enabled || !stripeAccount.payouts_enabled;

  const [ratesResult, photosResult, calendarsResult] = await Promise.all([
    unit ? admin.from("unit_rate_settings").select("weeknight_cents,weekend_cents").eq("unit_id", unit.id).maybeSingle() : Promise.resolve({ data: null }),
    unit ? admin.from("property_images").select("id", { count: "exact", head: true }).eq("unit_id", unit.id) : Promise.resolve({ count: 0 }),
    unit ? admin.from("calendar_connections").select("provider,sync_status").eq("unit_id", unit.id).eq("is_active", true) : Promise.resolve({ data: [] }),
  ]);
  const rate = ratesResult.data;
  const photoCount = photosResult.count || 0;
  const connectedCalendars = calendarsResult.data || [];
  const isIssue = (section: string) => problems.some((problem) => problem.section === section);
  const isPartner = organization?.partner_status === "VERIFIED" && organization?.commission_tier === "PARTNER_5";

  return (
    <AdminShell active="publishing" eyebrow="Listing review" title={property.name} context={context}>
      <div className={styles.page}>
        <Link href="/admin/publishing" className={styles.back}>← Back to listings</Link>
        {query.saved ? <div className="admin-message success">{query.saved}</div> : null}
        {query.error ? <div className="admin-message error">{query.error}</div> : null}
        <section className={`panel ${styles.hero}`}>
          <div className={styles.heroText}>
            <span className={canPublish ? styles.ready : checkError ? styles.error : styles.needs}>
              <strong>{property.status === "PUBLISHED" ? "Published" : rejected ? "Previously rejected" : checkError ? "Unable to verify" : canPublish ? paused ? "Paused · ready to resume" : "Ready to publish" : `${problems.length} ${problems.length === 1 ? "thing" : "things"} to fix`}</strong>
            </span>
            <h2>{canPublish ? paused ? "This stay can go live again" : "Everything is ready" : rejected ? "Review the earlier rejection first" : checkError ? "We couldn't check this listing" : property.status === "PUBLISHED" ? "This stay is live" : "Finish the items below"}</h2>
            <p className={styles.muted}>
              {canPublish ? "Review the listing and confirm the host wants it live. Publishing will check everything again." :
                rejected ? "A previous admin rejected this listing. Review the decision in the full property record before approving it through the standard review process." :
                checkError ? "Do not publish until the readiness check succeeds. Refresh this page or contact operations." :
                property.status === "PUBLISHED" ? "This listing is already public." :
                "Each item shows who needs to handle it and where to go. Fix the required items, then come back to publish."}
            </p>
            <span className={styles.heroMeta}>{organization?.name || "Host account"} · {isPartner ? "Partner (5%)" : "Standard (7%)"} · {property.status.replaceAll("_", " ")}</span>
            <div className={styles.quickLinks}>
              <Link href={`/admin/properties/${property.id}`}>{rejected ? "Review rejection & history" : "Full property record"}</Link>
              {unit?.slug ? <Link href={`/stays/${unit.slug}`}>Stay page</Link> : null}
            </div>
          </div>
          {canPublish ? (
            <form action={finishAndPublishAdminListing} className={styles.form}>
              <input type="hidden" name="property_id" value={property.id} />
              <label>
                <span>Internal approval note</span>
                <input name="reason" required minLength={8} maxLength={500}
                  placeholder="Host confirmed listing is ready to go live" />
              </label>
              <button className="button" type="submit">{paused ? "Resume & publish" : "Publish listing"}</button>
              <small className={styles.helper}>Host agreements, Stripe, taxes and availability are still checked.</small>
            </form>
          ) : null}
        </section>

        {stripeNeedsAttention && property.status !== "ARCHIVED" ? (
          <section className="panel" aria-labelledby="stripe-refresh-title">
            <h2 id="stripe-refresh-title" className={styles.sectionHeading}>Stripe connection</h2>
            <p className={styles.sectionLead}>
              {stripeAccount
                ? `An account is connected, but the last saved status is ${stripeAccount.status.toLowerCase()}.`
                : "No active default Stripe account is saved for this host."}
              {cardStatus ? ` Stripe card payments: ${cardStatus}.` : ""}
              {typeof outstanding === "number" && outstanding > 0
                ? ` ${outstanding} requirements were outstanding at the last check.` : ""}
            </p>
            {stripeAccount?.updated_at ? <p className={styles.muted}>
              Last refreshed: {new Date(stripeAccount.updated_at).toLocaleString("en-US", {dateStyle:"medium",timeStyle:"short"})}.
            </p> : null}
            <form action={refreshAdminListingStripe} className={styles.form}>
              <input type="hidden" name="property_id" value={property.id} />
              <button className="button button-small" type="submit">Refresh Stripe status</button>
              <small className={styles.helper}>
                Rechecks Stripe directly. It cannot enable charges or payouts unless Stripe reports them ready.
              </small>
            </form>
            <div className={styles.quickLinks}><Link href={hostLink}>Host account</Link></div>
          </section>
        ) : null}
        {!checkError && problems.length > 0 ? (
          <section className="panel" aria-labelledby="what-to-fix-title">
            <h2 id="what-to-fix-title" className={styles.sectionHeading}>What needs fixing</h2>
            <p className={styles.sectionLead}>Start with anything marked “We can fix this.” Host-owned items cannot be completed for them.</p>
            <div className={styles.issueList}>
              {problems.map((issue, index) => (
                <div key={`${issue.original}:${index}`} className={styles.issue}>
                  <div>
                    <div className={styles.issueOwner}>{issueOwnerLabel(issue.owner)}</div>
                    <strong>{issue.title}</strong>
                    <small>{issue.explanation}</small>
                  </div>
                  <Link className={styles.issueLink} href={`#${issue.section}`}>{issue.button} →</Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {canEdit && unit ? (
          <>
            <div className={styles.intro}>
              <h2>{problems.length ? "Fix the listing" : "Need to change something?"}</h2>
              <p>{problems.length ? "Only the sections needing attention are expanded. Open any other section if the host asked for a change." : "These optional editing tools are collapsed to keep the publishing screen simple."}</p>
            </div>

            <details id="basics" className={styles.details} open={isIssue("basics")}>
              <summary>Property details {isIssue("basics") ? "· needs attention" : ""}</summary>
              <div className={styles.detailsContent}>
                <SaveDetails propertyId={property.id} originals={{
                  name: property.name, property_type: property.property_type,
                  public_area: property.public_area, max_guests: unit.max_guests,
                  description: property.description,
                }}>
                  <label><span>Property name</span><input name="name" maxLength={160} defaultValue={property.name || ""} /></label>
                  <label><span>Property type</span><input name="property_type" maxLength={100} defaultValue={property.property_type || ""} placeholder="Cabin" /></label>
                  <label><span>Destination / public area</span><input name="public_area" maxLength={160} defaultValue={property.public_area || ""} /></label>
                  <label><span>Maximum guests</span><input name="max_guests" type="number" min={1} max={100} defaultValue={unit.max_guests ?? ""} /></label>
                  <label className={styles.wide}><span>Guest-facing description</span><textarea name="description" rows={4} maxLength={10000} defaultValue={property.description || ""} /></label>
                </SaveDetails>
              </div>
            </details>

            <details id="location" className={styles.details} open={isIssue("location")}>
              <summary>Property address {isIssue("location") ? "· needs attention" : ""}</summary>
              <div className={styles.detailsContent}>
                <p className={styles.sectionLead}>The street address is stored privately for location and tax setup.</p>
                <SaveDetails propertyId={property.id} originals={{
                  street_address: property.street_address, city: property.city,
                  region_code: property.region_code, postal_code: property.postal_code,
                }}>
                  <label className={styles.wide}><span>Street address</span><input name="street_address" maxLength={250} defaultValue={property.street_address || ""} /></label>
                  <label><span>City</span><input name="city" maxLength={160} defaultValue={property.city || ""} /></label>
                  <label><span>State (2 letters)</span><input name="region_code" maxLength={2} defaultValue={property.region_code || ""} /></label>
                  <label><span>ZIP code</span><input name="postal_code" maxLength={20} defaultValue={property.postal_code || ""} /></label>
                </SaveDetails>
              </div>
            </details>

            <details id="pricing" className={styles.details} open={isIssue("pricing")}>
              <summary>Rates and cancellation policy {isIssue("pricing") ? "· needs attention" : ""}</summary>
              <div className={styles.detailsContent}>
                <SaveDetails propertyId={property.id} originals={{
                  weeknight_price: dollars(rate?.weeknight_cents),
                  weekend_price: dollars(rate?.weekend_cents),
                  cancellation_policy: unit.cancellation_policy,
                }}>
                  <label><span>Weeknight price ($)</span><input name="weeknight_price" inputMode="decimal" defaultValue={dollars(rate?.weeknight_cents)} placeholder="150.00" /></label>
                  <label><span>Weekend price ($)</span><input name="weekend_price" inputMode="decimal" defaultValue={dollars(rate?.weekend_cents)} placeholder="150.00" /></label>
                  <label className={styles.wide}><span>Cancellation and refund terms</span><textarea name="cancellation_policy" rows={4} defaultValue={unit.cancellation_policy || ""} placeholder="Describe when guests can cancel and what they receive back." /></label>
                </SaveDetails>
              </div>
            </details>

            <details id="photos" className={styles.details} open={isIssue("photos")}>
              <summary>Photos ({photoCount} of 25) {isIssue("photos") ? "· needs attention" : ""}</summary>
              <div className={styles.detailsContent}>
                <p className={styles.sectionLead}>Add a photo supplied or approved by the host. Max 10 MB; JPG, PNG or WebP.</p>
                <AdminListingPhotoUpload propertyId={property.id} organizationId={property.organization_id} currentCount={photoCount} />
              </div>
            </details>

            <details id="calendar" className={styles.details} open={isIssue("calendar")}>
              <summary>Calendar setup {isIssue("calendar") ? "· needs attention" : ""}</summary>
              <div className={styles.detailsContent}>
                <p className={styles.sectionLead}>Currently: {property.calendar_preference.replaceAll("_", " ")} · {connectedCalendars.length} connected sources. If an existing external feed is failing, reconnect it instead of selecting manual availability.</p>
                <SaveDetails propertyId={property.id} originals={{ calendar_preference: property.calendar_preference }}>
                  <label className={styles.wide}><span>How will this stay manage availability?</span>
                    <select name="calendar_preference" defaultValue={property.calendar_preference}>
                      <option value="UNSET">Not chosen</option>
                      <option value="NONE">Find A Place calendar only</option>
                      <option value="ICAL">Connected iCal calendar</option>
                      <option value="PMS">PMS / channel manager</option>
                    </select>
                  </label>
                </SaveDetails>
                <Link href="/admin/calendars">Open calendar connection diagnostics →</Link>
              </div>
            </details>

            <details id="checkout" className={styles.details} open={isIssue("checkout")}>
              <summary>Checkout settings {isIssue("checkout") ? "· needs attention" : ""}</summary>
              <div className={styles.detailsContent}>
                <p>Live checkout is currently <strong>{property.live_checkout_enabled ? "enabled" : "disabled"}</strong>.</p>
                <p className={styles.sectionLead}>Only enable checkout after verifying Stripe, taxes and availability. This does not publish the listing by itself.</p>
                <form action={toggleAdminListingCheckout} className={styles.form}>
                  <input type="hidden" name="property_id" value={property.id} />
                  <input type="hidden" name="enabled" value={property.live_checkout_enabled ? "false" : "true"} />
                  <NoteField />
                  <button className="button button-small button-quiet" type="submit">{property.live_checkout_enabled ? "Disable checkout" : "Enable checkout"}</button>
                </form>
              </div>
            </details>
          </>
        ) : null}

        {(isIssue("host-actions") || isIssue("support")) && !checkError ? (
          <section id="host-actions" className="panel">
            <h2 className={styles.sectionHeading}>What the host or operations needs to do</h2>
            <p className={styles.sectionLead}>Some requirements cannot be completed by an admin. The host must handle their own agreement, Stripe connection and any required tax certification.</p>
            <div className={styles.quickLinks}>
              {problems.some((problem) => /stripe|host agreement|authority to list|onboarding record/i.test(problem.original)) ?
                <Link href={hostLink}>Open host account</Link> : null}
              {problems.some((problem) => /sync|calendar feed|pms \/ channel/i.test(problem.original)) ?
                <Link href="/admin/calendars">Check calendar connection</Link> : null}
              {problems.some((problem) => /tax|tennessee|state not cleared/i.test(problem.original)) ?
                <Link href="/admin/taxes">Review tax setup</Link> : null}
              {problems.some((problem) => /primary rentable unit|activate primary|archived/i.test(problem.original)) ?
                <Link href={`/admin/properties/${property.id}`}>Open property record</Link> : null}
            </div>
            <div id="support" className={styles.note}>
              <p>No need to change unrelated settings. Once the host finishes their part, refresh this page to see whether publication is ready.</p>
            </div>
          </section>
        ) : null}
      </div>
    </AdminShell>
  );
}
