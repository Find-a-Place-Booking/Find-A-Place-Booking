"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { savePropertyListing } from "@/app/host/properties/actions";
import { amenityGroups, calendarPreferences, policyGroups, propertyTypes } from "@/lib/property/catalog";
import { createClient } from "@/lib/supabase/client";
import type { PropertyEditorRecord, PropertyImageRecord } from "@/lib/host/properties";

type SaveTone = "saved" | "dirty" | "saving" | "error";

export function PropertyEditor({ initial }: { initial: PropertyEditorRecord }) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({ ...initial.form });
  const [amenities, setAmenities] = useState(initial.amenities);
  const [policies, setPolicies] = useState(initial.policies);
  const [images, setImages] = useState<PropertyImageRecord[]>(initial.images);
  const [saveTone, setSaveTone] = useState<SaveTone>("saved");
  const [message, setMessage] = useState("Loaded from the production property record.");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const editable = ["DRAFT", "CHANGES_REQUESTED", "REJECTED"].includes(initial.status);

  const selectedCalendar = useMemo(() => calendarPreferences.find((option) => option.value === (form.calendarPreference || "UNSET")), [form.calendarPreference]);

  function update(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveTone("dirty");
    setMessage("Unsaved property changes.");
  }

  function toggle(item: string, values: string[], setter: (next: string[]) => void) {
    setter(values.includes(item) ? values.filter((value) => value !== item) : [...values, item]);
    setSaveTone("dirty");
    setMessage("Unsaved property changes.");
  }

  async function save() {
    if (saving || !editable) return;
    setSaving(true);
    setSaveTone("saving");
    setMessage("Saving property…");
    const result = await savePropertyListing({ propertyId: initial.propertyId, form, amenities, policies });
    setSaving(false);
    if (!result.ok) {
      setSaveTone("error");
      setMessage(result.message);
      return;
    }
    setSaveTone("saved");
    setMessage(result.message || "Property saved.");
    if (result.slug && result.slug !== form.slug) {
      setForm((current) => ({ ...current, slug: result.slug! }));
      router.replace(`/host/properties/${result.slug}`);
    }
    router.refresh();
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length || uploading || !editable) return;
    const remaining = Math.max(0, 12 - images.length);
    if (!remaining) {
      setSaveTone("error");
      setMessage("A property can have up to 12 photos.");
      return;
    }

    const selected = Array.from(files).slice(0, remaining);
    setUploading(true);
    setMessage("Uploading property photos…");
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) {
      setUploading(false);
      setSaveTone("error");
      setMessage("Your session expired. Sign in again before uploading photos.");
      return;
    }

    const nextImages = [...images];
    for (const file of selected) {
      if (!(["image/jpeg", "image/png", "image/webp"].includes(file.type)) || file.size > 10 * 1024 * 1024) {
        setSaveTone("error");
        setMessage(`${file.name} was skipped. Use JPG, PNG or WebP files under 10 MB.`);
        continue;
      }
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${initial.organizationId}/${initial.propertyId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("property-images").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        console.error("[property image upload]", uploadError);
        setSaveTone("error");
        setMessage(`Couldn't upload ${file.name}.`);
        continue;
      }

      const { data: row, error: insertError } = await supabase
        .from("property_images")
        .insert({
          unit_id: initial.unitId,
          storage_path: path,
          original_name: file.name.slice(0, 255),
          content_type: file.type,
          size_bytes: file.size,
          sort_order: nextImages.length,
          alt_text: form.name ? `${form.name} property photo` : "Property photo",
          created_by: userId,
        })
        .select("id,storage_path,original_name,content_type,size_bytes,sort_order,alt_text")
        .single();

      if (insertError || !row) {
        await supabase.storage.from("property-images").remove([path]);
        console.error("[property image row]", insertError);
        setSaveTone("error");
        setMessage(`Couldn't register ${file.name} after upload.`);
        continue;
      }

      const { data: signed } = await supabase.storage.from("property-images").createSignedUrl(path, 3600);
      nextImages.push({
        id: row.id,
        storagePath: row.storage_path,
        originalName: row.original_name,
        contentType: row.content_type,
        sizeBytes: row.size_bytes,
        sortOrder: row.sort_order,
        altText: row.alt_text,
        signedUrl: signed?.signedUrl ?? null,
      });
    }

    setImages(nextImages);
    setUploading(false);
    if (nextImages.length > images.length) {
      setSaveTone("saved");
      setMessage("Photo upload saved immediately.");
      router.refresh();
    }
  }

  async function removeImage(image: PropertyImageRecord) {
    if (uploading || !editable) return;
    setUploading(true);
    const supabase = createClient();
    const { error: storageError } = await supabase.storage.from("property-images").remove([image.storagePath]);
    if (storageError) {
      setUploading(false);
      setSaveTone("error");
      setMessage("Couldn't remove the stored image.");
      return;
    }
    const { error } = await supabase.from("property_images").delete().eq("id", image.id);
    setUploading(false);
    if (error) {
      setSaveTone("error");
      setMessage("The image file was removed, but its database record needs attention.");
      return;
    }
    setImages((current) => current.filter((item) => item.id !== image.id));
    setSaveTone("saved");
    setMessage("Photo removed.");
    router.refresh();
  }

  return (
    <div className="property-editor-layout">
      <section className="property-editor-main">
        <div className={`property-save-bar ${saveTone}`}>
          <div><strong>{saveTone === "error" ? "Needs attention" : saveTone === "dirty" ? "Unsaved changes" : saveTone === "saving" ? "Saving" : "Property record connected"}</strong><span>{message}</span></div>
          <button type="button" className="button button-small" disabled={saving || !editable} onClick={save}>{saving ? "Saving…" : editable ? "Save property" : "Editing locked"}</button>
        </div>

        {!editable ? <div className="property-review-lock"><strong>Listing editing is temporarily locked.</strong><span>{initial.status === "PENDING_REVIEW" ? "The Find A Place team is reviewing this submission." : initial.status === "APPROVED" ? "This listing is approved and waiting for publication." : initial.status === "PUBLISHED" ? "This listing is live. A later revision workflow will handle changes without silently altering the approved public version." : "This listing is paused. Publication controls are handled by the admin team."}</span></div> : null}
        {initial.reviewNote ? <div className="property-review-note"><strong>Review note</strong><span>{initial.reviewNote}</span></div> : null}

        <fieldset className="property-editor-fieldset" disabled={!editable}>
        <details className="property-edit-section" open>
          <summary><span><b>1</b><strong>Listing identity</strong></span><small>{initial.status}</small></summary>
          <div className="property-edit-body field-grid onboarding-fields">
            <label className="full"><span>Property / listing name</span><input value={form.name || ""} onChange={(e) => update("name", e.target.value)} /></label>
            <label><span>Property type</span><select value={form.propertyType || ""} onChange={(e) => update("propertyType", e.target.value)}><option value="">Select type</option>{propertyTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label><span>Public area</span><input value={form.publicArea || ""} onChange={(e) => update("publicArea", e.target.value)} placeholder="Hot Springs, Lake Ouachita…" /></label>
            <label className="full"><span>Description</span><textarea value={form.description || ""} onChange={(e) => update("description", e.target.value)} placeholder="Describe the stay for guests." /></label>
            <label className="full"><span>Shareable booking URL</span><div className="slug-input"><span>/stays/</span><input value={form.slug || ""} onChange={(e) => update("slug", e.target.value)} spellCheck={false} /></div><small>This URL is reserved now and becomes guest-facing after approval/publication. Old slugs remain redirects when the URL changes.</small></label>
          </div>
        </details>

        <details className="property-edit-section" open>
          <summary><span><b>2</b><strong>Location & capacity</strong></span><small>{[form.city, form.state].filter(Boolean).join(", ") || "Not complete"}</small></summary>
          <div className="property-edit-body field-grid onboarding-fields">
            <label className="full"><span>Street address</span><input value={form.street || ""} onChange={(e) => update("street", e.target.value)} /></label>
            <label><span>City</span><input value={form.city || ""} onChange={(e) => update("city", e.target.value)} /></label>
            <label><span>State</span><input value={form.state || ""} onChange={(e) => update("state", e.target.value)} /></label>
            <label><span>ZIP</span><input value={form.postal || ""} onChange={(e) => update("postal", e.target.value)} /></label>
            <label><span>Maximum guests</span><input type="number" min="1" value={form.maxGuests || ""} onChange={(e) => update("maxGuests", e.target.value)} /></label>
            <label><span>Bedrooms</span><input type="number" min="0" value={form.bedrooms || ""} onChange={(e) => update("bedrooms", e.target.value)} /></label>
            <label><span>Beds</span><input type="number" min="0" value={form.beds || ""} onChange={(e) => update("beds", e.target.value)} /></label>
            <label><span>Bathrooms</span><input type="number" min="0" step="0.5" value={form.bathrooms || ""} onChange={(e) => update("bathrooms", e.target.value)} /></label>
            <label className="checkline full"><input type="checkbox" checked={form.exactAddressPublic === "true"} onChange={(e) => update("exactAddressPublic", e.target.checked ? "true" : "false")} /><span>Allow the exact street address to be shown publicly. Leave unchecked to keep search/listing views at the general-area level.</span></label>
          </div>
        </details>

        <details className="property-edit-section">
          <summary><span><b>3</b><strong>Amenities</strong></span><small>{amenities.length} selected</small></summary>
          <div className="property-edit-body">
            <div className="selection-groups">{amenityGroups.map((group) => <details key={group.title} open={group.title === "Popular"}><summary><strong>{group.title}</strong><span>{group.items.filter((item) => amenities.includes(item)).length} selected</span></summary><div className="amenity-picker">{group.items.map((item) => <label className={amenities.includes(item) ? "selected" : ""} key={item}><input type="checkbox" checked={amenities.includes(item)} onChange={() => toggle(item, amenities, setAmenities)} /><span>{item}</span></label>)}</div></details>)}</div>
            <label className="custom-option"><span>Custom amenities</span><textarea value={form.customAmenities || ""} onChange={(e) => update("customAmenities", e.target.value)} placeholder="One per line or a short list for uncommon features." /></label>
          </div>
        </details>

        <details className="property-edit-section">
          <summary><span><b>4</b><strong>Rates & fees</strong></span><small>{form.weeknight ? `$${form.weeknight}/night` : "Not priced"}</small></summary>
          <div className="property-edit-body">
            <div className="property-pricing-summary">
              <div><span>Weeknight</span><strong>{form.weeknight ? `$${form.weeknight}` : "Not set"}</strong></div>
              <div><span>Weekend</span><strong>{form.weekend ? `$${form.weekend}` : "Uses weeknight"}</strong></div>
              <div><span>Default minimum</span><strong>{form.minStay || "1"} night{(form.minStay || "1") === "1" ? "" : "s"}</strong></div>
            </div>
            <div className="inline-note commission-note"><strong>Pricing has one owner.</strong><span>Base rates, standard fees, additional-guest thresholds, date specials, holiday minimum stays, promo codes and guest add-ons are managed in Rates & fees so a stale property-details screen cannot overwrite operational pricing.</span><Link className="inline-note-link" href={`/host/rates/${form.slug || initial.form.slug}`}>Open Rates & fees →</Link></div>
          </div>
        </details>

        <details className="property-edit-section">
          <summary><span><b>5</b><strong>Policies & stay rules</strong></span><small>{policies.length} selected</small></summary>
          <div className="property-edit-body">
            <div className="selection-groups policy-picker">{policyGroups.map((group) => <details key={group.title} open={group.title === "House rules"}><summary><strong>{group.title}</strong><span>{group.items.filter((item) => policies.includes(item)).length} selected</span></summary><div className="amenity-picker">{group.items.map((item) => <label className={policies.includes(item) ? "selected" : ""} key={item}><input type="checkbox" checked={policies.includes(item)} onChange={() => toggle(item, policies, setPolicies)} /><span>{item}</span></label>)}</div></details>)}</div>
            <div className="field-grid onboarding-fields conditional-fields">
              {policies.includes("Quiet hours apply") && <><label><span>Quiet hours start</span><input type="time" value={form.quietStart || "22:00"} onChange={(e) => update("quietStart", e.target.value)} /></label><label><span>Quiet hours end</span><input type="time" value={form.quietEnd || "07:00"} onChange={(e) => update("quietEnd", e.target.value)} /></label></>}
              {policies.includes("Pets allowed") && <label><span>Maximum pets</span><input type="number" min="1" value={form.maxPets || ""} onChange={(e) => update("maxPets", e.target.value)} /></label>}
              {policies.includes("Minimum booking age applies") && <label><span>Minimum booking age</span><input type="number" min="18" value={form.minimumAge || ""} onChange={(e) => update("minimumAge", e.target.value)} /></label>}
              <label><span>Check-in</span><input type="time" value={form.checkIn || ""} onChange={(e) => update("checkIn", e.target.value)} /></label>
              <label><span>Checkout</span><input type="time" value={form.checkout || ""} onChange={(e) => update("checkout", e.target.value)} /></label>
              <label className="full"><span>Cancellation policy / notes</span><textarea value={form.cancellation || ""} onChange={(e) => update("cancellation", e.target.value)} /></label>
              <label className="full"><span>Custom policies</span><textarea value={form.customPolicies || ""} onChange={(e) => update("customPolicies", e.target.value)} placeholder="Uncommon property-specific rules." /></label>
            </div>
          </div>
        </details>

        <details className="property-edit-section" open>
          <summary><span><b>6</b><strong>Photos</strong></span><small>{images.length}/12 uploaded</small></summary>
          <div className="property-edit-body">
            <label className={`property-upload ${uploading ? "busy" : ""}`}><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || images.length >= 12} onChange={(e) => { void uploadFiles(e.target.files); e.currentTarget.value = ""; }} /><strong>{uploading ? "Uploading…" : "Add property photos"}</strong><span>JPG, PNG or WebP · up to 10 MB each · private until this property is published</span></label>
            {images.length ? <div className="property-image-grid">{images.map((image, index) => <figure key={image.id}>{image.signedUrl ? <img src={image.signedUrl} alt={image.altText || form.name || "Property"} /> : <div className="property-image-missing">Preview unavailable</div>}<figcaption><span>{index === 0 ? "Primary photo" : image.originalName || `Photo ${index + 1}`}</span><button type="button" disabled={uploading} onClick={() => void removeImage(image)}>Remove</button></figcaption></figure>)}</div> : <div className="panel-empty"><strong>No real photos uploaded yet.</strong><span>The filenames saved during host onboarding were only draft references. Upload the actual image files here.</span></div>}
          </div>
        </details>

        <details className="property-edit-section">
          <summary><span><b>7</b><strong>Calendar & notifications</strong></span><small>{selectedCalendar?.label || "Decide later"}</small></summary>
          <div className="property-edit-body">
            <div className="calendar-preference-grid">{calendarPreferences.map((option) => <button type="button" key={option.value} className={(form.calendarPreference || "UNSET") === option.value ? "selected" : ""} onClick={() => update("calendarPreference", option.value)}><strong>{option.label}</strong><span>{option.detail}</span></button>)}</div>
            <div className="field-grid onboarding-fields property-notification-fields"><label><span>Booking notification email</span><input type="email" value={form.notificationEmail || ""} onChange={(e) => update("notificationEmail", e.target.value)} /></label><label><span>Operations notification email</span><input type="email" value={form.operationsEmail || ""} onChange={(e) => update("operationsEmail", e.target.value)} /></label></div>
            <div className="connection-card"><div className="connection-icon">↻</div><div><strong>Calendar preference is real; the connection is not yet active.</strong><span>iCal/PMS URLs, sync health and availability ingestion will appear when calendar sync is enabled.</span></div><button className="button button-small" type="button" disabled>Connect calendar</button></div>
          </div>
        </details>

        </fieldset>
        <div className="property-editor-footer"><div><strong>{editable ? "Editable property record" : "Reviewed property record"}</strong><span>{editable ? "Saving updates the property record but does not publish the listing or accept bookings." : "This state is protected from host-side edits until the review/publication workflow returns it for changes."}</span></div><button type="button" className="button" disabled={saving || !editable} onClick={save}>{saving ? "Saving…" : editable ? "Save property" : "Editing locked"}</button></div>
      </section>

      <aside className="property-editor-aside">
        <div className="property-status-card"><small>Listing status</small><strong>{initial.status.replaceAll("_", " ")}</strong><p>{initial.status === "DRAFT" || initial.status === "CHANGES_REQUESTED" || initial.status === "REJECTED" ? "Finish the listing and submit it to the Find A Place team for review." : initial.status === "PENDING_REVIEW" ? "Submitted to the Find A Place team. Editing is locked while review is active." : initial.status === "APPROVED" ? "Approved by the Find A Place team. It is not public until an authorized admin publishes it." : initial.status === "PUBLISHED" ? "Live in the guest-facing marketplace. Booking is not enabled yet." : "Currently paused from public marketplace visibility."}</p></div>
        {editable ? <div className="property-url-card"><small>Review readiness</small>{initial.submissionIssues.length ? <><strong>{initial.submissionIssues.length} item{initial.submissionIssues.length === 1 ? "" : "s"} remaining</strong><div>{initial.submissionIssues.map((issue) => <span key={issue}>• {issue}</span>)}</div></> : <><strong>Ready to submit</strong><p>The minimum listing information required for admin review is complete.</p></>}</div> : null}
        <div className="property-url-card"><small>Reserved booking URL</small><strong>/stays/{form.slug}</strong><p>Stable internal property ID: <code>{initial.propertyId.slice(0, 8)}…</code></p>{initial.oldSlugs.length ? <div><span>Old URLs preserved</span>{initial.oldSlugs.slice(0, 4).map((slug) => <code key={slug}>/stays/{slug}</code>)}</div> : null}</div>
      </aside>
    </div>
  );
}
