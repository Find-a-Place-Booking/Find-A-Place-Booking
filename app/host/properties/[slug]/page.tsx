import Link from "next/link";
import { notFound } from "next/navigation";

import {
  archiveProperty,
  saveHostCheckoutInstructions,
  setPropertyMarketplaceVisibility,
} from "@/app/host/properties/actions";
import { DashboardShell } from "@/components/DashboardShell";
import { NearbyExperiencesManager } from "@/components/NearbyExperiencesManager";
import { PropertyEditor } from "@/components/PropertyEditor";
import { PropertyPolicyDocument } from "@/components/PropertyPolicyDocument";
import { PropertyPublicationControl } from "@/components/PropertyPublicationControl";
import { PropertyVideoManager } from "@/components/PropertyVideoManager";
import { getCurrentPropertyPolicyDocument } from "@/lib/host/policy-documents";
import { getHostPropertyBySlug } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";

function readable(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default async function ManagePropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    created?: string;
    published?: string;
    publish_error?: string;
    onboarding?: string;
    marketplace?: string;
    marketplace_error?: string;
    checkout_tasks?: string;
  }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const property = await getHostPropertyBySlug(slug);
  if (!property) notFound();

  const policyDocument = await getCurrentPropertyPolicyDocument(
    property.propertyId,
  );

  const supabase = await createClient();
  const { data: checkoutTasks, error: checkoutTasksError } = await supabase
    .from("unit_checkout_instructions")
    .select("instructions")
    .eq("unit_id", property.unitId)
    .maybeSingle();

  // The base editor intentionally loads several independent tables. Never
  // present an incomplete read as an empty amenity/photo/policy selection:
  // saving that partial form would otherwise delete previously saved items.
  const [amenityIntegrity, policyIntegrity, photoIntegrity, rateIntegrity] =
    await Promise.all([
      supabase.from("unit_amenities").select("unit_id", { count: "exact", head: true }).eq("unit_id", property.unitId),
      supabase.from("unit_policies").select("unit_id", { count: "exact", head: true }).eq("unit_id", property.unitId),
      supabase.from("property_images").select("unit_id", { count: "exact", head: true }).eq("unit_id", property.unitId),
      supabase.from("unit_rate_settings").select("weeknight_cents").eq("unit_id", property.unitId).maybeSingle(),
    ]);
  const incompleteEditor =
    Boolean(amenityIntegrity.error || policyIntegrity.error || photoIntegrity.error || rateIntegrity.error) ||
    (amenityIntegrity.count ?? -1) !== property.amenities.length ||
    (policyIntegrity.count ?? -1) !== property.policies.length ||
    (photoIntegrity.count ?? -1) !== property.images.length ||
    (rateIntegrity.data?.weeknight_cents != null && !property.form.weeknight);
  if (incompleteEditor) {
    console.error("[host property editor] incomplete saved listing read", {
      propertyId: property.propertyId,
      amenityError: amenityIntegrity.error?.code,
      policyError: policyIntegrity.error?.code,
      photoError: photoIntegrity.error?.code,
      rateError: rateIntegrity.error?.code,
    });
    return (
      <DashboardShell active="Properties" title={property.form.name || "Property"} eyebrow="Property editor">
        <section className="panel">
          <h2>Property details could not be loaded completely</h2>
          <p>
            Editing is temporarily unavailable to protect your saved photos,
            amenities and policies. Nothing was changed. Refresh and try again.
          </p>
          <a className="button" href={`/host/properties/${encodeURIComponent(slug)}`}>Reload property</a>
          <Link href="/host/properties">Back to all properties</Link>
        </section>
      </DashboardShell>
    );
  }

  const cancellationIssue =
    "Specific cancellation/refund terms (not just a policy label)";
  const missingCancellation =
    property.submissionIssues.includes(cancellationIssue);
  const blockingIssues = property.submissionIssues.filter(
    (issue) => issue !== cancellationIssue,
  );

  const editable = [
    "DRAFT",
    "CHANGES_REQUESTED",
    "REJECTED",
    "PUBLISHED",
    "PAUSED",
  ].includes(property.status);

  const canPublish = [
    "DRAFT",
    "CHANGES_REQUESTED",
    "REJECTED",
    "APPROVED",
    "PAUSED",
  ].includes(property.status);
  const ready = canPublish && blockingIssues.length === 0;

  return (
    <DashboardShell
      active="Properties"
      title={property.form.name || "Property"}
      eyebrow="Property editor"
    >
      <div className="property-editor-heading">
        <Link href="/host/properties">← All properties</Link>
        {query.created || query.onboarding ? (
          <span className="status-pill">
            {property.status === "PUBLISHED"
              ? "Created & published"
              : "Real property created"}
          </span>
        ) : (
          <span
            className={`status-pill ${
              property.status === "PUBLISHED" ? "" : "status-muted"
            }`}
          >
            {readable(property.status)}
          </span>
        )}
      </div>

      {query.published ? (
        <div className="admin-message success">
          <strong>Listing published.</strong> This property is now available
          to the public marketplace and can receive bookings.
        </div>
      ) : null}

      {query.publish_error ? (
        <div className="admin-message error">{query.publish_error}</div>
      ) : null}

      {query.marketplace === "disabled" ? (
        <div className="admin-message success">
          <strong>Listing disabled.</strong> It is hidden from the public
          marketplace. Existing reservations and calendar records remain
          intact.
        </div>
      ) : null}

      {query.marketplace === "enabled" ? (
        <div className="admin-message success">
          <strong>Listing enabled.</strong> It is public in the marketplace
          again.
        </div>
      ) : null}

      {query.marketplace_error ? (
        <div className="admin-message error">{query.marketplace_error}</div>
      ) : null}

      <PropertyEditor
        key={`${property.propertyId}:${property.updatedAt}`}
        initial={{
          ...property,
          form: {
            ...property.form,
            __editorRevision: property.updatedAt,
          },
        }}
      />

      <PropertyVideoManager
        key={property.propertyId}
        organizationId={property.organizationId}
        propertyId={property.propertyId}
        unitId={property.unitId}
        propertyName={property.form.name || "Property"}
        editable={editable}
      />

      <NearbyExperiencesManager
        key={property.propertyId}
        propertyId={property.propertyId}
        organizationId={property.organizationId}
        slug={property.form.slug}
        editable={editable}
      />

      <section className="panel" id="checkout-instructions">
        <p className="eyebrow dark">Guest departure instructions</p>
        <h2>Checkout checklist</h2>
        <p className="muted">Optional instructions shown to confirmed guests in My Trip. Put one reasonable task per line, such as lock the door, switch off the lights or place trash in the outside bin. This does not add a fee or change the rental agreement.</p>
        {query.checkout_tasks === "saved" ? <div className="admin-message success">Checkout instructions saved.</div> : null}
        {query.checkout_tasks === "error" || checkoutTasksError ? <div className="admin-message error">Could not load or save checkout instructions. Try again.</div> : null}
        <form action={saveHostCheckoutInstructions} className="pricing-inline-form">
          <input type="hidden" name="unitId" value={property.unitId} />
          <input type="hidden" name="slug" value={property.form.slug} />
          <label className="wide"><span>Instructions, one task per line</span>
            <textarea name="checkoutInstructions" rows={5} maxLength={3000}
              defaultValue={checkoutTasks?.instructions || ""}
              placeholder={"Lock the door and return the key.\nTurn off the lights.\nPlace trash in the outside bin."}
              disabled={!editable} />
          </label>
          {editable ? <div className="pricing-inline-actions"><button type="submit" className="button button-small">Save checkout checklist</button></div> : null}
        </form>
      </section>

      <PropertyPolicyDocument
        key={property.propertyId}
        propertyId={property.propertyId}
        organizationId={property.organizationId}
        current={policyDocument}
      />

      <section className="panel property-review-submit">
        <div>
          <p className="eyebrow dark">Marketplace visibility</p>
          <h2>
            {property.status === "PUBLISHED"
              ? "Listing is enabled"
              : property.status === "PAUSED"
                ? "Listing is disabled"
                : "Publish this listing when it is ready"}
          </h2>

          {property.status === "PUBLISHED" ? (
            <p>
              This property is visible in traveler searches and can receive
              new bookings. Disable it any time to take it off the marketplace
              without deleting the property or changing existing reservations.
            </p>
          ) : property.status === "PAUSED" ? (
            <>
              <p>
                The property is hidden from traveler searches. Existing
                reservations and calendar records are unchanged. Enable it again
                whenever you are ready to accept new bookings.
              </p>
              {blockingIssues.length ? (
                <div className="review-readiness-list">
                  {blockingIssues.map((issue) => (
                    <span key={issue}>• {issue}</span>
                  ))}
                </div>
              ) : missingCancellation ? (
                <div className="admin-message warning">
                  Cancellation/refund terms are not set. You can still enable
                  the listing, but you will be asked to confirm first.
                </div>
              ) : null}
            </>
          ) : blockingIssues.length ? (
            <>
              <p>
                Finish the required listing details below before the stay can
                go live.
              </p>
              <div className="review-readiness-list">
                {blockingIssues.map((issue) => (
                  <span key={issue}>• {issue}</span>
                ))}
              </div>
            </>
          ) : missingCancellation ? (
            <p>
              The required listing details are complete. Cancellation/refund
              terms are not set, so publishing will show a confirmation warning
              before the listing goes live.
            </p>
          ) : (
            <p>
              The minimum listing requirements are complete. Publishing makes
              the property public immediately. A live, ready Stripe account is
              checked again when you publish.
            </p>
          )}

          {property.reviewNote ? (
            <div className="review-note-inline">
              <strong>Previous admin note</strong>
              <span>{property.reviewNote}</span>
            </div>
          ) : null}
        </div>

        {property.status === "PUBLISHED" ? (
          <form action={setPropertyMarketplaceVisibility}>
            <input
              type="hidden"
              name="propertyId"
              value={property.propertyId}
            />
            <input type="hidden" name="slug" value={property.form.slug} />
            <input type="hidden" name="returnTo" value="detail" />
            <input type="hidden" name="intent" value="DISABLE" />
            <button className="button button-quiet" type="submit">
              Disable listing
            </button>
          </form>
        ) : property.status === "PAUSED" ? (
          <PropertyPublicationControl
            mode="enable"
            propertyId={property.propertyId}
            slug={property.form.slug}
            returnTo="detail"
            missingCancellation={missingCancellation}
            disabled={blockingIssues.length > 0}
          />
        ) : canPublish ? (
          <PropertyPublicationControl
            mode="publish"
            propertyId={property.propertyId}
            slug={property.form.slug}
            missingCancellation={missingCancellation}
            disabled={!ready}
          />
        ) : null}
      </section>

      {property.status !== "PUBLISHED" ? (
        <section className="panel property-danger-zone">
          <div>
            <p className="eyebrow dark">Property lifecycle</p>
            <h2>Archive this property</h2>
            <p>
              Archiving removes it from the active host property list and
              preserves the database/audit record instead of deleting history.
            </p>
          </div>
          <form action={archiveProperty}>
            <input
              type="hidden"
              name="propertyId"
              value={property.propertyId}
            />
            <button className="button button-quiet" type="submit">
              Archive property
            </button>
          </form>
        </section>
      ) : null}
    </DashboardShell>
  );
}
