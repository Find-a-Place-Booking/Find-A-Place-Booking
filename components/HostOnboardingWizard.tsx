"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

import { saveHostOnboarding } from "@/app/host/onboarding/actions";
import type { HostOnboardingRecord } from "@/lib/host/onboarding";
import { amenityGroups, calendarPreferences, policyGroups, propertyTypes } from "@/lib/property/catalog";

const steps = ["Host profile", "Property", "Location & capacity", "Amenities", "Photos", "Rates & fees", "Policies", "Calendar", "Payments", "Partner status", "Review"];

const initialForm = {
  hostName: "", contactName: "", phone: "", email: "", businessLocation: "",
  propertyName: "", propertyType: "", description: "",
  street: "", city: "", state: "AR", postal: "", publicArea: "",
  maxGuests: "", bedrooms: "", beds: "", bathrooms: "", minStay: "2",
  customAmenities: "",
  weeknight: "", weekend: "", cleaning: "", pet: "", extraGuest: "",
  checkIn: "15:00", checkout: "11:00", cancellation: "",
  quietStart: "22:00", quietEnd: "07:00", maxPets: "", minimumAge: "", customPolicies: "",
  calendarPreference: "UNSET",
  partnerClaim: "", partnerBusiness: "", partnerOwner: "", partnerEmail: "", partnerPhone: "",
};

type FormKey = keyof typeof initialForm;
type SaveState = { tone: "saved" | "dirty" | "saving" | "error" | "ready"; message: string };

function clampStep(step: number) {
  return Math.max(0, Math.min(Number.isFinite(step) ? step : 0, steps.length - 1));
}

