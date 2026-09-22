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
  weeknight: "", weekend: "", cleaning: "", pet: "", includedGuests: "", extraGuest: "",
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
      !form.propertyName.trim() && "first property name",
      !form.email.trim() && "business email",
      !form.cancellation.trim() && "cancellation / refund terms",
      !partnerVerified && !form.partnerClaim && "partner-status answer",
      Number.parseFloat(form.extraGuest || "0") > 0 && !form.includedGuests.trim() && "guests included in the nightly rate",
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
          <p className="eyebrow dark">Host profile</p><h2>Who manages the stay?</h2><p>This creates the host organization used by the dashboard, guest contact details and admin team.</p>
          <div className="field-grid onboarding-fields">
            <label className="full"><span>Business or host name</span><input value={form.hostName} onChange={(e) => update("hostName", e.target.value)} placeholder="Business name or individual host" /></label>
            <label><span>Primary contact</span><input value={form.contactName} onChange={(e) => update("contactName", e.target.value)} placeholder="Full name" /></label>
            <label><span>Phone</span><input value={form.phone} onChange={(e) => update("phone", e.target.value)} type="tel" placeholder="Phone number" /></label>
            <label className="full"><span>Business email</span><input value={form.email} onChange={(e) => update("email", e.target.value)} type="email" placeholder="Email address" /></label>
            <label className="full"><span>Business location</span><input value={form.businessLocation} onChange={(e) => update("businessLocation", e.target.value)} placeholder="City, state" /></label>
          </div>
        </>}

        {step === 1 && <>
          <p className="eyebrow dark">Property draft</p><h2>Give the first stay a clear identity.</h2>
          <div className="field-grid onboarding-fields">
            <label className="full"><span>Property name</span><input value={form.propertyName} onChange={(e) => update("propertyName", e.target.value)} placeholder="Public listing name" /></label>
            <label><span>Property type</span><select value={form.propertyType} onChange={(e) => update("propertyType", e.target.value)}><option value="">Select type</option>{propertyTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
            <label><span>Public area</span><input value={form.publicArea} onChange={(e) => update("publicArea", e.target.value)} placeholder="Hot Springs, Lake Ouachita, Branson…" /></label>
            <label className="full"><span>Short description</span><textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="What makes this stay worth the trip?" /></label>
          </div>
        </>}

        {step === 2 && <>
          <p className="eyebrow dark">Location & capacity</p><h2>Where is it, and who does it fit?</h2>
          <div className="field-grid onboarding-fields">
            <label className="full"><span>Street address</span><input value={form.street} onChange={(e) => update("street", e.target.value)} autoComplete="street-address" /></label>
            <label><span>City</span><input value={form.city} onChange={(e) => update("city", e.target.value)} /></label>
            <label><span>State</span><input value={form.state} onChange={(e) => update("state", e.target.value)} /></label>
            <label><span>ZIP / postal code</span><input value={form.postal} onChange={(e) => update("postal", e.target.value)} /></label>
            <label><span>Maximum guests</span><input value={form.maxGuests} onChange={(e) => update("maxGuests", e.target.value)} type="number" min="1" /></label>
            <label><span>Bedrooms</span><input value={form.bedrooms} onChange={(e) => update("bedrooms", e.target.value)} type="number" min="0" /></label>
            <label><span>Beds</span><input value={form.beds} onChange={(e) => update("beds", e.target.value)} type="number" min="0" /></label>
            <label><span>Bathrooms</span><input value={form.bathrooms} onChange={(e) => update("bathrooms", e.target.value)} type="number" min="0" step="0.5" /></label>
            <label><span>Default minimum stay</span><input value={form.minStay} onChange={(e) => update("minStay", e.target.value)} type="number" min="1" /></label>
          </div>
        </>}

        {step === 3 && <>
          <p className="eyebrow dark">Amenities</p><h2>Check what the property actually has.</h2>
          <div className="selection-groups">{amenityGroups.map((group) => <details key={group.title}><summary><span>{group.title}</span><b>{group.items.filter((item) => amenities.includes(item)).length || ""}</b></summary><div className="amenity-picker">{group.items.map((item) => <label className={amenities.includes(item) ? "selected" : ""} key={item}><input checked={amenities.includes(item)} onChange={() => toggle(item, setAmenities)} type="checkbox" /><span>{item}</span></label>)}</div></details>)}</div>
          <label className="full custom-option"><span>Other amenities</span><textarea value={form.customAmenities} onChange={(e) => update("customAmenities", e.target.value)} /></label>
        </>}

        {step === 4 && <>
          <p className="eyebrow dark">Photos</p><h2>Show the property before you explain it.</h2>
          <label className="upload-drop"><span>＋</span><strong>Add property photos</strong><p>Choose multiple JPG, PNG or WebP images. Upload the actual files from Properties after creating the listing.</p><span className="button button-small button-quiet">Choose photos</span><input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => { const files = Array.from(event.target.files || []).slice(0, 12); setPhotos(files.map((file) => ({ name: file.name, url: URL.createObjectURL(file) }))); setPhotoNames(files.map((file) => file.name)); markDirty(); }} /></label>
          {photos.length ? <div className="photo-preview-grid">{photos.map((photo, index) => <div key={`${photo.name}-${index}`}><img src={photo.url} alt="Local property preview" /><span>{index === 0 ? "Cover" : `Photo ${index + 1}`}</span></div>)}</div> : photoNames.length ? <div className="saved-photo-names">{photoNames.map((name) => <span key={name}>{name}</span>)}</div> : null}
        </>}

        {step === 5 && <>
          <p className="eyebrow dark">Rates & fees</p><h2>Keep the nightly stay separate from host fees.</h2>
          <div className="field-grid onboarding-fields">
            <label><span>Weeknight rate</span><div className="money-input"><b>$</b><input value={form.weeknight} onChange={(e) => update("weeknight", e.target.value)} type="number" min="0" /></div></label>
            <label><span>Weekend rate</span><div className="money-input"><b>$</b><input value={form.weekend} onChange={(e) => update("weekend", e.target.value)} type="number" min="0" /></div></label>
            <label><span>Cleaning fee</span><div className="money-input"><b>$</b><input value={form.cleaning} onChange={(e) => update("cleaning", e.target.value)} type="number" min="0" /></div></label>
            <label><span>Pet fee / stay</span><div className="money-input"><b>$</b><input value={form.pet} onChange={(e) => update("pet", e.target.value)} type="number" min="0" /></div></label>
            <label><span>Guests included</span><input value={form.includedGuests} onChange={(e) => update("includedGuests", e.target.value)} type="number" min="1" /></label>
            <label><span>Extra guest / night</span><div className="money-input"><b>$</b><input value={form.extraGuest} onChange={(e) => update("extraGuest", e.target.value)} type="number" min="0" /></div></label>
          </div>
          <div className="inline-note commission-note"><strong>Find A Place commission is based on lodging only.</strong><span>The verified partner 5% or standard 7% commission is calculated from the nightly lodging subtotal after host discounts, not legitimate host fees, taxes or optional add-ons.</span></div>
        </>}

        {step === 6 && <>
          <p className="eyebrow dark">Policies</p><h2>Set the rules guests will agree to.</h2><p>The host&apos;s cancellation/refund terms are required before a listing can be approved. Guests see and accept the saved policy before payment.</p>
          <div className="field-grid onboarding-fields policy-time-grid">
            <label><span>Check-in after</span><input value={form.checkIn} onChange={(e) => update("checkIn", e.target.value)} type="time" /></label>
            <label><span>Checkout by</span><input value={form.checkout} onChange={(e) => update("checkout", e.target.value)} type="time" /></label>
            <label className="full"><span>Cancellation / refund terms</span><textarea rows={5} value={form.cancellation} onChange={(e) => update("cancellation", e.target.value)} placeholder="Example: Full refund until the date or deadline you choose; after that, state clearly whether the booking is refundable, partially refundable or non-refundable, subject to applicable law." required /><small>Write the exact guest-facing terms you intend to apply. Find A Place sends cancellation requests to you rather than automatically deciding them.</small></label>
          </div>
          <div className="selection-groups policy-selection-groups">{policyGroups.map((group) => <details key={group.title}><summary><span>{group.title}</span><b>{group.items.filter((item) => policies.includes(item)).length || ""}</b></summary><div className="amenity-picker policy-picker">{group.items.map((item) => <label className={policies.includes(item) ? "selected" : ""} key={item}><input checked={policies.includes(item)} onChange={() => toggle(item, setPolicies)} type="checkbox" /><span>{item}</span></label>)}</div></details>)}</div>
          {policies.includes("Quiet hours apply") && <div className="conditional-fields"><strong>Quiet hours</strong><div className="field-grid compact-fields"><label><span>Start</span><input value={form.quietStart} onChange={(e) => update("quietStart", e.target.value)} type="time" /></label><label><span>End</span><input value={form.quietEnd} onChange={(e) => update("quietEnd", e.target.value)} type="time" /></label></div></div>}
          {policies.includes("Pets allowed") && <div className="conditional-fields"><strong>Pet rule</strong><label><span>Maximum pets</span><input value={form.maxPets} onChange={(e) => update("maxPets", e.target.value)} type="number" min="1" inputMode="numeric" placeholder="2" /></label></div>}
          {policies.includes("Minimum booking age applies") && <div className="conditional-fields"><strong>Minimum booking age</strong><label><span>Age</span><input value={form.minimumAge} onChange={(e) => update("minimumAge", e.target.value)} type="number" min="18" inputMode="numeric" placeholder="25" /></label></div>}
          <label className="full custom-option"><span>Custom policies</span><textarea value={form.customPolicies} onChange={(e) => update("customPolicies", e.target.value)} placeholder="One uncommon or property-specific rule per line works best." /></label>
        </>}

        {step === 7 && <>
          <p className="eyebrow dark">Calendar</p><h2>Choose the source of truth for availability.</h2><p>Save the preferred calendar approach here, then connect the actual iCal feed from Calendar after the property is created.</p>
          <div className="calendar-preference-grid">{calendarPreferences.map((option) => <button type="button" key={option.value} className={form.calendarPreference === option.value ? "selected" : ""} onClick={() => update("calendarPreference", option.value)}><strong>{option.label}</strong><span>{option.detail}</span></button>)}</div>
        </>}

        {step === 8 && <>
          <p className="eyebrow dark">Payments</p><h2>Connect the account that will own guest payments.</h2><p>After property setup, open Payments &amp; taxes and connect Stripe. Guest charges are created directly on the host&apos;s connected Stripe account.</p>
          <div className="connection-card payout-card"><div className="connection-icon">$</div><div><strong>Host-owned Stripe payments</strong><span>Stripe charges its processing fee to the host account. Find A Place receives only its assigned application fee plus any tax amount the platform is configured to remit.</span></div></div>
          <div className="inline-note"><strong>Stripe handles balances and bank deposits.</strong><span>Find A Place stores the connected account reference and payment status, not raw bank-account data, identity documents or SSNs. TEST and LIVE accounts remain separate.</span></div>
        </>}

        {step === 9 && <>
          <p className="eyebrow dark">Partner status</p><h2>Are you currently a Find A Place partner?</h2><p>Hosts can submit identifying details, but only authorized Find A Place staff can activate the 5% tier.</p>
          {partnerVerified ? <div className="partner-pending-note partner-verified-note"><span>Verified partner</span><strong>This organization is approved at 5%.</strong></div> : <div className="binary-choice" role="group" aria-label="Existing Find A Place partner"><button type="button" className={form.partnerClaim === "yes" ? "selected" : ""} onClick={() => update("partnerClaim", "yes")}><span>Yes</span><small>I already participate in the existing Find A Place network.</small></button><button type="button" className={form.partnerClaim === "no" ? "selected" : ""} onClick={() => update("partnerClaim", "no")}><span>No</span><small>I am joining through Find A Place Booking as a standard host.</small></button></div>}
          {!partnerVerified && form.partnerClaim === "yes" ? <div className="field-grid onboarding-fields"><label className="full"><span>Business / property name used with Find A Place</span><input value={form.partnerBusiness} onChange={(e) => update("partnerBusiness", e.target.value)} /></label><label><span>Owner name</span><input value={form.partnerOwner} onChange={(e) => update("partnerOwner", e.target.value)} /></label><label><span>Membership phone</span><input value={form.partnerPhone} onChange={(e) => update("partnerPhone", e.target.value)} /></label><label className="full"><span>Membership email</span><input value={form.partnerEmail} onChange={(e) => update("partnerEmail", e.target.value)} type="email" /></label></div> : null}
        </>}

        {step === 10 && <>
          <p className="eyebrow dark">Review</p><h2>Save the host setup before we create {propertyLabel}.</h2>
          <div className="review-groups">
            <div><span>Host</span><strong>{form.hostName || "Not provided yet"}</strong><small>{form.email || "Business email not provided"}</small></div>
            <div><span>Property draft</span><strong>{form.propertyName || "Not provided yet"}</strong><small>{[form.propertyType, form.publicArea].filter(Boolean).join(" · ") || "Type and public area not provided"}</small></div>
            <div><span>Cancellation terms</span><strong>{form.cancellation ? "Added" : "Required"}</strong><small>{form.cancellation || "Add exact guest-facing cancellation/refund terms"}</small></div>
            <div><span>Partner status</span><strong>{partnerStatus === "VERIFIED" ? "Verified partner — 5%" : partnerStatus === "PARTNER_PENDING" || form.partnerClaim === "yes" ? "Pending verification — 7%" : "Standard host — 7%"}</strong></div>
          </div>
          <label className="checkline review-confirm"><input type="checkbox" checked={authorityConfirmed} onChange={(event) => { setAuthorityConfirmed(event.target.checked); markDirty(); }} /><span>I confirm that I have authority to manage/list the property information entered here and that the host information and policies are accurate.</span></label>
        </>}

        <div className="wizard-actions">
          <button type="button" className="button button-quiet" disabled={step === 0 || saving} onClick={previous}>← Back</button>
          {step < steps.length - 1 ? <button type="button" className="button" disabled={saving} onClick={next}>{saving ? "Saving…" : <>Save & continue <span className="desktop-button-copy">to {steps[step + 1]}</span> →</>}</button> : <button type="button" className="button" disabled={saving} onClick={finishHostSetup}>{saving ? "Saving…" : onboardingStatus === "READY_FOR_PROPERTY" ? "Save changes" : "Finish host setup"}</button>}
        </div>
      </section>

      <aside className="onboarding-plan">
        <small>Current organization tier</small><strong>{commissionTier === "PARTNER_5" ? "5%" : "7%"}</strong><span>{partnerStatus === "VERIFIED" ? "verified Find A Place partner" : partnerStatus === "PARTNER_PENDING" ? "partner claim pending review" : "standard host"}</span><hr /><p>Guest payments belong to the connected host processor account. Find A Place receives the assigned platform fee and provides the booking, messaging and cancellation-request tools.</p><div className="plan-points"><span>✓ Host-owned direct payments</span><span>✓ Commission uses lodging only</span><span>✓ Guest policies saved with each booking</span><span>✓ Cancellation requests go to the host</span></div>
      </aside>
    </div>
  );
}
