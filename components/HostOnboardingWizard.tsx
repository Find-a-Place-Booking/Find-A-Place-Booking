"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

const steps = ["Host profile", "Property", "Location & capacity", "Amenities", "Photos", "Rates & fees", "Policies", "Calendar", "Payments", "Partner status", "Review"];

const amenityGroups = [
  { title: "Popular", items: ["Wi-Fi", "Hot tub", "Pet friendly", "Fire pit", "Waterfront", "Full kitchen"] },
  { title: "Kitchen & dining", items: ["Refrigerator", "Oven / stove", "Dishwasher", "Microwave", "Coffee maker", "Grill", "Dining table"] },
  { title: "Comfort & entertainment", items: ["Air conditioning", "Heating", "Fireplace", "Washer / dryer", "TV", "Game room", "Workspace"] },
  { title: "Outdoor & location", items: ["Outdoor seating", "Private deck / patio", "Dock", "Lake access", "River access", "Mountain view", "Private acreage"] },
  { title: "Parking & access", items: ["Free parking", "Boat parking", "EV charging", "Self check-in", "Smart lock", "Step-free entrance", "Accessible parking"] }
];

const policyGroups = [
  { title: "House rules", items: ["No smoking indoors", "No parties or unauthorized events", "Registered guests only", "Parking limited to designated areas"] },
  { title: "Noise, safety & property", items: ["Quiet hours apply", "No fireworks", "No glass near pool / hot tub", "Exterior security cameras disclosed", "Guests responsible for excessive damage"] },
  { title: "Guests & pets", items: ["Pets allowed", "Children must be supervised", "Minimum booking age applies"] }
];

const initialForm = {
  hostName: "", contactName: "", phone: "", email: "", businessLocation: "",
  propertyName: "", propertyType: "", description: "",
  street: "", city: "", state: "AR", postal: "", publicArea: "",
  maxGuests: "", bedrooms: "", beds: "", bathrooms: "", minStay: "2",
  customAmenities: "",
  weeknight: "", weekend: "", cleaning: "", pet: "", extraGuest: "",
  checkIn: "15:00", checkout: "11:00", cancellation: "",
  quietStart: "22:00", quietEnd: "07:00", maxPets: "", minimumAge: "", customPolicies: "",
  partnerClaim: "", partnerBusiness: "", partnerOwner: "", partnerEmail: "", partnerPhone: ""
};

type FormKey = keyof typeof initialForm;