function formatSavedAt(value: string | null | undefined) {
  if (!value) return "No saved changes yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Progress saved";
  return `Last saved ${parsed.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

export function HostOnboardingWizard({ initial }: { initial: HostOnboardingRecord }) {
  const [step, setStep] = useState(clampStep(initial.currentStep));
  const [form, setForm] = useState({ ...initialForm, ...initial.formData });
  const [amenities, setAmenities] = useState<string[]>(initial.amenities ?? []);
  const [policies, setPolicies] = useState<string[]>(initial.policies ?? []);
  const [photos, setPhotos] = useState<{ name: string; url: string }[]>([]);
  const [photoNames, setPhotoNames] = useState<string[]>(initial.photoNames ?? []);
  const [authorityConfirmed, setAuthorityConfirmed] = useState(Boolean(initial.authorityConfirmed));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [partnerStatus, setPartnerStatus] = useState(initial.partnerStatus);
  const [commissionTier, setCommissionTier] = useState(initial.commissionTier);
  const [onboardingStatus, setOnboardingStatus] = useState(initial.onboardingStatus);
  const [saveState, setSaveState] = useState<SaveState>({
    tone: initial.onboardingStatus === "READY_FOR_PROPERTY" ? "ready" : "saved",
    message: initial.onboardingStatus === "READY_FOR_PROPERTY" ? "Host setup saved — ready to create the property." : formatSavedAt(initial.savedAt),
  });

  function markDirty() {
    setDirty(true);
    setSaveState({ tone: "dirty", message: "Changes on this screen have not been saved yet." });
  }

  const update = (key: FormKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    markDirty();
  };
  const toggle = (item: string, setter: Dispatch<SetStateAction<string[]>>) => {
    setter((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
    markDirty();
  };
  const propertyLabel = form.propertyName || "Your property draft";
  const effectivePhotoNames = useMemo(() => photos.length ? photos.map((photo) => photo.name) : photoNames, [photos, photoNames]);
  const partnerVerified = partnerStatus === "VERIFIED";

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  async function persist(targetStep: number, confirm = authorityConfirmed) {
    if (saving) return false;
    setSaving(true);
    setSaveState({ tone: "saving", message: "Saving progress…" });

    const result = await saveHostOnboarding({
      organizationId: initial.organizationId,
      step: clampStep(targetStep),
      form,
      amenities,
      policies,
      photoNames: effectivePhotoNames,
      authorityConfirmed: confirm,
    });

    setSaving(false);

    if (!result.ok) {
      setSaveState({ tone: "error", message: result.message });
      return false;
    }

    setDirty(false);
    if (result.partnerStatus) setPartnerStatus(result.partnerStatus);
    if (result.commissionTier) setCommissionTier(result.commissionTier);
    if (result.onboardingStatus) setOnboardingStatus(result.onboardingStatus);
    if (effectivePhotoNames.length) setPhotoNames(effectivePhotoNames);
    setSaveState({
      tone: result.onboardingStatus === "READY_FOR_PROPERTY" ? "ready" : "saved",
      message: result.message || formatSavedAt(result.savedAt),
    });
    return true;
  }

  async function goToStep(targetStep: number) {
    const safeStep = clampStep(targetStep);
    if (safeStep === step || saving) return;
    if (await persist(safeStep)) setStep(safeStep);
  }

  async function next() {
    const target = clampStep(step + 1);
    if (await persist(target)) setStep(target);
  }

  async function previous() {
    const target = clampStep(step - 1);
    if (await persist(target)) setStep(target);
  }

  async function finishHostSetup() {
    const missing = [
      !form.hostName.trim() && "business or host name",
      !form.contactName.trim() && "primary contact",
      !form.email.trim() && "business email",
      !partnerVerified && !form.partnerClaim && "partner-status answer",
      !authorityConfirmed && "authority confirmation",
    ].filter(Boolean) as string[];

    if (missing.length) {
      setSaveState({ tone: "error", message: `Before finishing host setup, add: ${missing.join(", ")}.` });
      return;
    }

    await persist(10, true);
  }

  return (
    <div className="wizard near-production-wizard">
      <aside className="wizard-steps" aria-label="Listing setup steps">
        {steps.map((label, index) => (
          <button type="button" disabled={saving} className={step === index ? "active" : step > index ? "done" : ""} onClick={() => goToStep(index)} key={label}>
            <span>{step > index ? "✓" : index + 1}</span><b>{label}</b>
          </button>
        ))}
      </aside>

      <section className="panel wizard-panel">
        <div className="wizard-mobile-step"><span>Step {step + 1} of {steps.length}</span><strong>{steps[step]}</strong></div>
        <div className="wizard-progress"><span>{Math.round(((step + 1) / steps.length) * 100)}% through setup</span><i><b style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></i></div>
        <div className={`onboarding-save-state ${saveState.tone}`} aria-live="polite">
          <span>{saveState.tone === "saving" ? "↻" : saveState.tone === "error" ? "!" : saveState.tone === "dirty" ? "•" : "✓"}</span>
          <div><strong>{saveState.tone === "error" ? "Not saved" : saveState.tone === "dirty" ? "Unsaved changes" : saveState.tone === "ready" ? "Host setup ready" : saveState.tone === "saving" ? "Saving" : "Saved to your account"}</strong><small>{saveState.message}</small></div>
        </div>

        {step === 0 && <>
          <p className="eyebrow dark">Host profile</p><h2>Who manages the stay?</h2><p>This creates the real host organization used by the dashboard and admin team. One organization can manage multiple properties and staff accounts later.</p>
          <div className="field-grid onboarding-fields">
            <label className="full"><span>Business or host name</span><input value={form.hostName} onChange={(e) => update("hostName", e.target.value)} placeholder="Business name or individual host" /></label>
            <label><span>Primary contact</span><input value={form.contactName} onChange={(e) => update("contactName", e.target.value)} placeholder="Full name" /></label>
            <label><span>Phone</span><input value={form.phone} onChange={(e) => update("phone", e.target.value)} type="tel" placeholder="Phone number" /></label>
            <label className="full"><span>Business email</span><input value={form.email} onChange={(e) => update("email", e.target.value)} type="email" placeholder="Email address" /></label>
            <label className="full"><span>Business location</span><input value={form.businessLocation} onChange={(e) => update("businessLocation", e.target.value)} placeholder="City, state" /></label>
          </div>
          <div className="inline-note"><strong>Organization ID: {initial.organizationId.slice(0, 8)}…</strong><span>This organization persists across sign-out/sign-in. Property records are managed in Properties; additional team-member controls can be added later.</span></div>
        </>}

        {step === 1 && <>
          <p className="eyebrow dark">Property draft</p><h2>Give the first stay a clear identity.</h2><p>These details are saved with onboarding and can seed the first real property record. After creation, listing edits happen in Properties.</p>
          <div className="field-grid onboarding-fields">
            <label className="full"><span>Property name</span><input value={form.propertyName} onChange={(e) => update("propertyName", e.target.value)} placeholder="Public listing name" /></label>
            <label><span>Property type</span><select value={form.propertyType} onChange={(e) => update("propertyType", e.target.value)}><option value="">Select type</option>{propertyTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label><span>Public area</span><input value={form.publicArea} onChange={(e) => update("publicArea", e.target.value)} placeholder="Hot Springs, Lake Ouachita, Branson…" /></label>
            <label className="full"><span>Short description</span><textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="What makes this stay worth the trip? Keep it useful and specific." /></label>
          </div>
        </>}

        {step === 2 && <>
          <p className="eyebrow dark">Location & capacity</p><h2>Where is it, and who does it fit?</h2><p>The exact address will later drive taxes, geocoding and the real map. Public search can show the general area instead of the precise street address.</p>
          <div className="field-grid onboarding-fields">
            <label className="full"><span>Street address</span><input value={form.street} onChange={(e) => update("street", e.target.value)} autoComplete="street-address" placeholder="Property street address" /></label>
            <label><span>City</span><input value={form.city} onChange={(e) => update("city", e.target.value)} autoComplete="address-level2" placeholder="City" /></label>
            <label><span>State</span><input value={form.state} onChange={(e) => update("state", e.target.value)} autoComplete="address-level1" placeholder="AR" /></label>
            <label><span>ZIP / postal code</span><input value={form.postal} onChange={(e) => update("postal", e.target.value)} autoComplete="postal-code" placeholder="ZIP code" /></label>
            <label><span>Maximum guests</span><input value={form.maxGuests} onChange={(e) => update("maxGuests", e.target.value)} type="number" min="1" inputMode="numeric" placeholder="Guests" /></label>
            <label><span>Bedrooms</span><input value={form.bedrooms} onChange={(e) => update("bedrooms", e.target.value)} type="number" min="0" inputMode="numeric" placeholder="0" /></label>
            <label><span>Beds</span><input value={form.beds} onChange={(e) => update("beds", e.target.value)} type="number" min="0" inputMode="numeric" placeholder="0" /></label>
            <label><span>Bathrooms</span><input value={form.bathrooms} onChange={(e) => update("bathrooms", e.target.value)} type="number" min="0" step="0.5" inputMode="decimal" placeholder="0" /></label>
            <label><span>Default minimum stay</span><input value={form.minStay} onChange={(e) => update("minStay", e.target.value)} type="number" min="1" inputMode="numeric" placeholder="Nights" /></label>
          </div>
          <div className="privacy-note"><span>⌖</span><div><strong>Exact-address privacy</strong><p>The production listing will use property coordinates for search and mapping while controlling when an exact address is revealed to guests.</p></div></div>
        </>}

        {step === 3 && <>
          <p className="eyebrow dark">Amenities</p><h2>Check what the property actually has.</h2><p>Common choices stay standardized so guests can filter accurately. These selections now persist with your onboarding draft.</p>
          <div className="selection-groups">
            {amenityGroups.map((group) => <details key={group.title}><summary><span>{group.title}</span><b>{group.items.filter((item) => amenities.includes(item)).length || ""}</b></summary><div className="amenity-picker">{group.items.map((item) => <label className={amenities.includes(item) ? "selected" : ""} key={item}><input checked={amenities.includes(item)} onChange={() => toggle(item, setAmenities)} type="checkbox" /><span>{item}</span></label>)}</div></details>)}
          </div>
          <label className="full custom-option"><span>Other amenities</span><textarea value={form.customAmenities} onChange={(e) => update("customAmenities", e.target.value)} placeholder="Add only amenities that are important and not covered above." /></label>
          <div className="selection-summary"><strong>{amenities.length} selected</strong><span>Only selected amenities will eventually appear on the listing.</span></div>
        </>}

        {step === 4 && <>
          <p className="eyebrow dark">Photos</p><h2>Show the property before you explain it.</h2><p>Onboarding remembers the selected filenames and local previews. Upload the actual image files from Properties after the property record is created.</p>
          <label className="upload-drop">
            <span>＋</span><strong>Add property photos</strong><p>Choose multiple JPG, PNG or WebP images. The first image is treated as the cover in this local preview.</p><span className="button button-small button-quiet">Choose photos</span>
            <input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { const files = Array.from(event.target.files || []).slice(0, 12); setPhotos(files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) }))); setPhotoNames(files.map((file) => file.name)); markDirty(); }} />
          </label>
          {photos.length > 0 ? <div className="photo-preview-grid">{photos.map((photo, index) => <div key={`${photo.name}-${index}`}><img src={photo.url} alt="Local property preview" /><span>{index === 0 ? "Cover" : `Photo ${index + 1}`}</span></div>)}</div> : photoNames.length > 0 ? <div className="saved-photo-names"><strong>Saved photo selections</strong>{photoNames.map((name, index) => <span key={`${name}-${index}`}>{index === 0 ? "Cover" : `Photo ${index + 1}`} · {name}</span>)}<small>The files themselves are not uploaded from onboarding. Add the actual photos from Properties after creating the listing.</small></div> : <div className="photo-slots">{[1, 2, 3, 4].map((item) => <div key={item}><span>{item === 1 ? "Cover" : `Photo ${item}`}</span></div>)}</div>}
        </>}

        {step === 5 && <>
          <p className="eyebrow dark">Rates & fees</p><h2>Keep the nightly stay separate from host fees.</h2><p>These save with onboarding and carry into the property pricing record when you create the property from the Properties screen.</p>
          <div className="field-grid onboarding-fields">
            <label><span>Weeknight rate</span><div className="money-input"><b>$</b><input value={form.weeknight} onChange={(e) => update("weeknight", e.target.value)} type="number" min="0" inputMode="decimal" placeholder="0" /></div></label>
            <label><span>Weekend rate</span><div className="money-input"><b>$</b><input value={form.weekend} onChange={(e) => update("weekend", e.target.value)} type="number" min="0" inputMode="decimal" placeholder="0" /></div></label>
          </div>
          <div className="fee-section"><div><strong>Optional host fees</strong><span>Leave a field blank if it does not apply.</span></div><div className="field-grid onboarding-fields compact-fields"><label><span>Cleaning fee</span><div className="money-input"><b>$</b><input value={form.cleaning} onChange={(e) => update("cleaning", e.target.value)} type="number" min="0" inputMode="decimal" placeholder="0" /></div></label><label><span>Pet fee / stay</span><div className="money-input"><b>$</b><input value={form.pet} onChange={(e) => update("pet", e.target.value)} type="number" min="0" inputMode="decimal" placeholder="0" /></div></label><label><span>Extra guest / night</span><div className="money-input"><b>$</b><input value={form.extraGuest} onChange={(e) => update("extraGuest", e.target.value)} type="number" min="0" inputMode="decimal" placeholder="0" /></div></label></div></div>
          <div className="inline-note commission-note"><strong>Find A Place commission is based on lodging only.</strong><span>The verified partner 5% or standard 7% commission is calculated from the nightly lodging subtotal after host discounts, not legitimate cleaning fees, pet fees, taxes, refundable deposits or optional add-ons.</span></div>
        </>}

        {step === 6 && <>
          <p className="eyebrow dark">Policies</p><h2>Pick the rules. We keep the presentation clean.</h2><p>Common policy choices and their details persist with onboarding and carry into the property record. Confirmed bookings will later retain the accepted policy snapshot.</p>
          <div className="field-grid onboarding-fields policy-time-grid"><label><span>Check-in after</span><input value={form.checkIn} onChange={(e) => update("checkIn", e.target.value)} type="time" /></label><label><span>Checkout by</span><input value={form.checkout} onChange={(e) => update("checkout", e.target.value)} type="time" /></label><label className="full"><span>Cancellation policy</span><select value={form.cancellation} onChange={(e) => update("cancellation", e.target.value)}><option value="">Choose a policy</option><option value="flexible">Flexible</option><option value="moderate">Moderate</option><option value="firm">Firm</option><option value="strict">Strict</option></select><small>Exact platform cancellation terms will be finalized before live bookings.</small></label></div>
          <div className="selection-groups policy-selection-groups">
            {policyGroups.map((group) => <details key={group.title}><summary><span>{group.title}</span><b>{group.items.filter((item) => policies.includes(item)).length || ""}</b></summary><div className="amenity-picker policy-picker">{group.items.map((item) => <label className={policies.includes(item) ? "selected" : ""} key={item}><input checked={policies.includes(item)} onChange={() => toggle(item, setPolicies)} type="checkbox" /><span>{item}</span></label>)}</div></details>)}
          </div>
          {policies.includes("Quiet hours apply") && <div className="conditional-fields"><strong>Quiet hours</strong><div className="field-grid compact-fields"><label><span>Start</span><input value={form.quietStart} onChange={(e) => update("quietStart", e.target.value)} type="time" /></label><label><span>End</span><input value={form.quietEnd} onChange={(e) => update("quietEnd", e.target.value)} type="time" /></label></div></div>}
          {policies.includes("Pets allowed") && <div className="conditional-fields"><strong>Pet rule</strong><label><span>Maximum pets</span><input value={form.maxPets} onChange={(e) => update("maxPets", e.target.value)} type="number" min="1" inputMode="numeric" placeholder="2" /></label></div>}
          {policies.includes("Minimum booking age applies") && <div className="conditional-fields"><strong>Minimum booking age</strong><label><span>Age</span><input value={form.minimumAge} onChange={(e) => update("minimumAge", e.target.value)} type="number" min="18" inputMode="numeric" placeholder="25" /></label></div>}
          <label className="full custom-option"><span>Custom policies</span><textarea value={form.customPolicies} onChange={(e) => update("customPolicies", e.target.value)} placeholder="One uncommon or property-specific rule per line works best." /></label>
          <div className="selection-summary"><strong>{policies.length} common rules selected</strong><span>Checked and custom policies will eventually become the guest-facing House Rules section.</span></div>
        </>}

        {step === 7 && <>
          <p className="eyebrow dark">Calendar</p><h2>Choose the source of truth for availability.</h2><p>You can save the preferred calendar approach now. The actual iCal/PMS connection is managed per property once calendar sync is enabled.</p>
          <div className="calendar-preference-grid">{calendarPreferences.map((option) => <button type="button" key={option.value} className={form.calendarPreference === option.value ? "selected" : ""} onClick={() => update("calendarPreference", option.value)}><strong>{option.label}</strong><span>{option.detail}</span></button>)}</div>
          <div className="connection-card"><div className="connection-icon">↻</div><div><strong>Preference saved; connection comes later</strong><span>Property setup carries this choice onto the real property. Calendar URLs, PMS credentials and sync jobs remain disabled until calendar sync is enabled.</span></div><button type="button" className="button button-small" disabled>Connect calendar</button></div>
        </>}

        {step === 8 && <>
          <p className="eyebrow dark">Payments</p><h2>Where should we send booking money?</h2><p>Payment onboarding remains intentionally disabled. Stripe Connect and Square are added only after the property/booking foundation is proven.</p>
          <div className="connection-card payout-card"><div className="connection-icon">$</div><div><strong>Connect a payout account</strong><span>Secure provider onboarding will collect identity and bank details later. Find A Place Booking will not store raw bank-account data or SSNs.</span></div><button type="button" className="button button-small" disabled>Connect payouts</button></div>
          <div className="inline-note"><strong>Multiple-property architecture is preserved.</strong><span>The future payment-account model will allow supported processor accounts to be assigned appropriately instead of assuming every property under a manager must use one bank account forever.</span></div>
        </>}

        {step === 9 && <>
          <p className="eyebrow dark">Partner status</p><h2>Are you currently a Find A Place partner?</h2><p>This is now a real verification request. Hosts can submit identifying details, but only authorized Find A Place staff can activate the 5% tier.</p>
          {partnerVerified ? <div className="partner-pending-note partner-verified-note"><span>Verified partner</span><strong>This organization is approved at 5%.</strong><p>The verified tier is controlled by authorized admins and cannot be removed from host onboarding.</p></div> : <div className="binary-choice" role="group" aria-label="Existing Find A Place partner">
            <button type="button" className={form.partnerClaim === "yes" ? "selected" : ""} onClick={() => update("partnerClaim", "yes")}><span>Yes</span><small>I already participate in the existing Find A Place network.</small></button>
            <button type="button" className={form.partnerClaim === "no" ? "selected" : ""} onClick={() => update("partnerClaim", "no")}><span>No</span><small>I am joining through Find A Place Booking as a standard host.</small></button>
          </div>}
          {!partnerVerified && form.partnerClaim === "yes" && <div className="partner-claim-fields"><div className="partner-pending-note"><span>{partnerStatus === "REJECTED" ? "Standard rate retained" : "Pending verification"}</span><strong>{partnerStatus === "REJECTED" ? "Find A Place kept this organization at the standard 7% rate." : "Your commission remains 7% until Find A Place staff approve the claim."}</strong><p>{partnerStatus === "REJECTED" ? "Editing the saved membership details does not automatically reopen an admin decision. A future explicit re-review workflow can be added if needed." : "Saving this step creates/updates the real admin verification request. Matching a future imported partner record may speed review but will never automatically grant 5%."}</p></div><div className="field-grid onboarding-fields"><label className="full"><span>Business / property name used with Find A Place</span><input value={form.partnerBusiness} onChange={(e) => update("partnerBusiness", e.target.value)} placeholder="Name associated with the existing membership" /></label><label><span>Owner name</span><input value={form.partnerOwner} onChange={(e) => update("partnerOwner", e.target.value)} placeholder="Owner name" /></label><label><span>Membership phone</span><input value={form.partnerPhone} onChange={(e) => update("partnerPhone", e.target.value)} type="tel" placeholder="Phone used with Find A Place" /></label><label className="full"><span>Membership email</span><input value={form.partnerEmail} onChange={(e) => update("partnerEmail", e.target.value)} type="email" placeholder="Email used with Find A Place" /></label></div></div>}
          {!partnerVerified && form.partnerClaim === "no" && <div className="inline-note"><strong>Standard commission: 7% of lodging.</strong><span>If partner status changes later, authorized staff can update the tier with a permanent audit record. Historical bookings will keep their original rate.</span></div>}
        </>}

        {step === 10 && <>
          <p className="eyebrow dark">Review</p><h2>Save the host setup before we create {propertyLabel}.</h2><p>Your host setup stays separate from the property record. Once this setup is saved, the Properties screen can create the first real draft listing from everything entered here.</p>
          <div className="review-groups">
            <div><span>Host</span><strong>{form.hostName || "Not provided yet"}</strong><small>{form.email || "Business email not provided"}</small></div>
            <div><span>Organization</span><strong>{initial.organizationId.slice(0, 8)}…</strong><small>{onboardingStatus === "READY_FOR_PROPERTY" ? "Ready for property build" : "Onboarding in progress"}</small></div>
            <div><span>Property draft</span><strong>{form.propertyName || "Not provided yet"}</strong><small>{[form.propertyType, form.publicArea].filter(Boolean).join(" · ") || "Type and public area not provided"}</small></div>
            <div><span>Capacity</span><strong>{form.maxGuests ? `${form.maxGuests} guests` : "Not provided yet"}</strong><small>{[form.bedrooms && `${form.bedrooms} bedrooms`, form.beds && `${form.beds} beds`, form.bathrooms && `${form.bathrooms} baths`].filter(Boolean).join(" · ") || "Sleeping details not provided"}</small></div>
            <div><span>Amenities</span><strong>{amenities.length} selected</strong><small>{amenities.slice(0, 4).join(" · ") || "No amenities selected yet"}</small></div>
            <div><span>Rates</span><strong>{form.weeknight ? `$${form.weeknight} weeknight` : "Not provided yet"}</strong><small>{form.weekend ? `$${form.weekend} weekend` : "Weekend rate not provided"}</small></div>
            <div><span>Policies</span><strong>{policies.length} common rules</strong><small>{form.customPolicies ? "Custom policies also added" : "No custom policies"}</small></div>
            <div><span>Partner status</span><strong>{partnerStatus === "VERIFIED" ? "Verified partner — 5%" : partnerStatus === "PARTNER_PENDING" || form.partnerClaim === "yes" ? "Pending verification — 7%" : "Standard host — 7%"}</strong><small>Hosts cannot self-award the partner rate</small></div>
          </div>
          <label className="checkline review-confirm"><input type="checkbox" checked={authorityConfirmed} onChange={(event) => { setAuthorityConfirmed(event.target.checked); markDirty(); }} /><span>I confirm that I have authority to manage/list the property information entered here and that the host information is accurate.</span></label>
          <div className={`submit-ready ${onboardingStatus === "READY_FOR_PROPERTY" ? "" : "submit-pending"}`}><span>{onboardingStatus === "READY_FOR_PROPERTY" ? "✓" : "○"}</span><div><strong>{onboardingStatus === "READY_FOR_PROPERTY" ? "Host setup is saved" : "No live property is created yet"}</strong><p>{onboardingStatus === "READY_FOR_PROPERTY" ? "You can leave and return without losing this onboarding draft. Open Properties next to create the real draft listing from it." : "Saving this step marks the host organization ready to create its first property without publishing or accepting bookings."}</p></div></div>
        </>}

        <div className="wizard-actions">
          <button type="button" className="button button-quiet" disabled={step === 0 || saving} onClick={previous}>← Back</button>
          {step < steps.length - 1 ? <button type="button" className="button" disabled={saving} onClick={next}>{saving ? "Saving…" : <>Save & continue <span className="desktop-button-copy">to {steps[step + 1]}</span> →</>}</button> : <button type="button" className="button" disabled={saving} onClick={finishHostSetup}>{saving ? "Saving…" : onboardingStatus === "READY_FOR_PROPERTY" ? "Save changes" : "Finish host setup"}</button>}
        </div>
      </section>

      <aside className="onboarding-plan"><small>Current organization tier</small><strong>{commissionTier === "PARTNER_5" ? "5%" : "7%"}</strong><span>{partnerStatus === "VERIFIED" ? "verified Find A Place partner" : partnerStatus === "PARTNER_PENDING" ? "partner claim pending review" : "standard host"}</span><hr /><p>A partner claim never changes the organization from 7% to 5% on the host side. Only an authorized admin verification can do that.</p><div className="plan-points"><span>✓ Progress saved to your account</span><span>✓ Commission uses lodging only</span><span>✓ Partner changes are audit logged</span><span>✓ Property creation available in Properties</span></div></aside>
    </div>
  );
}
