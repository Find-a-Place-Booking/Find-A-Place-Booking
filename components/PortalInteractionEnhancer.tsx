"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type RestorePayload = {
  path: string;
  y: number;
  openDetails: number[];
  savedAt: number;
};

type ToastState = {
  tone: "success" | "error";
  text: string;
} | null;

const MAX_RESTORE_AGE_MS = 20_000;

function restoreKey(scope: string) {
  return `fap:portal-restore:${scope}`;
}

function rootFor(scope: string) {
  return document.querySelector<HTMLElement>(
    `[data-portal-shell="${scope}"]`,
  );
}

function remember(scope: string) {
  const root = rootFor(scope);
  if (!root) return;

  const details = Array.from(root.querySelectorAll("details"));
  const payload: RestorePayload = {
    path: window.location.pathname,
    y: window.scrollY,
    openDetails: details
      .map((detail, index) => (detail.open ? index : -1))
      .filter((index) => index >= 0),
    savedAt: Date.now(),
  };

  try {
    sessionStorage.setItem(restoreKey(scope), JSON.stringify(payload));
  } catch {
    // Scroll restoration is a convenience only.
  }
}

function readRestore(scope: string): RestorePayload | null {
  try {
    const raw = sessionStorage.getItem(restoreKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RestorePayload;
    sessionStorage.removeItem(restoreKey(scope));

    if (
      parsed.path !== window.location.pathname ||
      Date.now() - parsed.savedAt > MAX_RESTORE_AGE_MS
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function normalizedPhone(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (trimmed.startsWith("+") && digits.length >= 7) {
    return `+${digits}`;
  }

  return digits;
}

function contactProtocol(anchor: HTMLAnchorElement) {
  const rawHref = anchor.getAttribute("href")?.trim() || "";
  const colon = rawHref.indexOf(":");
  if (colon <= 0) return null;

  const scheme = rawHref.slice(0, colon).toLowerCase();
  if (!["mailto", "tel", "sms"].includes(scheme)) return null;

  const rawValue = rawHref.slice(colon + 1).trim();

  if (scheme === "mailto") {
    const [address, suffix = ""] = rawValue.split("?", 2);
    const cleanAddress = address.trim();
    if (!cleanAddress) return null;

    return {
      scheme,
      href: `mailto:${cleanAddress}${suffix ? `?${suffix}` : ""}`,
      fallbackValue: cleanAddress,
      fallbackLabel: "Email address copied",
    };
  }

  const phone = normalizedPhone(rawValue.split("?", 1)[0]);
  if (!phone) return null;

  return {
    scheme,
    href: `${scheme}:${phone}`,
    fallbackValue: phone,
    fallbackLabel: "Guest phone number copied",
  };
}

async function copyFallback(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function PortalInteractionEnhancer({
  scope,
}: {
  scope: "host" | "admin";
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navigationKey = useMemo(
    () => `${pathname}?${searchParams.toString()}`,
    [pathname, searchParams],
  );
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    const root = rootFor(scope);
    if (!root) return;

    const payload = readRestore(scope);

    if (payload) {
      const reopenAndRestore = () => {
        const details = Array.from(root.querySelectorAll("details"));
        for (const index of payload.openDetails) {
          const detail = details[index];
          if (detail) detail.open = true;
        }

        window.scrollTo({
          top: Math.max(0, payload.y),
          behavior: "auto",
        });
      };

      requestAnimationFrame(() => {
        requestAnimationFrame(reopenAndRestore);
      });
      window.setTimeout(reopenAndRestore, 120);
    }

    const message = root.querySelector<HTMLElement>(
      ".admin-message.success, .admin-message.error",
    );

    if (message?.textContent?.trim()) {
      setToast({
        tone: message.classList.contains("error") ? "error" : "success",
        text: message.textContent.trim(),
      });
      const timer = window.setTimeout(() => setToast(null), 4200);
      return () => window.clearTimeout(timer);
    }

    return;
  }, [navigationKey, scope]);

  useEffect(() => {
    const root = rootFor(scope);
    if (!root) return;

    const onSubmit = (event: Event) => {
      const submitEvent = event as SubmitEvent;
      const form = event.target as HTMLFormElement | null;
      if (!form || !root.contains(form)) return;

      if (form.dataset.portalSubmitting === "true") {
        event.preventDefault();
        return;
      }

      remember(scope);
      form.dataset.portalSubmitting = "true";
      form.setAttribute("aria-busy", "true");

      const submitter = submitEvent.submitter as HTMLElement | null;
      if (submitter) {
        submitter.dataset.portalPending = "true";
        submitter.setAttribute("aria-busy", "true");
      }

      window.setTimeout(() => {
        delete form.dataset.portalSubmitting;
        form.removeAttribute("aria-busy");
        if (submitter) {
          delete submitter.dataset.portalPending;
          submitter.removeAttribute("aria-busy");
        }
      }, 8_000);
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !root.contains(anchor)) return;

      const contact = contactProtocol(anchor);

      if (contact) {
        /*
         * Do not hand tel:/sms:/mailto: through Next/router behavior or leave
         * raw formatted phone strings up to an embedded browser. This runs
         * directly from the user's click, which is required by iOS/Android for
         * external protocol handlers.
         */
        event.preventDefault();
        event.stopPropagation();

        const fallbackTimer = window.setTimeout(async () => {
          if (document.hidden) return;

          const copied = await copyFallback(contact.fallbackValue);
          if (copied) {
            setToast({
              tone: "success",
              text: `${contact.fallbackLabel}. If no app opened, paste it into your phone or email app.`,
            });
            window.setTimeout(() => setToast(null), 4200);
          }
        }, 900);

        const clearFallback = () => {
          if (document.hidden) {
            window.clearTimeout(fallbackTimer);
            document.removeEventListener(
              "visibilitychange",
              clearFallback,
            );
          }
        };

        document.addEventListener(
          "visibilitychange",
          clearFallback,
        );

        window.location.assign(contact.href);
        return;
      }

      try {
        const url = new URL(anchor.href, window.location.href);
        const samePageQueryNavigation =
          url.origin === window.location.origin &&
          url.pathname === window.location.pathname &&
          url.search !== window.location.search &&
          !url.hash;

        if (samePageQueryNavigation) {
          remember(scope);
        }
      } catch {
        // Ignore malformed hrefs.
      }
    };

    root.addEventListener("submit", onSubmit, true);
    root.addEventListener("click", onClick, true);

    return () => {
      root.removeEventListener("submit", onSubmit, true);
      root.removeEventListener("click", onClick, true);
    };
  }, [scope]);

  return toast ? (
    <div
      className={`portal-action-toast ${toast.tone}`}
      role={toast.tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <span aria-hidden="true">{toast.tone === "error" ? "!" : "✓"}</span>
      <strong>{toast.text}</strong>
    </div>
  ) : null;
}