export function HostOnboardingWizard() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [policies, setPolicies] = useState<string[]>([]);
  const [photos, setPhotos] = useState<{ name: string; url: string }[]>([]);

  const update = (key: FormKey, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const toggle = (item: string, setter: Dispatch<SetStateAction<string[]>>) => setter((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  const next = () => setStep((value) => Math.min(value + 1, steps.length - 1));
  const previous = () => setStep((value) => Math.max(value - 1, 0));
  const propertyLabel = form.propertyName || "Your property";

  return (
    <div className="wizard near-production-wizard">
      <aside className="wizard-steps" aria-label="Listing setup steps">
        {steps.map((label, index) => <button type="button" className={step === index ? "active" : step > index ? "done" : ""} onClick={() => setStep(index)} key={label}><span>{step > index ? "✓" : index + 1}</span><b>{label}</b></button>)}
      </aside>

      <section className="panel wizard-panel">
        <div className="wizard-mobile-step"><span>Step {step + 1} of {steps.length}</span><strong>{steps[step]}</strong></div>
        <div className="wizard-progress"><span>{Math.round(((step + 1) / steps.length) * 100)}% through setup</span><i><b style={{width: `${((step + 1) / steps.length) * 100}%`}}/></i></div>

        {step === 0 && <>
          <p className="eyebrow dark">Host profile</p><h2>Who manages the stay?</h2><p>Keep this short. We only need the person or business responsible for the listing and booking notices.</p>
          <div className="field-grid onboarding-fields">
            <label className="full"><span>Business or host name</span><input value={form.hostName} onChange={(e)=>update("hostName",e.target.value)} placeholder="Business name or individual host"/></label>
            <label><span>Primary contact</span><input value={form.contactName} onChange={(e)=>update("contactName",e.target.value)} placeholder="Full name"/></label>
            <label><span>Phone</span><input value={form.phone} onChange={(e)=>update("phone",e.target.value)} type="tel" placeholder="Phone number"/></label>
            <label className="full"><span>Business email</span><input value={form.email} onChange={(e)=>update("email",e.target.value)} type="email" placeholder="Email address"/></label>
            <label className="full"><span>Business location</span><input value={form.businessLocation} onChange={(e)=>update("businessLocation",e.target.value)} placeholder="City, state"/></label>
          </div>
          <div className="inline-note"><strong>One host account can manage more than one property.</strong><span>Additional owners, managers or staff can be added later through team access.</span></div>
        </>}

        {step === 1 && <>
          <p className="eyebrow dark">Property</p><h2>Give the stay a clear identity.</h2><p>Travelers should understand what they are looking at without reading a wall of text.</p>
          <div className="field-grid onboarding-fields">
            <label className="full"><span>Property name</span><input value={form.propertyName} onChange={(e)=>update("propertyName",e.target.value)} placeholder="Public listing name"/></label>
            <label><span>Property type</span><select value={form.propertyType} onChange={(e)=>update("propertyType",e.target.value)}><option value="">Select type</option><option>Cabin</option><option>House</option><option>Cottage</option><option>Lodge</option><option>Condo</option><option>RV Site</option><option>Glamping</option><option>Tiny Home</option><option>Other</option></select></label>
            <label><span>Public area</span><input value={form.publicArea} onChange={(e)=>update("publicArea",e.target.value)} placeholder="Hot Springs, Lake Ouachita, Branson…"/></label>
            <label className="full"><span>Short description</span><textarea value={form.description} onChange={(e)=>update("description",e.target.value)} placeholder="What makes this stay worth the trip? Keep it useful and specific."/></label>
          </div>
        </>}

        {step === 2 && <>
          <p className="eyebrow dark">Location & capacity</p><h2>Where is it, and who does it fit?</h2><p>The exact address is used for mapping, taxes and booking operations. Public search can show the general area instead of the precise address.</p>
          <div className="field-grid onboarding-fields">
            <label className="full"><span>Street address</span><input value={form.street} onChange={(e)=>update("street",e.target.value)} autoComplete="street-address" placeholder="Property street address"/></label>
            <label><span>City</span><input value={form.city} onChange={(e)=>update("city",e.target.value)} autoComplete="address-level2" placeholder="City"/></label>
            <label><span>State</span><input value={form.state} onChange={(e)=>update("state",e.target.value)} autoComplete="address-level1" placeholder="AR"/></label>
            <label><span>ZIP / postal code</span><input value={form.postal} onChange={(e)=>update("postal",e.target.value)} autoComplete="postal-code" placeholder="ZIP code"/></label>
            <label><span>Maximum guests</span><input value={form.maxGuests} onChange={(e)=>update("maxGuests",e.target.value)} type="number" min="1" inputMode="numeric" placeholder="Guests"/></label>
            <label><span>Bedrooms</span><input value={form.bedrooms} onChange={(e)=>update("bedrooms",e.target.value)} type="number" min="0" inputMode="numeric" placeholder="0"/></label>
            <label><span>Beds</span><input value={form.beds} onChange={(e)=>update("beds",e.target.value)} type="number" min="0" inputMode="numeric" placeholder="0"/></label>
            <label><span>Bathrooms</span><input value={form.bathrooms} onChange={(e)=>update("bathrooms",e.target.value)} type="number" min="0" step="0.5" inputMode="decimal" placeholder="0"/></label>
            <label><span>Default minimum stay</span><input value={form.minStay} onChange={(e)=>update("minStay",e.target.value)} type="number" min="1" inputMode="numeric" placeholder="Nights"/></label>
          </div>
          <div className="privacy-note"><span>⌖</span><div><strong>Exact-address privacy</strong><p>The final listing experience will use the property's coordinates for search and the real map while controlling when an exact street address is shown to guests.</p></div></div>
        </>}

        {step === 3 && <>
          <p className="eyebrow dark">Amenities</p><h2>Check what the property actually has.</h2><p>Common choices stay standardized so guests can filter accurately. Open a group only when you need it.</p>
          <div className="selection-groups">
            {amenityGroups.map((group, index) => <details key={group.title}><summary><span>{group.title}</span><b>{group.items.filter((item)=>amenities.includes(item)).length || ""}</b></summary><div className="amenity-picker">{group.items.map((item)=><label className={amenities.includes(item)?"selected":""} key={item}><input checked={amenities.includes(item)} onChange={()=>toggle(item,setAmenities)} type="checkbox"/><span>{item}</span></label>)}</div></details>)}
          </div>
          <label className="full custom-option"><span>Other amenities</span><textarea value={form.customAmenities} onChange={(e)=>update("customAmenities",e.target.value)} placeholder="Add only amenities that are important and not covered above."/></label>
          <div className="selection-summary"><strong>{amenities.length} selected</strong><span>Only selected amenities will appear on the listing.</span></div>
        </>}

        {step === 4 && <>
          <p className="eyebrow dark">Photos</p><h2>Show the property before you explain it.</h2><p>Start with the image that best represents the stay. Photos will eventually upload to platform storage; this pass lets us test the selection and ordering layout locally.</p>
          <label className="upload-drop">
            <span>＋</span><strong>Add property photos</strong><p>Choose multiple JPG, PNG or WebP images. The first image is treated as the cover in this local UI preview.</p><span className="button button-small button-quiet">Choose photos</span>
            <input className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event)=>{const files=Array.from(event.target.files || []).slice(0,12); setPhotos(files.map((file)=>({name:file.name,url:URL.createObjectURL(file)})));}}/>
          </label>
          {photos.length > 0 ? <div className="photo-preview-grid">{photos.map((photo,index)=><div key={`${photo.name}-${index}`}><img src={photo.url} alt="Local property preview"/><span>{index===0?"Cover":`Photo ${index+1}`}</span></div>)}</div> : <div className="photo-slots">{[1,2,3,4].map((item)=><div key={item}><span>{item === 1 ? "Cover" : `Photo ${item}`}</span></div>)}</div>}
          <small className="field-help">Photo order, captions, deletion and permanent upload will be connected when property storage is built.</small>
        </>}

        {step === 5 && <>
          <p className="eyebrow dark">Rates & fees</p><h2>Keep the nightly stay separate from host fees.</h2><p>Simple defaults first. Seasonal and date-specific pricing rules can be added from the host dashboard after the property exists.</p>
          <div className="field-grid onboarding-fields">
            <label><span>Weeknight rate</span><div className="money-input"><b>$</b><input value={form.weeknight} onChange={(e)=>update("weeknight",e.target.value)} type="number" min="0" inputMode="decimal" placeholder="0"/></div></label>
            <label><span>Weekend rate</span><div className="money-input"><b>$</b><input value={form.weekend} onChange={(e)=>update("weekend",e.target.value)} type="number" min="0" inputMode="decimal" placeholder="0"/></div></label>
          </div>
          <div className="fee-section"><div><strong>Optional host fees</strong><span>Leave a field blank if it does not apply.</span></div><div className="field-grid onboarding-fields compact-fields"><label><span>Cleaning fee</span><div className="money-input"><b>$</b><input value={form.cleaning} onChange={(e)=>update("cleaning",e.target.value)} type="number" min="0" inputMode="decimal" placeholder="0"/></div></label><label><span>Pet fee / stay</span><div className="money-input"><b>$</b><input value={form.pet} onChange={(e)=>update("pet",e.target.value)} type="number" min="0" inputMode="decimal" placeholder="0"/></div></label><label><span>Extra guest / night</span><div className="money-input"><b>$</b><input value={form.extraGuest} onChange={(e)=>update("extraGuest",e.target.value)} type="number" min="0" inputMode="decimal" placeholder="0"/></div></label></div></div>
          <div className="inline-note commission-note"><strong>Find A Place commission is based on lodging only.</strong><span>The verified partner 5% or standard 7% commission is calculated from the nightly lodging subtotal after host discounts, not legitimate cleaning fees, pet fees, taxes, refundable deposits or optional add-ons.</span></div>
        </>}

        {step === 6 && <>
          <p className="eyebrow dark">Policies</p><h2>Pick the rules. We keep the presentation clean.</h2><p>Hosts should not have to write a giant policy page. Check the common rules that apply, configure the few that need details, and add custom rules only when necessary.</p>
          <div className="field-grid onboarding-fields policy-time-grid"><label><span>Check-in after</span><input value={form.checkIn} onChange={(e)=>update("checkIn",e.target.value)} type="time"/></label><label><span>Checkout by</span><input value={form.checkout} onChange={(e)=>update("checkout",e.target.value)} type="time"/></label><label className="full"><span>Cancellation policy</span><select value={form.cancellation} onChange={(e)=>update("cancellation",e.target.value)}><option value="">Choose a policy</option><option value="flexible">Flexible</option><option value="moderate">Moderate</option><option value="firm">Firm</option><option value="strict">Strict</option></select><small>Exact platform cancellation terms will be finalized before live bookings.</small></label></div>
          <div className="selection-groups policy-selection-groups">
            {policyGroups.map((group, index)=><details key={group.title}><summary><span>{group.title}</span><b>{group.items.filter((item)=>policies.includes(item)).length || ""}</b></summary><div className="amenity-picker policy-picker">{group.items.map((item)=><label className={policies.includes(item)?"selected":""} key={item}><input checked={policies.includes(item)} onChange={()=>toggle(item,setPolicies)} type="checkbox"/><span>{item}</span></label>)}</div></details>)}
          </div>
          {policies.includes("Quiet hours apply") && <div className="conditional-fields"><strong>Quiet hours</strong><div className="field-grid compact-fields"><label><span>Start</span><input value={form.quietStart} onChange={(e)=>update("quietStart",e.target.value)} type="time"/></label><label><span>End</span><input value={form.quietEnd} onChange={(e)=>update("quietEnd",e.target.value)} type="time"/></label></div></div>}
          {policies.includes("Pets allowed") && <div className="conditional-fields"><strong>Pet rule</strong><label><span>Maximum pets</span><input value={form.maxPets} onChange={(e)=>update("maxPets",e.target.value)} type="number" min="1" inputMode="numeric" placeholder="2"/></label></div>}
          {policies.includes("Minimum booking age applies") && <div className="conditional-fields"><strong>Minimum booking age</strong><label><span>Age</span><input value={form.minimumAge} onChange={(e)=>update("minimumAge",e.target.value)} type="number" min="18" inputMode="numeric" placeholder="25"/></label></div>}
          <label className="full custom-option"><span>Custom policies</span><textarea value={form.customPolicies} onChange={(e)=>update("customPolicies",e.target.value)} placeholder="One uncommon or property-specific rule per line works best."/></label>
          <div className="selection-summary"><strong>{policies.length} common rules selected</strong><span>Checked and custom policies will be formatted into the guest-facing House Rules section.</span></div>
        </>}

        {step === 7 && <>
          <p className="eyebrow dark">Calendar</p><h2>Choose the source of truth for availability.</h2><p>Calendar setup belongs to the property, not the whole host account. It will be connected after the property record exists.</p>
          <div className="choice-stack"><div className="choice-card choice-card-primary"><span>Recommended</span><strong>Connect the system you already manage</strong><p>For hosts using a PMS or channel manager, Find A Place should connect to that source rather than creating competing calendar authorities.</p></div><div className="choice-card"><strong>iCal / ICS</strong><p>Universal import/export fallback for broad compatibility with Airbnb, Vrbo and many other systems.</p></div><div className="choice-card"><strong>Direct PMS connection</strong><p>OwnerRez and other direct integrations can be added according to actual host demand.</p></div></div>
          <div className="connection-card"><div className="connection-icon">↻</div><div><strong>No calendar connected yet</strong><span>Connection buttons activate after the property is saved to the production database.</span></div><button type="button" className="button button-small" disabled>Connect calendar</button></div>
        </>}

        {step === 8 && <>
          <p className="eyebrow dark">Payments</p><h2>Where should we send booking money?</h2><p>The host experience should stay simple even though the payment provider handles identity verification and bank details behind the scenes.</p>
          <div className="connection-card payout-card"><div className="connection-icon">$</div><div><strong>Connect a payout account</strong><span>Secure provider onboarding will collect the required identity and bank details. Find A Place Booking does not store raw bank-account data or SSNs.</span></div><button type="button" className="button button-small" disabled>Connect payouts</button></div>
          <div className="inline-note"><strong>Hosts can keep their existing direct-booking processor.</strong><span>Find A Place bookings can use the platform's supported marketplace payment connection while the host continues using another processor on their own website.</span></div>
        </>}

        {step === 9 && <>
          <p className="eyebrow dark">Partner status</p><h2>Are you currently a Find A Place partner?</h2><p>This affects commission only after Find A Place staff verify the existing membership. Hosts cannot grant themselves the 5% rate.</p>
          <div className="binary-choice" role="group" aria-label="Existing Find A Place partner">
            <button type="button" className={form.partnerClaim==="yes"?"selected":""} onClick={()=>update("partnerClaim","yes")}><span>Yes</span><small>I already participate in the existing Find A Place network.</small></button>
            <button type="button" className={form.partnerClaim==="no"?"selected":""} onClick={()=>update("partnerClaim","no")}><span>No</span><small>I am joining through Find A Place Booking as a standard host.</small></button>
          </div>
          {form.partnerClaim === "yes" && <div className="partner-claim-fields"><div className="partner-pending-note"><span>Pending verification</span><strong>Your commission remains 7% until Find A Place staff approve the claim.</strong><p>Matching an imported partner record can make verification faster, but it will never automatically change the commission tier.</p></div><div className="field-grid onboarding-fields"><label className="full"><span>Business / property name used with Find A Place</span><input value={form.partnerBusiness} onChange={(e)=>update("partnerBusiness",e.target.value)} placeholder="Name associated with the existing membership"/></label><label><span>Owner name</span><input value={form.partnerOwner} onChange={(e)=>update("partnerOwner",e.target.value)} placeholder="Owner name"/></label><label><span>Membership phone</span><input value={form.partnerPhone} onChange={(e)=>update("partnerPhone",e.target.value)} type="tel" placeholder="Phone used with Find A Place"/></label><label className="full"><span>Membership email</span><input value={form.partnerEmail} onChange={(e)=>update("partnerEmail",e.target.value)} type="email" placeholder="Email used with Find A Place"/></label></div></div>}
          {form.partnerClaim === "no" && <div className="inline-note"><strong>Standard commission: 7% of lodging.</strong><span>If Find A Place partner status changes in the future, authorized staff can update the tier with a permanent audit record. Historical bookings keep their original rate.</span></div>}
        </>}

        {step === 10 && <>
          <p className="eyebrow dark">Review</p><h2>One last look before {propertyLabel} goes to review.</h2><p>The real submission workflow will validate required fields before saving. This UI preview shows how hosts can catch missing pieces without reopening every screen.</p>
          <div className="review-groups">
            <div><span>Host</span><strong>{form.hostName || "Not provided yet"}</strong><small>{form.email || "Business email not provided"}</small></div>
            <div><span>Property</span><strong>{form.propertyName || "Not provided yet"}</strong><small>{[form.propertyType, form.publicArea].filter(Boolean).join(" · ") || "Type and public area not provided"}</small></div>
            <div><span>Capacity</span><strong>{form.maxGuests ? `${form.maxGuests} guests` : "Not provided yet"}</strong><small>{[form.bedrooms && `${form.bedrooms} bedrooms`, form.beds && `${form.beds} beds`, form.bathrooms && `${form.bathrooms} baths`].filter(Boolean).join(" · ") || "Sleeping details not provided"}</small></div>
            <div><span>Amenities</span><strong>{amenities.length} selected</strong><small>{amenities.slice(0,4).join(" · ") || "No amenities selected yet"}</small></div>
            <div><span>Rates</span><strong>{form.weeknight ? `$${form.weeknight} weeknight` : "Not provided yet"}</strong><small>{form.weekend ? `$${form.weekend} weekend` : "Weekend rate not provided"}</small></div>
            <div><span>Policies</span><strong>{policies.length} common rules</strong><small>{form.customPolicies ? "Custom policies also added" : "No custom policies"}</small></div>
            <div><span>Partner claim</span><strong>{form.partnerClaim === "yes" ? "Pending verification" : form.partnerClaim === "no" ? "Standard host — 7%" : "Not answered yet"}</strong><small>{form.partnerClaim === "yes" ? "5% only after authorized approval" : "Commission tier is snapshotted on each booking"}</small></div>
            <div><span>Connections</span><strong>Calendar + payouts pending</strong><small>Activated after the database-backed property record exists</small></div>
          </div>
          <label className="checkline review-confirm"><input type="checkbox"/><span>I confirm that I have authority to list this property and that the information submitted is accurate.</span></label>
          <div className="submit-ready submit-pending"><span>○</span><div><strong>Submission stays disabled in this UI milestone</strong><p>Step 4 begins authentication. Property persistence and the real review workflow come after host accounts and organizations are connected.</p></div></div>
        </>}

        <div className="wizard-actions">
          <button type="button" className="button button-quiet" disabled={step === 0} onClick={previous}>← Back</button>
          {step < steps.length - 1 ? <button type="button" className="button" onClick={next}>Continue <span className="desktop-button-copy">to {steps[step + 1]}</span> →</button> : <button type="button" className="button" disabled>Submit property for review</button>}
        </div>
      </section>

      <aside className="onboarding-plan"><small>Platform commission</small><strong>5%</strong><span>verified Find A Place partner properties</span><hr/><p>Standard hosts are 7%. A host claiming existing partner status remains at 7% until authorized Find A Place staff verify the claim.</p><div className="plan-points"><span>✓ Commission uses lodging only</span><span>✓ Host fees stay separate</span><span>✓ Tier is snapshotted per booking</span><span>✓ Changes are audit logged</span></div></aside>
    </div>
  );
}
