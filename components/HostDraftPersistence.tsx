"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type SavedField =
  | { kind: "value"; value: string }
  | { kind: "checked"; checked: boolean }
  | { kind: "multi"; values: string[] }
  | { kind: "choice"; value: string };

type SavedDraft = {
  savedAt: number;
  fields: Record<string, SavedField>;
};

const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const WRITE_DELAY_MS = 100;
const CONTROL_SELECTOR = "input,textarea,select";
const BLOCKED_TYPES = new Set(["file", "password", "hidden", "submit", "button", "reset"]);
const SENSITIVE_NAME = /(password|passcode|secret|token|card|cvc|cvv|stripe|payment)/i;

function cleanLabel(value: string | null | undefined) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function eligible(element: Element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLTextAreaElement) &&
    !(element instanceof HTMLSelectElement)
  ) {
    return false;
  }

  if (element.closest("[data-no-draft]") || element.closest("[data-standard-time-ui]")) {
    return false;
  }

  if (element instanceof HTMLInputElement) {
    if (BLOCKED_TYPES.has(element.type)) return false;
    if (SENSITIVE_NAME.test(element.name || element.id || "")) return false;
    if (/password/i.test(element.autocomplete || "")) return false;
  }

  return true;
}

function fieldKey(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const type = element instanceof HTMLInputElement ? element.type : element.tagName.toLowerCase();

  if (element.name) {
    const choice = element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)
      ? `:${element.value || "choice"}`
      : "";
    return `name:${element.name}:${type}${choice}`;
  }

  if (element.id) return `id:${element.id}:${type}`;

  const label = element.closest("label");
  const explicit = label?.querySelector(":scope > span")?.textContent;
  const labelText = cleanLabel(explicit || label?.textContent);
  if (labelText) return `label:${labelText}:${type}`;

  const controls = Array.from(document.querySelectorAll(CONTROL_SELECTOR)).filter(eligible);
  return `index:${controls.indexOf(element)}:${type}`;
}

function readField(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): SavedField {
  if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
    return { kind: "checked", checked: element.checked };
  }

  if (element instanceof HTMLSelectElement && element.multiple) {
    return {
      kind: "multi",
      values: Array.from(element.selectedOptions).map((option) => option.value),
    };
  }

  return { kind: "value", value: element.value };
}

function setNativeValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLSelectElement.prototype;

  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
}

function restoreField(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  saved: SavedField,
) {
  if (saved.kind === "checked" && element instanceof HTMLInputElement) {
    if (element.checked !== saved.checked) element.click();
    return;
  }

  if (saved.kind === "multi" && element instanceof HTMLSelectElement && element.multiple) {
    let changed = false;
    for (const option of Array.from(element.options)) {
      const selected = saved.values.includes(option.value);
      if (option.selected !== selected) {
        option.selected = selected;
        changed = true;
      }
    }
    if (changed) element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (saved.kind !== "value" || element.value === saved.value) return;

  setNativeValue(element, saved.value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

export function HostDraftPersistence() {
  const pathname = usePathname();

  useEffect(() => {
    let disposed = false;
    let writeTimer: number | null = null;
    let restoreTimer: number | null = null;
    let observer: MutationObserver | null = null;
    const supabase = createClient();

    async function start() {
      const { data } = await supabase.auth.getUser();
      if (disposed || !data.user?.id) return;

      const storageKey = `find-a-place:host-form-draft:${data.user.id}:${pathname}`;
      let draft: SavedDraft = { savedAt: Date.now(), fields: {} };

      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as SavedDraft;
          if (
            parsed &&
            typeof parsed.savedAt === "number" &&
            parsed.fields &&
            Date.now() - parsed.savedAt <= MAX_DRAFT_AGE_MS
          ) {
            draft = parsed;
          } else {
            window.localStorage.removeItem(storageKey);
          }
        }
      } catch {
        // Keep host forms usable even if browser storage is unavailable.
      }

      const persistNow = () => {
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(draft));
        } catch {
          // Storage can be unavailable or full; the form itself should keep working.
        }
      };

      const queueWrite = () => {
        if (writeTimer !== null) window.clearTimeout(writeTimer);
        writeTimer = window.setTimeout(() => {
          writeTimer = null;
          persistNow();
        }, WRITE_DELAY_MS);
      };

      const capture = (target: EventTarget | null) => {
        if (!(target instanceof Element) || !eligible(target)) return;
        draft.fields[fieldKey(target)] = readField(target);
        draft.savedAt = Date.now();
        queueWrite();
      };

      const restoreVisibleFields = () => {
        document.querySelectorAll(CONTROL_SELECTOR).forEach((element) => {
          if (!eligible(element)) return;
          const saved = draft.fields[fieldKey(element)];
          if (saved) restoreField(element, saved);
        });
      };

      const choiceKey = (button: HTMLButtonElement) => {
        const group = button.closest(".calendar-preference-grid");
        if (!group) return null;
        return `choice:calendar-preference:${pathname}`;
      };

      const captureChoice = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest("button");
        if (!(button instanceof HTMLButtonElement)) return;
        const key = choiceKey(button);
        if (!key) return;

        const group = button.closest(".calendar-preference-grid");
        const buttons = group ? Array.from(group.querySelectorAll<HTMLButtonElement>("button")) : [];
        const index = buttons.indexOf(button);
        if (index < 0) return;

        draft.fields[key] = { kind: "choice", value: String(index) };
        draft.savedAt = Date.now();
        queueWrite();
      };

      const restoreChoices = () => {
        document.querySelectorAll<HTMLElement>(".calendar-preference-grid").forEach((group) => {
          const key = `choice:calendar-preference:${pathname}`;
          const saved = draft.fields[key];
          if (!saved || saved.kind !== "choice") return;
          const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button"));
          const button = buttons[Number(saved.value)];
          if (button && !button.classList.contains("selected")) button.click();
        });
      };

      const restoreAll = () => {
        restoreVisibleFields();
        restoreChoices();
      };

      const onInput = (event: Event) => capture(event.target);
      const onChange = (event: Event) => capture(event.target);
      const onVisibilityChange = () => {
        if (document.visibilityState === "hidden") persistNow();
      };

      document.addEventListener("input", onInput, true);
      document.addEventListener("change", onChange, true);
      document.addEventListener("click", captureChoice, true);
      document.addEventListener("visibilitychange", onVisibilityChange);

      // First restore after hydration, then again as conditional fields appear.
      restoreAll();
      window.setTimeout(restoreAll, 300);
      window.setTimeout(restoreAll, 900);

      observer = new MutationObserver(() => {
        if (restoreTimer !== null) window.clearTimeout(restoreTimer);
        restoreTimer = window.setTimeout(() => {
          restoreTimer = null;
          restoreAll();
        }, 60);
      });
      observer.observe(document.body, { childList: true, subtree: true });

      const cleanup = () => {
        document.removeEventListener("input", onInput, true);
        document.removeEventListener("change", onChange, true);
        document.removeEventListener("click", captureChoice, true);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        observer?.disconnect();
        if (writeTimer !== null) {
          window.clearTimeout(writeTimer);
          persistNow();
        }
        if (restoreTimer !== null) window.clearTimeout(restoreTimer);
      };

      window.addEventListener("pagehide", persistNow);
      return () => {
        window.removeEventListener("pagehide", persistNow);
        cleanup();
      };
    }

    let cleanup: (() => void) | undefined;
    void start().then((result) => {
      cleanup = result;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [pathname]);

  return null;
}
