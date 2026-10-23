"use client";

import { useEffect } from "react";

/** Progressive chat polish. Sending still uses the existing secured server action. */
export function HostInboxEnhancer() {
  useEffect(() => {
    const attached = new Map<HTMLFormElement, () => void>();
    let currentThread: HTMLElement | null = null;
    let previousContentHeight = 0;
    let nearBottom = true;

    function prepare() {
      const form = document.querySelector<HTMLFormElement>(
        'main.dash-main form:has(input[name="reservation_id"]):has(textarea[name="body"])',
      );
      const thread = document.querySelector<HTMLElement>(
        'main.dash-main [class*="ReservationChat"][class*="thread"]',
      );

      if (thread && currentThread !== thread) {
        currentThread = thread;
        previousContentHeight = thread.scrollHeight;
        nearBottom = true;
        thread.scrollTop = thread.scrollHeight;
      }

      if (!form || attached.has(form)) return;
      const textarea = form.querySelector<HTMLTextAreaElement>('textarea[name="body"]');
      const send = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!textarea || !send) return;

      textarea.setAttribute("aria-label", "Message to guest");
      textarea.setAttribute("maxlength", "8000");
      textarea.setAttribute("rows", "2");
      const sizeInput = () => {
        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 52), 150)}px`;
      };
      const keyboard = (event: KeyboardEvent) => {
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          if (textarea.value.trim() && !send.disabled) form.requestSubmit(send);
        }
      };
      const submit = () => {
        // Let React/Next process the server action before disabling the button.
        window.requestAnimationFrame(() => {
          if (!form.isConnected) return;
          send.disabled = true;
          send.textContent = "Sending…";
          send.setAttribute("aria-busy", "true");
        });
      };
      textarea.addEventListener("input", sizeInput);
      textarea.addEventListener("keydown", keyboard);
      form.addEventListener("submit", submit);
      sizeInput();
      attached.set(form, () => {
        textarea.removeEventListener("input", sizeInput);
        textarea.removeEventListener("keydown", keyboard);
        form.removeEventListener("submit", submit);
      });
    }

    function onScroll(event: Event) {
      if (!currentThread || event.target !== currentThread) return;
      nearBottom = currentThread.scrollHeight - currentThread.scrollTop - currentThread.clientHeight < 160;
    }

    prepare();
    const root = document.querySelector("main.dash-main");
    const observer = new MutationObserver(() => {
      const oldThread = currentThread;
      prepare();
      for (const [form, cleanup] of attached) {
        if (!form.isConnected) {
          cleanup();
          attached.delete(form);
        }
      }
      if (currentThread && oldThread === currentThread && currentThread.scrollHeight !== previousContentHeight) {
        if (nearBottom) currentThread.scrollTop = currentThread.scrollHeight;
        previousContentHeight = currentThread.scrollHeight;
      }
    });
    if (root) observer.observe(root, { childList: true, subtree: true });
    // Delegated scroll capture works for an existing thread and after navigation.
    root?.addEventListener("scroll", onScroll, true);
    return () => {
      observer.disconnect();
      root?.removeEventListener("scroll", onScroll, true);
      for (const cleanup of attached.values()) cleanup();
      attached.clear();
    };
  }, []);

  return null;
}
