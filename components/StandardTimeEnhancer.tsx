"use client";

import { useEffect } from "react";

const FIVE_MINUTE_TIMES = Array.from({ length: 24 * 12 }, (_, index) => {
  const minutes = index * 5;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

function normalizeTime(value: string | null | undefined) {
  const raw = String(value || "").trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatTime(value: string | null | undefined) {
  const normalized = normalizeTime(value);
  if (!normalized) return String(value || "");

  const [hourText, minute] = normalized.split(":");
  const hour = Number(hourText);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
}

function replaceVisible24HourTimes(value: string) {
  return value.replace(
    /(^|[^\dT])([01]?\d|2[0-3]):([0-5]\d)(?!:\d{2})(?!\s*(?:AM|PM)\b)/gi,
    (_match, prefix: string, hourText: string, minute: string) => {
      const hour = Number(hourText);
      const period = hour >= 12 ? "PM" : "AM";
      const displayHour = hour % 12 || 12;
      return `${prefix}${displayHour}:${minute} ${period}`;
    },
  );
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
}

function timeOptions(current: string) {
  if (!current || FIVE_MINUTE_TIMES.includes(current)) {
    return FIVE_MINUTE_TIMES;
  }

  return [...FIVE_MINUTE_TIMES, current].sort((a, b) => {
    const [ah, am] = a.split(":").map(Number);
    const [bh, bm] = b.split(":").map(Number);
    return ah * 60 + am - (bh * 60 + bm);
  });
}

function enhanceTimeInput(input: HTMLInputElement) {
  if (input.dataset.standardTimeEnhanced === "true") return;

  input.dataset.standardTimeEnhanced = "true";
  const current = normalizeTime(input.value);
  const select = document.createElement("select");
  select.dataset.standardTimeUi = "true";
  select.className = input.className;
  select.disabled = input.disabled;
  select.required = input.required;

  const ariaLabel = input.getAttribute("aria-label");
  const ariaDescribedBy = input.getAttribute("aria-describedby");
  const title = input.getAttribute("title");
  if (ariaLabel) select.setAttribute("aria-label", ariaLabel);
  if (ariaDescribedBy) select.setAttribute("aria-describedby", ariaDescribedBy);
  if (title) select.setAttribute("title", title);

  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Select time";
  select.append(blank);

  for (const value of timeOptions(current)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = formatTime(value);
    select.append(option);
  }

  select.value = current;

  if (input.required) input.required = false;
  input.setAttribute("aria-hidden", "true");
  input.tabIndex = -1;
  input.style.position = "absolute";
  input.style.width = "1px";
  input.style.height = "1px";
  input.style.opacity = "0";
  input.style.pointerEvents = "none";
  input.style.margin = "0";
  input.style.padding = "0";
  input.style.border = "0";

  input.insertAdjacentElement("afterend", select);

  const syncFromInput = () => {
    const next = normalizeTime(input.value);
    if (next && !Array.from(select.options).some((option) => option.value === next)) {
      const option = document.createElement("option");
      option.value = next;
      option.textContent = formatTime(next);
      select.append(option);
    }
    if (select.value !== next) select.value = next;
    select.disabled = input.disabled;
  };

  select.addEventListener("change", () => {
    setNativeInputValue(input, select.value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  input.addEventListener("input", syncFromInput);
  input.addEventListener("change", syncFromInput);
}

function shouldSkipTextNode(node: Text) {
  const parent = node.parentElement;
  if (!parent) return true;

  return Boolean(
    parent.closest(
      "script,style,textarea,code,pre,[data-standard-time-ui]",
    ),
  );
}

function enhanceTree(root: ParentNode) {
  root.querySelectorAll?.('input[type="time"]').forEach((element) => {
    enhanceTimeInput(element as HTMLInputElement);
  });

  root.querySelectorAll?.<HTMLElement>("[placeholder],[title]").forEach((element) => {
    if (element.closest("[data-standard-time-ui]")) return;
    for (const attribute of ["placeholder", "title"] as const) {
      const before = element.getAttribute(attribute);
      if (!before) continue;
      const after = replaceVisible24HourTimes(before);
      if (before !== after) element.setAttribute(attribute, after);
    }
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const node of nodes) {
    if (shouldSkipTextNode(node)) continue;
    const before = node.nodeValue || "";
    const after = replaceVisible24HourTimes(before);
    if (before !== after) node.nodeValue = after;
  }
}

export function StandardTimeEnhancer() {
  useEffect(() => {
    enhanceTree(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" && mutation.target.nodeType === Node.TEXT_NODE) {
          const text = mutation.target as Text;
          if (!shouldSkipTextNode(text)) {
            const before = text.nodeValue || "";
            const after = replaceVisible24HourTimes(before);
            if (before !== after) text.nodeValue = after;
          }
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            if (element.matches('input[type="time"]')) {
              enhanceTimeInput(element as HTMLInputElement);
            }
            enhanceTree(element);
          } else if (node.nodeType === Node.TEXT_NODE) {
            const text = node as Text;
            if (!shouldSkipTextNode(text)) {
              const before = text.nodeValue || "";
              const after = replaceVisible24HourTimes(before);
              if (before !== after) text.nodeValue = after;
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const syncTimer = window.setInterval(() => {
      document.querySelectorAll<HTMLInputElement>('input[type="time"]').forEach((input) => {
        if (input.dataset.standardTimeEnhanced !== "true") {
          enhanceTimeInput(input);
          return;
        }

        const select = input.nextElementSibling;
        if (!(select instanceof HTMLSelectElement) || select.dataset.standardTimeUi !== "true") {
          input.dataset.standardTimeEnhanced = "false";
          enhanceTimeInput(input);
          return;
        }

        const value = normalizeTime(input.value);
        if (select.value !== value) select.value = value;
        select.disabled = input.disabled;
      });
    }, 750);

    return () => {
      observer.disconnect();
      window.clearInterval(syncTimer);
    };
  }, []);

  return null;
}
