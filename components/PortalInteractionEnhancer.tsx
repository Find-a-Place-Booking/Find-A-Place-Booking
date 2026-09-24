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
