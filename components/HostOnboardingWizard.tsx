"use client";

import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";

import { saveHostOnboarding } from "@/app/host/onboarding/actions";
import { OnboardingPhotoManager } from "@/components/OnboardingPhotoManager";
import { OnboardingTaxSetup } from "@/components/onboarding/OnboardingTaxSetup";
import { OnboardingStripeSetup } from "@/components/payments/OnboardingStripeSetup";
import type { HostOnboardingRecord } from "@/lib/host/onboarding";
import {
  amenityGroups,
  calendarPreferences,
  policyGroups,
  propertyTypes,
} from "@/lib/property/catalog";
import { getStateTaxSetup } from "@/lib/taxes/state-config";

const steps = [
  "Host profile",
  "Property",
  "Location & capacity",
  "Amenities",
  "Photos",
  "Rates & fees",
  "Taxes",
  "Policies",
  "Calendar",
  "Payments",
  "Review",
];

const initialForm = {
  hostName: "",
  contactName: "",
  phone: "",
  email: "",
  businessLocation: "",
  propertyName: "",
  propertyType: "",
  description: "",
  street: "",
  city: "",
  state: "AR",
  postal: "",
  publicArea: "",
  maxGuests: "",
  bedrooms: "",
  beds: "",
  bathrooms: "",
  minStay: "2",
  customAmenities: "",
  weeknight: "",
  weekend: "",
  cleaning: "",
  pet: "",
  includedGuests: "",
  extraGuest: "",
  taxCounty: "",
  taxLocality: "",
  taxLinesJson: "",
  taxResponsibilityAccepted: "false",
  checkIn: "15:00",
  checkout: "11:00",
  cancellation: "",
  quietStart: "22:00",
  quietEnd: "07:00",
  maxPets: "",
  minimumAge: "",
  customPolicies: "",
  calendarPreference: "UNSET",
};

type FormKey = keyof typeof initialForm;

type SaveState = {
  tone: "saved" | "dirty" | "saving" | "error" | "ready";
  message: string;
};

function clampStep(step: number) {
  return Math.max(
    0,
    Math.min(Number.isFinite(step) ? step : 0, steps.length - 1),
  );
}

