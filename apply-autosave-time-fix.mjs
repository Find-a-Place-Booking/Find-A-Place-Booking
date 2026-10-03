import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function file(rel) {
  return path.join(root, rel);
}

function read(rel) {
  return fs.readFileSync(file(rel), "utf8");
}

function write(rel, content) {
  const target = file(rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  console.log(`updated ${rel}`);
}

function mustReplace(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Could not apply "${label}". Source has changed; no partial replacement was made for that step.`);
  }
  return source.replace(search, replacement);
}

const timeDisplay = `export function normalizeTimeValue(
  value: string | null | undefined,
) {
  const raw = String(value || "").trim();
  const match = /^(\\d{1,2}):(\\d{2})(?::\\d{2})?$/.exec(raw);
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return "";
  }

  return \`\${String(hour).padStart(2, "0")}:\${String(minute).padStart(2, "0")}\`;
}

export function formatTime12Hour(
  value: string | null | undefined,
  fallback = "",
) {
  const normalized = normalizeTimeValue(value);
  if (!normalized) return fallback || String(value || "").trim();

  const [hourText, minute] = normalized.split(":");
  const hour = Number(hourText);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return \`\${displayHour}:\${minute} \${period}\`;
}
`;

const timeSelect = `"use client";

import type { SelectHTMLAttributes } from "react";

import {
  formatTime12Hour,
  normalizeTimeValue,
} from "@/lib/time-display";

type TimeSelect12HourProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "defaultValue" | "onChange"
> & {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
};

const baseTimeOptions = Array.from({ length: 24 * 12 }, (_, index) => {
  const minutes = index * 5;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return \`\${String(hour).padStart(2, "0")}:\${String(minute).padStart(2, "0")}\`;
});

function optionList(current: string) {
  if (!current || baseTimeOptions.includes(current)) return baseTimeOptions;

  return [...baseTimeOptions, current].sort((a, b) => {
    const [aHour, aMinute] = a.split(":").map(Number);
    const [bHour, bMinute] = b.split(":").map(Number);
    return aHour * 60 + aMinute - (bHour * 60 + bMinute);
  });
}

export function TimeSelect12Hour({
  value,
  defaultValue,
  onChange,
  ...props
}: TimeSelect12HourProps) {
  const controlled = value !== undefined;
  const normalizedValue = normalizeTimeValue(value);
  const normalizedDefault = normalizeTimeValue(defaultValue);
  const current = controlled ? normalizedValue : normalizedDefault;
  const options = optionList(current);

  return (
    <select
      {...props}
      value={controlled ? normalizedValue : undefined}
      defaultValue={controlled ? undefined : normalizedDefault}
      onChange={(event) => onChange?.(event.target.value)}
    >
      <option value="">Select time</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {formatTime12Hour(option)}
        </option>
      ))}
    </select>
  );
}
`;

write("lib/time-display.ts", timeDisplay);
write("components/TimeSelect12Hour.tsx", timeSelect);

// HOST ONBOARDING
{
  const rel = "components/HostOnboardingWizard.tsx";
  let s = read(rel);

  s = mustReplace(
    s,
`  useEffect,
  useState,`,
`  useEffect,
  useRef,
  useState,`,
    "onboarding useRef import",
  );

  s = mustReplace(
    s,
`import { OnboardingPhotoManager } from "@/components/OnboardingPhotoManager";`,
`import { OnboardingPhotoManager } from "@/components/OnboardingPhotoManager";
import { TimeSelect12Hour } from "@/components/TimeSelect12Hour";`,
    "onboarding time select import",
  );

  s = mustReplace(
    s,
`type SaveState = {
  tone: "saved" | "dirty" | "saving" | "error" | "ready";
  message: string;
};`,
`type SaveState = {
  tone: "saved" | "dirty" | "saving" | "error" | "ready";
  message: string;
};

const ONBOARDING_AUTOSAVE_DELAY_MS = 1000;

function onboardingDraftKey(organizationId: string) {
  return \`find-a-place:onboarding-draft:\${organizationId}\`;
}`,
    "onboarding autosave constants",
  );

  s = mustReplace(
    s,
`  return \`Last saved \${parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })}\`;`,
`  return \`Last saved \${parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })}\`;`,
    "onboarding saved timestamp format",
  );

  s = mustReplace(
    s,
`  const [saveState, setSaveState] = useState<SaveState>({
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
  }`,
`  const [saveState, setSaveState] = useState<SaveState>({
    tone:
      initial.onboardingStatus === "READY_FOR_PROPERTY"
        ? "ready"
        : "saved",
    message:
      initial.onboardingStatus === "READY_FOR_PROPERTY"
        ? "Host setup saved. Finish the required setup below to create the listing."
        : formatSavedAt(initial.savedAt),
  });
  const revisionRef = useRef(0);
  const draftRestoredRef = useRef(false);

  function markDirty() {
    revisionRef.current += 1;
    setDirty(true);
    setSaveState({
      tone: "dirty",
      message: "Changes are queued for autosave.",
    });
  }`,
    "onboarding revision tracking",
  );

  s = mustReplace(
    s,
`  useEffect(() => {
    if (!dirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {`,
`  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;

    const key = onboardingDraftKey(initial.organizationId);

    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;

      const draft = JSON.parse(raw) as {
        organizationId?: string;
        step?: number;
        form?: Partial<typeof initialForm>;
        amenities?: string[];
        policies?: string[];
        photoNames?: string[];
        authorityConfirmed?: boolean;
      };

      if (draft.organizationId !== initial.organizationId) return;

      if (draft.form) {
        setForm((current) => ({ ...current, ...draft.form }));
      }
      if (Array.isArray(draft.amenities)) setAmenities(draft.amenities);
      if (Array.isArray(draft.policies)) setPolicies(draft.policies);
      if (Array.isArray(draft.photoNames)) setPhotoNames(draft.photoNames);
      if (typeof draft.authorityConfirmed === "boolean") {
        setAuthorityConfirmed(draft.authorityConfirmed);
      }
      if (typeof draft.step === "number") {
        setStep(clampStep(draft.step));
      }

      revisionRef.current += 1;
      setDirty(true);
      setSaveState({
        tone: "dirty",
        message:
          "Recovered unsaved changes from this browser. Autosaving them now…",
      });
    } catch {
      window.localStorage.removeItem(key);
    }
  }, [initial.organizationId]);

  useEffect(() => {
    if (!dirty) return;

    try {
      window.localStorage.setItem(
        onboardingDraftKey(initial.organizationId),
        JSON.stringify({
          organizationId: initial.organizationId,
          step,
          form,
          amenities,
          policies,
          photoNames,
          authorityConfirmed,
          savedLocallyAt: new Date().toISOString(),
        }),
      );
    } catch {
      // Browser storage can be unavailable in private/restricted contexts.
    }
  }, [
    amenities,
    authorityConfirmed,
    dirty,
    form,
    initial.organizationId,
    photoNames,
    policies,
    step,
  ]);

  useEffect(() => {
    if (!dirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {`,
    "onboarding local draft recovery",
  );

  s = mustReplace(
    s,
`  async function persist(
    targetStep: number,
    confirm = false,
  ) {
    if (saving) return false;

    setSaving(true);
    setSaveState({
      tone: "saving",
      message: "Saving progress…",
    });`,
`  async function persist(
    targetStep: number,
    confirm = false,
    source: "manual" | "auto" = "manual",
  ) {
    if (saving) return false;

    const revisionAtStart = revisionRef.current;
    setSaving(true);
    setSaveState({
      tone: "saving",
      message:
        source === "auto" ? "Autosaving progress…" : "Saving progress…",
    });`,
    "onboarding persist autosave source",
  );

  s = mustReplace(
    s,
`    setDirty(false);
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

  async function goToStep(targetStep: number) {`,
`    const isLatestRevision =
      revisionRef.current === revisionAtStart;

    if (isLatestRevision) {
      setDirty(false);
      try {
        window.localStorage.removeItem(
          onboardingDraftKey(initial.organizationId),
        );
      } catch {
        // Keep the saved server copy even if browser storage is unavailable.
      }
    } else {
      setDirty(true);
    }

    if (result.onboardingStatus) {
      setOnboardingStatus(result.onboardingStatus);
    }

    setSaveState({
      tone: isLatestRevision
        ? result.onboardingStatus === "READY_FOR_PROPERTY"
          ? "ready"
          : "saved"
        : "dirty",
      message: isLatestRevision
        ? source === "auto"
          ? result.savedAt
            ? \`\${formatSavedAt(result.savedAt)} · Autosaved\`
            : "Progress autosaved."
          : result.message || formatSavedAt(result.savedAt)
        : "Saved an earlier edit. Newer changes are still queued for autosave.",
    });

    return true;
  }

  useEffect(() => {
    if (!dirty || saving) return;

    const timer = window.setTimeout(() => {
      void persist(step, false, "auto");
    }, ONBOARDING_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    amenities,
    authorityConfirmed,
    dirty,
    form,
    photoNames,
    policies,
    saving,
    step,
  ]);

  async function goToStep(targetStep: number) {`,
    "onboarding autosave effect",
  );

  s = mustReplace(
    s,
`                <input
                  value={form.checkIn}
                  onChange={(event) =>
                    update("checkIn", event.target.value)
                  }
                  type="time"
                />`,
`                <TimeSelect12Hour
                  value={form.checkIn}
                  onChange={(value) => update("checkIn", value)}
                />`,
    "onboarding check-in time",
  );

  s = mustReplace(
    s,
`                <input
                  value={form.checkout}
                  onChange={(event) =>
                    update("checkout", event.target.value)
                  }
                  type="time"
                />`,
`                <TimeSelect12Hour
                  value={form.checkout}
                  onChange={(value) => update("checkout", value)}
                />`,
    "onboarding checkout time",
  );

  s = mustReplace(
    s,
`                    <input
                      value={form.quietStart}
                      onChange={(event) =>
                        update(
                          "quietStart",
                          event.target.value,
                        )
                      }
                      type="time"
                    />`,
`                    <TimeSelect12Hour
                      value={form.quietStart}
                      onChange={(value) =>
                        update("quietStart", value)
                      }
                    />`,
    "onboarding quiet start",
  );

  s = mustReplace(
    s,
`                    <input
                      value={form.quietEnd}
                      onChange={(event) =>
                        update(
                          "quietEnd",
                          event.target.value,
                        )
                      }
                      type="time"
                    />`,
`                    <TimeSelect12Hour
                      value={form.quietEnd}
                      onChange={(value) =>
                        update("quietEnd", value)
                      }
                    />`,
    "onboarding quiet end",
  );

  if (s.includes('type="time"')) {
    throw new Error("HostOnboardingWizard still contains a 24-hour browser time input.");
  }

  write(rel, s);
}

// PROPERTY EDITOR
{
  const rel = "components/PropertyEditor.tsx";
  let s = read(rel);

  s = mustReplace(
    s,
`import { useMemo, useState } from "react";`,
`import { useEffect, useMemo, useRef, useState } from "react";`,
    "property editor React imports",
  );

  s = mustReplace(
    s,
`import { createClient } from "@/lib/supabase/client";`,
`import { TimeSelect12Hour } from "@/components/TimeSelect12Hour";
import { createClient } from "@/lib/supabase/client";`,
    "property editor time input import",
  );

  s = mustReplace(
    s,
`type SaveTone = "saved" | "dirty" | "saving" | "error";`,
`type SaveTone = "saved" | "dirty" | "saving" | "error";

const PROPERTY_AUTOSAVE_DELAY_MS = 1200;

function propertyDraftKey(propertyId: string) {
  return \`find-a-place:property-draft:\${propertyId}\`;
}`,
    "property editor autosave constants",
  );

  s = mustReplace(
    s,
`  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);`,
`  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const revisionRef = useRef(0);
  const draftRestoredRef = useRef(false);`,
    "property editor refs",
  );

  s = mustReplace(
    s,
`  function update(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaveTone("dirty");
    setMessage("Unsaved property changes.");
  }`,
`  function markDirty() {
    revisionRef.current += 1;
    setSaveTone("dirty");
    setMessage("Property changes are queued for autosave.");
  }

  function update(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    markDirty();
  }`,
    "property editor dirty tracking",
  );

  s = mustReplace(
    s,
`    setSaveTone("dirty");
    setMessage("Unsaved property changes.");
  }

  async function save() {
    if (saving || !editable) return;

    setSaving(true);
    setSaveTone("saving");
    setMessage("Saving property…");

    const result = await savePropertyListing({
      propertyId: initial.propertyId,
      form,
      amenities,
      policies,
    });`,
`    markDirty();
  }

  async function save(autosave = false) {
    if (saving || !editable) return;

    const revisionAtStart = revisionRef.current;
    const formToSave =
      autosave && initial.form.slug
        ? { ...form, slug: initial.form.slug }
        : form;

    setSaving(true);
    setSaveTone("saving");
    setMessage(autosave ? "Autosaving property…" : "Saving property…");

    const result = await savePropertyListing({
      propertyId: initial.propertyId,
      form: formToSave,
      amenities,
      policies,
      autosave,
    });`,
    "property editor save autosave mode",
  );

  s = mustReplace(
    s,
`    setSaveTone("saved");
    setMessage(result.message || "Property saved.");

    if (result.slug && result.slug !== form.slug) {
      setForm((current) => ({
        ...current,
        slug: result.slug!,
      }));
      router.replace(\`/host/properties/\${result.slug}\`);
    }

    router.refresh();
  }

  async function uploadFiles(files: FileList | null) {`,
`    const isLatestRevision =
      revisionRef.current === revisionAtStart;

    if (isLatestRevision) {
      setSaveTone("saved");
      setMessage(
        autosave
          ? result.message || "Property changes autosaved."
          : result.message || "Property saved.",
      );
      try {
        window.localStorage.removeItem(
          propertyDraftKey(initial.propertyId),
        );
      } catch {
        // The server copy is saved even when browser storage is restricted.
      }
    } else {
      setSaveTone("dirty");
      setMessage(
        "Saved an earlier edit. Newer changes are still queued for autosave.",
      );
    }

    if (!autosave && result.slug && result.slug !== form.slug) {
      setForm((current) => ({
        ...current,
        slug: result.slug!,
      }));
      router.replace(\`/host/properties/\${result.slug}\`);
    }

    if (!autosave) router.refresh();
  }

  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;

    const key = propertyDraftKey(initial.propertyId);

    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;

      const draft = JSON.parse(raw) as {
        propertyId?: string;
        form?: Record<string, string>;
        amenities?: string[];
        policies?: string[];
      };

      if (draft.propertyId !== initial.propertyId) return;

      if (draft.form) {
        setForm((current) => ({ ...current, ...draft.form }));
      }
      if (Array.isArray(draft.amenities)) setAmenities(draft.amenities);
      if (Array.isArray(draft.policies)) setPolicies(draft.policies);

      revisionRef.current += 1;
      setSaveTone("dirty");
      setMessage(
        "Recovered unsaved property changes from this browser. Autosaving them now…",
      );
    } catch {
      window.localStorage.removeItem(key);
    }
  }, [initial.propertyId]);

  useEffect(() => {
    if (saveTone !== "dirty") return;

    try {
      window.localStorage.setItem(
        propertyDraftKey(initial.propertyId),
        JSON.stringify({
          propertyId: initial.propertyId,
          form,
          amenities,
          policies,
          savedLocallyAt: new Date().toISOString(),
        }),
      );
    } catch {
      // Browser storage can be unavailable in private/restricted contexts.
    }
  }, [amenities, form, initial.propertyId, policies, saveTone]);

  useEffect(() => {
    if (saveTone !== "dirty" || saving || !editable) return;

    const timer = window.setTimeout(() => {
      void save(true);
    }, PROPERTY_AUTOSAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [amenities, editable, form, policies, saveTone, saving]);

  useEffect(() => {
    if (saveTone !== "dirty") return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () =>
      window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [saveTone]);

  async function uploadFiles(files: FileList | null) {`,
    "property editor local draft and autosave effects",
  );

  s = mustReplace(
    s,
`                      <input
                        type="time"
                        value={form.quietStart || "22:00"}
                        onChange={(event) =>
                          update("quietStart", event.target.value)
                        }
                      />`,
`                      <TimeSelect12Hour
                        value={form.quietStart || "22:00"}
                        onChange={(value) =>
                          update("quietStart", value)
                        }
                      />`,
    "property quiet start",
  );

  s = mustReplace(
    s,
`                      <input
                        type="time"
                        value={form.quietEnd || "07:00"}
                        onChange={(event) =>
                          update("quietEnd", event.target.value)
                        }
                      />`,
`                      <TimeSelect12Hour
                        value={form.quietEnd || "07:00"}
                        onChange={(value) =>
                          update("quietEnd", value)
                        }
                      />`,
    "property quiet end",
  );

  s = mustReplace(
    s,
`                  <input
                    type="time"
                    value={form.checkIn || ""}
                    onChange={(event) =>
                      update("checkIn", event.target.value)
                    }
                  />`,
`                  <TimeSelect12Hour
                    value={form.checkIn || ""}
                    onChange={(value) => update("checkIn", value)}
                  />`,
    "property check-in",
  );

  s = mustReplace(
    s,
`                  <input
                    type="time"
                    value={form.checkout || ""}
                    onChange={(event) =>
                      update("checkout", event.target.value)
                    }
                  />`,
`                  <TimeSelect12Hour
                    value={form.checkout || ""}
                    onChange={(value) => update("checkout", value)}
                  />`,
    "property checkout",
  );

  s = s.replaceAll(`onClick={save}`, `onClick={() => void save(false)}`);

  if (s.includes('type="time"')) {
    throw new Error("PropertyEditor still contains a 24-hour browser time input.");
  }

  write(rel, s);
}

// PROPERTY SAVE ACTION: autosaves skip address geocoding and slug changes remain manual.
{
  const rel = "app/host/properties/actions.ts";
  let s = read(rel);

  s = mustReplace(
    s,
`export type SavePropertyPayload = {
  propertyId: string;
  form: Record<string, string>;
  amenities: string[];
  policies: string[];
};`,
`export type SavePropertyPayload = {
  propertyId: string;
  form: Record<string, string>;
  amenities: string[];
  policies: string[];
  autosave?: boolean;
};`,
    "property save payload autosave flag",
  );

  s = mustReplace(
    s,
`  let mapMessage = "Property saved.";

  if (row?.property_id) {
    try {
      mapMessage = await syncStoredPropertyMapLocation(row.property_id);
    } catch (mapError) {
      console.error("[savePropertyListing] map geocode failed", mapError);
      mapMessage =
        "Property saved, but the address could not be placed on the map. Check the address and save again.";
    }
  }`,
`  let mapMessage = payload.autosave
    ? "Property changes autosaved."
    : "Property saved.";

  if (row?.property_id && !payload.autosave) {
    try {
      mapMessage = await syncStoredPropertyMapLocation(row.property_id);
    } catch (mapError) {
      console.error("[savePropertyListing] map geocode failed", mapError);
      mapMessage =
        "Property saved, but the address could not be placed on the map. Check the address and save again.";
    }
  }`,
    "skip repeated geocoding during property autosave",
  );

  s = mustReplace(
    s,
`    mapMessage =
      mapMessage === "Property saved."
        ? "Live property updated."
        : mapMessage.replace(/^Property saved/, "Live property updated");`,
`    mapMessage = payload.autosave
      ? "Live property changes autosaved."
      : mapMessage === "Property saved."
        ? "Live property updated."
        : mapMessage.replace(/^Property saved/, "Live property updated");`,
    "live property autosave message",
  );

  write(rel, s);
}

// GUEST POLICY DISPLAY
{
  const rel = "components/GuestPolicyAcceptance.tsx";
  let s = read(rel);

  s = mustReplace(
    s,
`import styles from "./GuestPolicyAcceptance.module.css";`,
`import { formatTime12Hour } from "@/lib/time-display";

import styles from "./GuestPolicyAcceptance.module.css";`,
    "guest policy 12-hour formatter import",
  );

  s = mustReplace(
    s,
`{status.propertyPolicies.checkIn.slice(0, 5)}`,
`{formatTime12Hour(status.propertyPolicies.checkIn)}`,
    "guest policy check-in display",
  );

  s = mustReplace(
    s,
`{status.propertyPolicies.checkout.slice(0, 5)}`,
`{formatTime12Hour(status.propertyPolicies.checkout)}`,
    "guest policy checkout display",
  );

  write(rel, s);
}

// PUBLIC STAY PAGE
{
  const rel = "app/stays/[slug]/page.tsx";
  let s = read(rel);

  if (!s.includes(`@/lib/time-display`)) {
    const marker = `import `;
    const lines = s.split("\n");
    const blank = lines.findIndex(
      (line, idx) =>
        idx > 0 &&
        line === "" &&
        lines.slice(0, idx).some((item) => item.startsWith("import ")),
    );
    if (blank < 0) throw new Error("Could not locate stay page import block.");
    lines.splice(blank, 0, `import { formatTime12Hour } from "@/lib/time-display";`);
    s = lines.join("\n");
  }

  s = mustReplace(
    s,
`Check-in: {property.checkIn.slice(0, 5)}`,
`Check-in: {formatTime12Hour(property.checkIn)}`,
    "stay page check-in display",
  );

  s = mustReplace(
    s,
`Checkout: {property.checkout.slice(0, 5)}`,
`Checkout: {formatTime12Hour(property.checkout)}`,
    "stay page checkout display",
  );

  write(rel, s);
}

// GUEST EMAIL AUTOMATION TIMES
{
  const rel = "app/host/guest-emails/[slug]/page.tsx";
  let s = read(rel);

  s = mustReplace(
    s,
`import { DashboardShell } from "@/components/DashboardShell";`,
`import { DashboardShell } from "@/components/DashboardShell";
import { TimeSelect12Hour } from "@/components/TimeSelect12Hour";`,
    "guest email 12-hour selector import",
  );

  s = mustReplace(
    s,
`import { createClient } from "@/lib/supabase/server";`,
`import { createClient } from "@/lib/supabase/server";
import { formatTime12Hour } from "@/lib/time-display";`,
    "guest email 12-hour formatter import",
  );

  s = mustReplace(
    s,
`            <input
              name="send_time_local"
              type="time"
              defaultValue={timeValue(rule?.send_time_local)}
              required
            />`,
`            <TimeSelect12Hour
              name="send_time_local"
              defaultValue={timeValue(rule?.send_time_local)}
              required
            />`,
    "guest email primary send time",
  );

  s = mustReplace(
    s,
`{automationTiming(rule)} · {timeValue(rule.send_time_local)} local`,
`{automationTiming(rule)} · {formatTime12Hour(timeValue(rule.send_time_local))} local`,
    "guest email saved time display",
  );

  s = mustReplace(
    s,
`                        <input
                          name="send_time_local"
                          type="time"
                          defaultValue={timeValue(rule.send_time_local)}
                          required
                        />`,
`                        <TimeSelect12Hour
                          name="send_time_local"
                          defaultValue={timeValue(rule.send_time_local)}
                          required
                        />`,
    "guest email existing rule send time",
  );

  if (s.includes('type="time"')) {
    throw new Error("Guest email editor still contains a 24-hour browser time input.");
  }

  write(rel, s);
}

// EXPLICIT 12-HOUR TIMESTAMP FORMATTING IN UI HELPERS
const formatTargets = [
  "app/host/calendar/page.tsx",
  "app/host/integrations/resnexus/page.tsx",
  "components/CalendarIntegrationPanel.tsx",
  "components/HostPolicyAcceptance.tsx",
];

for (const rel of formatTargets) {
  let s = read(rel);
  const before = s;
  s = s.replace(
`    minute: "2-digit",
  });`,
`    minute: "2-digit",
    hour12: true,
  });`,
  );
  if (s === before) {
    throw new Error(`Could not add explicit 12-hour formatting in ${rel}.`);
  }
  write(rel, s);
}

// Admin timestamps.
{
  const rel = "lib/admin/format.ts";
  let s = read(rel);
  s = mustReplace(
    s,
`    minute: "2-digit",
  }).format(date);`,
`    minute: "2-digit",
    hour12: true,
  }).format(date);`,
    "admin timestamp 12-hour format",
  );
  write(rel, s);
}

// Host messages contains two timestamp formatters.
{
  const rel = "app/host/messages/page.tsx";
  let s = read(rel);
  s = mustReplace(
    s,
`    minute: "2-digit",
  }).format(new Date(value));`,
`    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));`,
    "host message activity timestamp 12-hour format",
  );
  s = mustReplace(
    s,
`                              minute: "2-digit",
                            })}`,
`                              minute: "2-digit",
                              hour12: true,
                            })}`,
    "host message bubble timestamp 12-hour format",
  );
  write(rel, s);
}

{
  const rel = "components/GuestTripTools.tsx";
  let s = read(rel);
  s = mustReplace(
    s,
`                            minute: "2-digit",
                          },`,
`                            minute: "2-digit",
                            hour12: true,
                          },`,
    "guest trip message timestamp 12-hour format",
  );
  write(rel, s);
}

console.log("");
console.log("Find A Place autosave + 12-hour time update applied.");
console.log("Run your normal build/deploy flow now.");