function formatSavedAt(value: string | null | undefined) {
  if (!value) return "No saved changes yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Progress saved";
  return `Last saved ${parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function positiveNumber(value: string) {
  return Number.parseFloat(value || "0") > 0;
}

function taxLineCount(raw: string) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (line) =>
            Number(line?.rate_bps || 0) > 0 &&
            String(line?.label || "").trim(),
        ).length
      : 0;
  } catch {
    return 0;
  }
}

export function HostOnboardingWizard({
  initial,
}: {
  initial: HostOnboardingRecord;
}) {
  const router = useRouter();
  const [step, setStep] = useState(clampStep(initial.currentStep));
  const [form, setForm] = useState({
    ...initialForm,
    ...initial.formData,
  });
  const [amenities, setAmenities] = useState<string[]>(
    initial.amenities ?? [],
  );
  const [policies, setPolicies] = useState<string[]>(
    initial.policies ?? [],
  );
  const [photoNames, setPhotoNames] = useState<string[]>(
    initial.photoNames ?? [],
  );
  const [stripeReady, setStripeReady] = useState(
    Boolean(initial.stripeReady),
  );
  const [authorityConfirmed, setAuthorityConfirmed] = useState(
    Boolean(initial.authorityConfirmed),
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState(
    initial.onboardingStatus,
  );
  const [saveState, setSaveState] = useState<SaveState>({
    tone:
      initial.onboardingStatus === "READY_FOR_PROPERTY"
        ? "ready"
        : "saved",
    message:
      initial.onboardingStatus === "READY_FOR_PROPERTY"
        ? "Host setup saved. Finish the required setup below to create the listing."
        : formatSavedAt(initial.savedAt),
  });

  function markDirty() {
    setDirty(true);
    setSaveState({
      tone: "dirty",
      message: "Changes on this screen have not been saved yet.",
    });
  }

  const update = (key: FormKey, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    markDirty();
  };

  const updateState = (value: string) => {
    const nextState = value.toUpperCase().slice(0, 2);
    setForm((current) => {
      if (current.state === nextState) {
        return { ...current, state: nextState };
      }

      return {
        ...current,
        state: nextState,
        taxCounty: "",
        taxLocality: "",
        taxLinesJson: "",
        taxResponsibilityAccepted: "false",
      };
    });
    markDirty();
  };

  const toggle = (
    item: string,
    setter: Dispatch<SetStateAction<string[]>>,
  ) => {
    setter((current) =>
      current.includes(item)
        ? current.filter((value) => value !== item)
        : [...current, item],
    );
    markDirty();
  };

  const propertyLabel = form.propertyName || "your property";
  const taxSetup = getStateTaxSetup(form.state);
  const configuredLocalTaxLines = taxLineCount(form.taxLinesJson);

  useEffect(() => {
    if (!dirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  function setAttention(message: string) {
    setSaveState({
      tone: "error",
      message,
    });
  }

  function validateCurrentStep() {
    if (step === 0) {
      if (
        !form.hostName.trim() ||
        !form.contactName.trim() ||
        !form.email.trim()
      ) {
        return "Add the host/business name, primary contact and business email before continuing.";
      }
      if (!form.email.includes("@")) {
        return "Enter a valid business email before continuing.";
      }
    }

    if (step === 1) {
      if (
        !form.propertyName.trim() ||
        !form.propertyType.trim() ||
        !form.description.trim()
      ) {
        return "Add the property name, property type and a short description before continuing.";
      }
    }

    if (step === 2) {
      if (
        !form.street.trim() ||
        !form.city.trim() ||
        !form.state.trim() ||
        !form.postal.trim()
      ) {
        return "Add the complete property address before continuing. It is needed for mapping and tax setup.";
      }
      if (!positiveNumber(form.maxGuests)) {
        return "Set the maximum guest capacity before continuing.";
      }
    }

    if (step === 4 && photoNames.length < 1) {
      return "Upload at least one property photo before continuing. Photos save to the real listing immediately.";
    }

    if (step === 5) {
      if (!positiveNumber(form.weeknight)) {
        return "Add a weeknight rate greater than $0 before continuing.";
      }
      if (
        positiveNumber(form.extraGuest) &&
        !positiveNumber(form.includedGuests)
      ) {
        return "If you charge an extra-guest fee, enter how many guests are included in the nightly rate.";
      }
    }

    if (
      step === 6 &&
      form.taxResponsibilityAccepted !== "true"
    ) {
      return "Review the property tax setup and confirm the host tax responsibility before continuing.";
    }

    if (
      step === 7 &&
      form.cancellation.trim().length < 20
    ) {
      return "Add specific guest-facing cancellation/refund terms before continuing.";
    }

    if (step === 9 && !stripeReady) {
      return "Finish Stripe Connect before continuing to Review. This keeps you from having to come back after onboarding.";
    }

    return null;
  }

  async function persist(
    targetStep: number,
    confirm = false,
  ) {
    if (saving) return false;

    setSaving(true);
    setSaveState({
      tone: "saving",
      message: "Saving progress…",
    });

    const result = await saveHostOnboarding({
      organizationId: initial.organizationId,
      step: clampStep(targetStep),
      form,
      amenities,
      policies,
      photoNames,
      authorityConfirmed: confirm,
    });

    setSaving(false);

    if (!result.ok) {
      setSaveState({
        tone: "error",
        message: result.message,
      });
      return false;
    }

    setDirty(false);
    if (result.onboardingStatus) {
      setOnboardingStatus(result.onboardingStatus);
    }

    setSaveState({
      tone:
        result.onboardingStatus === "READY_FOR_PROPERTY"
          ? "ready"
          : "saved",
      message:
        result.message || formatSavedAt(result.savedAt),
    });

    return true;
  }

  async function goToStep(targetStep: number) {
    const safeStep = clampStep(targetStep);
    if (safeStep === step || saving) return;

    if (safeStep > step) {
      const problem = validateCurrentStep();
      if (problem) {
        setAttention(problem);
        return;
      }
    }

    if (await persist(safeStep, false)) setStep(safeStep);
  }

  async function next() {
    const problem = validateCurrentStep();
    if (problem) {
      setAttention(problem);
      return;
    }

    const target = clampStep(step + 1);
    if (await persist(target, false)) setStep(target);
  }

  async function previous() {
    const target = clampStep(step - 1);
    if (await persist(target, false)) setStep(target);
  }

  async function finishHostSetup() {
    const missing = [
      !form.hostName.trim() && "business or host name",
      !form.contactName.trim() && "primary contact",
      !form.email.trim() && "business email",
      !form.propertyName.trim() && "first property name",
      !form.propertyType.trim() && "property type",
      !form.description.trim() && "property description",
      !form.street.trim() && "property street address",
      !form.city.trim() && "property city",
      !form.state.trim() && "property state",
      !form.postal.trim() && "property ZIP code",
      !positiveNumber(form.maxGuests) && "maximum guests",
      !positiveNumber(form.weeknight) && "weeknight rate",
      photoNames.length < 1 && "at least one property photo",
      form.taxResponsibilityAccepted !== "true" &&
        "property tax responsibility confirmation",
      form.cancellation.trim().length < 20 &&
        "specific cancellation / refund terms",
      positiveNumber(form.extraGuest) &&
        !positiveNumber(form.includedGuests) &&
        "guests included in the nightly rate",
      !stripeReady && "completed Stripe Connect",
      !authorityConfirmed && "authority confirmation",
      !initial.policyAccepted &&
        "Find A Place Host Agreement and policy acceptance",
    ].filter(Boolean) as string[];

    if (missing.length) {
      setAttention(
        `Before finishing host setup, add: ${missing.join(", ")}.`,
      );
      return;
    }

    const saved = await persist(10, true);
    if (!saved) return;

    setSaving(true);
    setSaveState({
      tone: "saving",
      message:
        "Finalizing the listing, taxes, photos, payment connection and property record…",
    });

    try {
      const response = await fetch(
        "/api/host/onboarding/complete",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            organizationId: initial.organizationId,
          }),
        },
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.slug) {
        throw new Error(
          payload?.error || "Unable to finish host setup.",
        );
      }

      setDirty(false);
      setOnboardingStatus("READY_FOR_PROPERTY");
      setSaveState({
        tone: "ready",
        message:
          "Host setup complete. Opening the finished property record…",
      });

      const completionQuery = payload.published
        ? "onboarding=complete&published=1"
        : `onboarding=complete${
            payload.publicationMessage
              ? `&publish_error=${encodeURIComponent(
                  payload.publicationMessage,
                )}`
              : ""
          }`;

      router.push(
        `/host/properties/${encodeURIComponent(
          payload.slug,
        )}?${completionQuery}`,
      );
      router.refresh();
    } catch (error) {
      setSaving(false);
      setSaveState({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to finish host setup.",
      });
    }
  }

  return (
    <div className="wizard near-production-wizard">
      <aside
        className="wizard-steps"
        aria-label="Listing setup steps"
      >
        {steps.map((label, index) => (
          <button
            type="button"
            disabled={saving}
            className={
              step === index
                ? "active"
                : step > index
                  ? "done"
                  : ""
            }
            onClick={() => goToStep(index)}
            key={label}
          >
            <span>{step > index ? "✓" : index + 1}</span>
            <b>{label}</b>
          </button>
        ))}
      </aside>

      <section className="panel wizard-panel">
        <div className="wizard-mobile-step">
          <span>
            Step {step + 1} of {steps.length}
          </span>
          <strong>{steps[step]}</strong>
        </div>

        <div className="wizard-progress">
          <span>
            {Math.round(
              ((step + 1) / steps.length) * 100,
            )}
            % through setup
          </span>
          <i>
            <b
              style={{
                width: `${
                  ((step + 1) / steps.length) * 100
                }%`,
              }}
            />
          </i>
        </div>

        <div
          className={`onboarding-save-state ${saveState.tone}`}
          aria-live="polite"
        >
          <span>
            {saveState.tone === "saving"
              ? "↻"
              : saveState.tone === "error"
                ? "!"
                : saveState.tone === "dirty"
                  ? "•"
                  : "✓"}
          </span>
          <div>
            <strong>
              {saveState.tone === "error"
                ? "Needs attention"
                : saveState.tone === "dirty"
                  ? "Unsaved changes"
                  : saveState.tone === "ready"
                    ? "Setup ready"
                    : saveState.tone === "saving"
                      ? "Saving"
                      : "Saved to your account"}
            </strong>
            <small>{saveState.message}</small>
          </div>
        </div>

        {step === 0 && (
          <>
            <p className="eyebrow dark">Host profile</p>
            <h2>Who manages the stay?</h2>
            <p>
              This creates the host organization used by the
              dashboard, guest contact details and admin team.
            </p>
            <div className="field-grid onboarding-fields">
              <label className="full">
                <span>Business or host name</span>
                <input
                  value={form.hostName}
                  onChange={(event) =>
                    update("hostName", event.target.value)
                  }
                  placeholder="Business name or individual host"
                />
              </label>
              <label>
                <span>Primary contact</span>
                <input
                  value={form.contactName}
                  onChange={(event) =>
                    update("contactName", event.target.value)
                  }
                  placeholder="Full name"
                />
              </label>
              <label>
                <span>Phone</span>
                <input
                  value={form.phone}
                  onChange={(event) =>
                    update("phone", event.target.value)
                  }
                  type="tel"
                  placeholder="Phone number"
                />
              </label>
              <label className="full">
                <span>Business email</span>
                <input
                  value={form.email}
                  onChange={(event) =>
                    update("email", event.target.value)
                  }
                  type="email"
                  placeholder="Email address"
                />
              </label>
              <label className="full">
                <span>Business location</span>
                <input
                  value={form.businessLocation}
                  onChange={(event) =>
                    update(
                      "businessLocation",
                      event.target.value,
                    )
                  }
                  placeholder="City, state"
                />
              </label>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <p className="eyebrow dark">Property draft</p>
            <h2>Give the first stay a clear identity.</h2>
            <div className="field-grid onboarding-fields">
              <label className="full">
                <span>Property name</span>
                <input
                  value={form.propertyName}
                  onChange={(event) =>
                    update("propertyName", event.target.value)
                  }
                  placeholder="Public listing name"
                />
              </label>
              <label>
                <span>Property type</span>
                <select
                  value={form.propertyType}
                  onChange={(event) =>
                    update("propertyType", event.target.value)
                  }
                >
                  <option value="">Select type</option>
                  {propertyTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Public area</span>
                <input
                  value={form.publicArea}
                  onChange={(event) =>
                    update("publicArea", event.target.value)
                  }
                  placeholder="Hot Springs, Lake Ouachita, Branson…"
                />
              </label>
              <label className="full">
                <span>Short description</span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    update("description", event.target.value)
                  }
                  placeholder="What makes this stay worth the trip?"
                />
              </label>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="eyebrow dark">
              Location &amp; capacity
            </p>
            <h2>Where is it, and who does it fit?</h2>
            <p>
              The complete address is used for mapping and the
              property-specific tax setup. Guests still only see the
              address according to the listing privacy settings.
            </p>
            <div className="field-grid onboarding-fields">
              <label className="full">
                <span>Street address</span>
                <input
                  value={form.street}
                  onChange={(event) =>
                    update("street", event.target.value)
                  }
                  autoComplete="street-address"
                />
              </label>
              <label>
                <span>City</span>
                <input
                  value={form.city}
                  onChange={(event) =>
                    update("city", event.target.value)
                  }
                  autoComplete="address-level2"
                />
              </label>
              <label>
                <span>State</span>
                <input
                  value={form.state}
                  onChange={(event) =>
                    updateState(event.target.value)
                  }
                  list="find-a-place-supported-states"
                  autoComplete="address-level1"
                  maxLength={2}
                  placeholder="AR"
                />
                <datalist id="find-a-place-supported-states">
                  <option value="AR">Arkansas</option>
                  <option value="MO">Missouri</option>
                  <option value="TX">Texas</option>
                  <option value="TN">Tennessee</option>
                </datalist>
              </label>
              <label>
                <span>ZIP / postal code</span>
                <input
                  value={form.postal}
                  onChange={(event) =>
                    update("postal", event.target.value)
                  }
                  autoComplete="postal-code"
                />
              </label>
              <label>
                <span>Maximum guests</span>
                <input
                  value={form.maxGuests}
                  onChange={(event) =>
                    update("maxGuests", event.target.value)
                  }
                  type="number"
                  min="1"
                />
              </label>
              <label>
                <span>Bedrooms</span>
                <input
                  value={form.bedrooms}
                  onChange={(event) =>
                    update("bedrooms", event.target.value)
                  }
                  type="number"
                  min="0"
                />
              </label>
              <label>
                <span>Beds</span>
                <input
                  value={form.beds}
                  onChange={(event) =>
                    update("beds", event.target.value)
                  }
                  type="number"
                  min="0"
                />
              </label>
              <label>
                <span>Bathrooms</span>
                <input
                  value={form.bathrooms}
                  onChange={(event) =>
                    update("bathrooms", event.target.value)
                  }
                  type="number"
                  min="0"
                  step="0.5"
                />
              </label>
              <label>
                <span>Default minimum stay</span>
                <input
                  value={form.minStay}
                  onChange={(event) =>
                    update("minStay", event.target.value)
                  }
                  type="number"
                  min="1"
                />
              </label>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="eyebrow dark">Amenities</p>
            <h2>Check what the property actually has.</h2>
            <div className="selection-groups">
              {amenityGroups.map((group) => (
                <details key={group.title}>
                  <summary>
                    <span>{group.title}</span>
                    <b>
                      {group.items.filter((item) =>
                        amenities.includes(item),
                      ).length || ""}
                    </b>
                  </summary>
                  <div className="amenity-picker">
                    {group.items.map((item) => (
                      <label
                        className={
                          amenities.includes(item)
                            ? "selected"
                            : ""
                        }
                        key={item}
                      >
                        <input
                          checked={amenities.includes(item)}
                          onChange={() =>
                            toggle(item, setAmenities)
                          }
                          type="checkbox"
                        />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                </details>
              ))}
            </div>
            <label className="full custom-option">
              <span>Other amenities</span>
              <textarea
                value={form.customAmenities}
                onChange={(event) =>
                  update(
                    "customAmenities",
                    event.target.value,
                  )
                }
              />
            </label>
          </>
        )}

        {step === 4 && (
          <>
            <p className="eyebrow dark">Photos</p>
            <h2>Upload the actual listing photos now.</h2>
            <p>
              These photos save directly to the real draft property,
              so you will not have to upload them again after
              onboarding.
            </p>
            <OnboardingPhotoManager
              organizationId={initial.organizationId}
              propertyName={form.propertyName}
              onPhotoNamesChange={(names) => {
                setPhotoNames(names);
                markDirty();
              }}
            />
          </>
        )}

        {step === 5 && (
          <>
            <p className="eyebrow dark">Rates &amp; fees</p>
            <h2>Keep the nightly stay separate from host fees.</h2>
            <div className="field-grid onboarding-fields">
              <label>
                <span>Weeknight rate</span>
                <div className="money-input">
                  <b>$</b>
                  <input
                    value={form.weeknight}
                    onChange={(event) =>
                      update("weeknight", event.target.value)
                    }
                    type="number"
                    min="0"
                  />
                </div>
              </label>
              <label>
                <span>Weekend rate</span>
                <div className="money-input">
                  <b>$</b>
                  <input
                    value={form.weekend}
                    onChange={(event) =>
                      update("weekend", event.target.value)
                    }
                    type="number"
                    min="0"
                  />
                </div>
              </label>
              <label>
                <span>Cleaning fee</span>
                <div className="money-input">
                  <b>$</b>
                  <input
                    value={form.cleaning}
                    onChange={(event) =>
                      update("cleaning", event.target.value)
                    }
                    type="number"
                    min="0"
                  />
                </div>
              </label>
              <label>
                <span>Pet fee / stay</span>
                <div className="money-input">
                  <b>$</b>
                  <input
                    value={form.pet}
                    onChange={(event) =>
                      update("pet", event.target.value)
                    }
                    type="number"
                    min="0"
                  />
                </div>
              </label>
              <label>
                <span>Guests included</span>
                <input
                  value={form.includedGuests}
                  onChange={(event) =>
                    update(
                      "includedGuests",
                      event.target.value,
                    )
                  }
                  type="number"
                  min="1"
                />
              </label>
              <label>
                <span>Extra guest / night</span>
                <div className="money-input">
                  <b>$</b>
                  <input
                    value={form.extraGuest}
                    onChange={(event) =>
                      update("extraGuest", event.target.value)
                    }
                    type="number"
                    min="0"
                  />
                </div>
              </label>
            </div>

            <div className="inline-note commission-note">
              <strong>
                Find A Place commission is based on lodging only.
              </strong>
              <span>
                The commission rate assigned to your account is
                applied to the nightly lodging subtotal after host
                discounts, not legitimate host fees, taxes or
                optional add-ons.
              </span>
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <p className="eyebrow dark">Property taxes</p>
            <h2>
              Confirm the taxes that apply to {propertyLabel}.
            </h2>
            <p>
              The setup follows the property's state. Find A Place
              automatically applies the active statewide rules for
              supported states, while the host enters and confirms
              the local taxes for this property.
            </p>

            <OnboardingTaxSetup
              stateCode={form.state}
              city={form.city}
              county={form.taxCounty}
              locality={form.taxLocality}
              linesJson={form.taxLinesJson}
              accepted={
                form.taxResponsibilityAccepted === "true"
              }
              onCountyChange={(value) =>
                update("taxCounty", value)
              }
              onLocalityChange={(value) =>
                update("taxLocality", value)
              }
              onLinesChange={(value) =>
                update("taxLinesJson", value)
              }
              onAcceptedChange={(value) =>
                update(
                  "taxResponsibilityAccepted",
                  value ? "true" : "false",
                )
              }
            />
          </>
        )}

        {step === 7 && (
          <>
            <p className="eyebrow dark">Policies</p>
            <h2>Set the rules guests will agree to.</h2>
            <p>
              Your cancellation/refund terms are required before a
              listing can be published. Guests see and accept the
              saved property policy before payment. Find A Place&apos;s
              platform commission is governed separately by the Host
              Agreement.
            </p>

            <div className="field-grid onboarding-fields policy-time-grid">
              <label>
                <span>Check-in after</span>
                <input
                  value={form.checkIn}
                  onChange={(event) =>
                    update("checkIn", event.target.value)
                  }
                  type="time"
                />
              </label>
              <label>
                <span>Checkout by</span>
                <input
                  value={form.checkout}
                  onChange={(event) =>
                    update("checkout", event.target.value)
                  }
                  type="time"
                />
              </label>
              <label className="full">
                <span>Cancellation / refund terms</span>
                <textarea
                  rows={5}
                  value={form.cancellation}
                  onChange={(event) =>
                    update(
                      "cancellation",
                      event.target.value,
                    )
                  }
                  placeholder="State exactly when and how much you refund guests. Find A Place's platform commission remains non-refundable."
                  required
                />
                <small>
                  Write the exact guest-facing terms you intend to
                  apply. Cancellation and refund requests are decided
                  by you under those terms, subject to applicable law.
                </small>
              </label>
            </div>

            <div className="selection-groups policy-selection-groups">
              {policyGroups.map((group) => (
                <details key={group.title}>
                  <summary>
                    <span>{group.title}</span>
                    <b>
                      {group.items.filter((item) =>
                        policies.includes(item),
                      ).length || ""}
                    </b>
                  </summary>
                  <div className="amenity-picker policy-picker">
                    {group.items.map((item) => (
                      <label
                        className={
                          policies.includes(item)
                            ? "selected"
                            : ""
                        }
                        key={item}
                      >
                        <input
                          checked={policies.includes(item)}
                          onChange={() =>
                            toggle(item, setPolicies)
                          }
                          type="checkbox"
                        />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                </details>
              ))}
            </div>

            {policies.includes("Quiet hours apply") && (
              <div className="conditional-fields">
                <strong>Quiet hours</strong>
                <div className="field-grid compact-fields">
                  <label>
                    <span>Start</span>
                    <input
                      value={form.quietStart}
                      onChange={(event) =>
                        update(
                          "quietStart",
                          event.target.value,
                        )
                      }
                      type="time"
                    />
                  </label>
                  <label>
                    <span>End</span>
                    <input
                      value={form.quietEnd}
                      onChange={(event) =>
                        update(
                          "quietEnd",
                          event.target.value,
                        )
                      }
                      type="time"
                    />
                  </label>
                </div>
              </div>
            )}

            {policies.includes("Pets allowed") && (
              <div className="conditional-fields">
                <strong>Pet rule</strong>
                <label>
                  <span>Maximum pets</span>
                  <input
                    value={form.maxPets}
                    onChange={(event) =>
                      update("maxPets", event.target.value)
                    }
                    type="number"
                    min="1"
                    inputMode="numeric"
                    placeholder="2"
                  />
                </label>
              </div>
            )}

            {policies.includes(
              "Minimum booking age applies",
            ) && (
              <div className="conditional-fields">
                <strong>Minimum booking age</strong>
                <label>
                  <span>Age</span>
                  <input
                    value={form.minimumAge}
                    onChange={(event) =>
                      update(
                        "minimumAge",
                        event.target.value,
                      )
                    }
                    type="number"
                    min="18"
                    inputMode="numeric"
                    placeholder="25"
                  />
                </label>
              </div>
            )}

            <label className="full custom-option">
              <span>Custom policies</span>
              <textarea
                value={form.customPolicies}
                onChange={(event) =>
                  update(
                    "customPolicies",
                    event.target.value,
                  )
                }
                placeholder="One uncommon or property-specific rule per line works best."
              />
            </label>
          </>
        )}

        {step === 8 && (
          <>
            <p className="eyebrow dark">Calendar</p>
            <h2>
              Choose the source of truth for availability.
            </h2>
            <p>
              Save the preferred calendar approach here. Calendar
              connections can be added after the listing is created;
              your choice here is carried into the real property
              record.
            </p>
            <div className="calendar-preference-grid">
              {calendarPreferences.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={
                    form.calendarPreference === option.value
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    update(
                      "calendarPreference",
                      option.value,
                    )
                  }
                >
                  <strong>{option.label}</strong>
                  <span>{option.detail}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 9 && (
          <>
            <p className="eyebrow dark">Payments</p>
            <h2>
              Connect Stripe before you finish onboarding.
            </h2>
            <p>
              Guest payments are direct charges on the host&apos;s
              connected Stripe account. Find A Place receives only its
              commission; booking proceeds and guest tax funds remain
              with the host account.
            </p>
            <OnboardingStripeSetup
              organizationId={initial.organizationId}
              onReadyChange={setStripeReady}
            />
          </>
        )}

        {step === 10 && (
          <>
            <p className="eyebrow dark">Review</p>
            <h2>Finish setup and create {propertyLabel}.</h2>

            <div className="review-groups">
              <div>
                <span>Host</span>
                <strong>
                  {form.hostName || "Not provided yet"}
                </strong>
                <small>
                  {form.email ||
                    "Business email not provided"}
                </small>
              </div>

              <div>
                <span>Property draft</span>
                <strong>
                  {form.propertyName || "Not provided yet"}
                </strong>
                <small>
                  {[form.propertyType, form.publicArea]
                    .filter(Boolean)
                    .join(" · ") ||
                    "Type and public area not provided"}
                </small>
              </div>

              <div>
                <span>Property photos</span>
                <strong>
                  {photoNames.length
                    ? `${photoNames.length} saved`
                    : "At least one required"}
                </strong>
                <small>
                  Photos are already attached to the real listing
                  draft.
                </small>
              </div>

              <div>
                <span>Property taxes</span>
                <strong>
                  {form.taxResponsibilityAccepted === "true"
                    ? "Configured"
                    : "Required"}
                </strong>
                <small>
                  {taxSetup.name} · statewide rules automatic ·{" "}
                  {configuredLocalTaxLines} local tax{" "}
                  {configuredLocalTaxLines === 1
                    ? "line"
                    : "lines"}
                </small>
              </div>

              <div>
                <span>Stripe payments</span>
                <strong>
                  {stripeReady
                    ? "Connected and ready"
                    : "Required before completion"}
                </strong>
                <small>
                  Guest payments use the host-owned connected Stripe
                  account.
                </small>
              </div>

              <div>
                <span>Cancellation terms</span>
                <strong>
                  {form.cancellation.trim().length >= 20
                    ? "Added"
                    : "Required"}
                </strong>
                <small>
                  {form.cancellation ||
                    "Add exact guest-facing cancellation/refund terms"}
                </small>
              </div>

              <div>
                <span>Find A Place policies</span>
                <strong>
                  {initial.policyAccepted
                    ? "Accepted"
                    : "Acceptance required"}
                </strong>
                <small>
                  The Host Agreement controls platform commission,
                  cancellations, refunds and account responsibilities.
                </small>
              </div>
            </div>

            <div className="onboarding-tax-review">
              <strong>
                Ready means the listing has the essentials for live
                booking.
              </strong>
              <span>
                The completion check verifies required listing data,
                at least one real photo, the host-certified tax setup,
                Stripe charge/payout readiness and the host policy
                acceptance before publication is attempted.
              </span>
            </div>

            <label className="checkline review-confirm">
              <input
                type="checkbox"
                checked={authorityConfirmed}
                onChange={(event) => {
                  setAuthorityConfirmed(
                    event.target.checked,
                  );
                  markDirty();
                }}
              />
              <span>
                I confirm that I have authority to manage/list the
                property information entered here and that the host
                information, property policies and tax setup are
                accurate.
              </span>
            </label>
          </>
        )}

        <div className="wizard-actions">
          <button
            type="button"
            className="button button-quiet"
            disabled={step === 0 || saving}
            onClick={previous}
          >
            ← Back
          </button>

          {step < steps.length - 1 ? (
            <button
              type="button"
              className="button"
              disabled={saving}
              onClick={next}
            >
              {saving ? (
                "Saving…"
              ) : (
                <>
                  Save &amp; continue{" "}
                  <span className="desktop-button-copy">
                    to {steps[step + 1]}
                  </span>{" "}
                  →
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="button"
              disabled={saving}
              onClick={finishHostSetup}
            >
              {saving
                ? "Finishing setup…"
                : onboardingStatus ===
                    "READY_FOR_PROPERTY"
                  ? "Finish setup & open listing"
                  : "Finish setup & create listing"}
            </button>
          )}
        </div>
      </section>

      <aside className="onboarding-plan">
        <small>Find A Place host setup</small>
        <strong>Complete once</strong>
        <span>listing + taxes + payments</span>
        <hr />
        <p>
          The first listing is built to be booking-ready here instead
          of sending the host back through multiple dashboard screens
          after onboarding.
        </p>
        <div className="plan-points">
          <span>✓ Real listing photos saved now</span>
          <span>✓ Property tax setup confirmed now</span>
          <span>✓ Stripe Connect completed now</span>
          <span>✓ Host-owned direct payments</span>
          <span>✓ Listing data carries into the property record</span>
        </div>
      </aside>
    </div>
  );
}
