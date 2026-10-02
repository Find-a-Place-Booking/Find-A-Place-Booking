"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type JourneyState = {
  attemptId: string;
  unitId: string | null;
  reservationId: string | null;
  slug: string | null;
  startedAt: number;
  completed: boolean;
};

type TrackPayload = {
  attemptId: string;
  eventName: string;
  stage: string;
  unitId?: string | null;
  reservationId?: string | null;
  success?: boolean | null;
  statusCode?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

const STORAGE_KEY = "fap_booking_journey_v1";
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

const SENSITIVE_BODY_KEYS = new Set([
  "guestName",
  "guestEmail",
  "guestPhone",
  "checkoutToken",
  "turnstileToken",
  "code",
  "clientSecret",
]);

function nowState(): JourneyState {
  return {
    attemptId: crypto.randomUUID(),
    unitId: null,
    reservationId: null,
    slug: null,
    startedAt: Date.now(),
    completed: false,
  };
}

function loadState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return nowState();

    const parsed = JSON.parse(raw) as JourneyState;

    if (
      !parsed?.attemptId ||
      !parsed.startedAt ||
      parsed.startedAt < Date.now() - MAX_AGE_MS
    ) {
      return nowState();
    }

    return parsed;
  } catch {
    return nowState();
  }
}

function saveState(state: JourneyState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function safeJsonBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string") return null;

  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function safeMetadataFromBody(
  body: Record<string, unknown> | null,
) {
  if (!body) return {};

  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if (SENSITIVE_BODY_KEYS.has(key)) continue;

    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      output[key] =
        typeof value === "string" ? value.slice(0, 200) : value;
    } else if (Array.isArray(value)) {
      output[key] = value.slice(0, 20);
    }
  }

  return output;
}

function scrubText(value: string) {
  return value
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[email]",
    )
    .replace(/\b\d{7,}\b/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 350);
}

function stageForPath(pathname: string) {
  if (pathname.startsWith("/booking/confirmed")) {
    return "CONFIRMATION";
  }
  if (pathname.startsWith("/checkout")) {
    return "CHECKOUT_DETAILS";
  }
  if (pathname.startsWith("/trip/")) {
    return "COMPLETE";
  }
  if (pathname.startsWith("/stays/")) {
    return "LISTING";
  }
  return "LISTING";
}

function describeBookingRequest(
  pathname: string,
  body: Record<string, unknown> | null,
) {
  if (pathname.endsWith("/availability")) {
    return {
      stage: "AVAILABILITY",
      requested: "availability_requested",
      succeeded: "availability_succeeded",
      failed: "availability_failed",
    };
  }

  if (pathname.endsWith("/estimate")) {
    return {
      stage: "CHECKOUT_DETAILS",
      requested: "estimate_requested",
      succeeded: "estimate_succeeded",
      failed: "estimate_failed",
    };
  }

  if (pathname.endsWith("/hold")) {
    return {
      stage: "HOLD",
      requested: "hold_requested",
      succeeded: "hold_created",
      failed: "hold_failed",
    };
  }

  if (pathname.endsWith("/verification/status")) {
    return {
      stage: "VERIFY",
      requested: "verification_status_requested",
      succeeded: "verification_status_succeeded",
      failed: "verification_status_failed",
    };
  }

  if (pathname.endsWith("/verification/email/send")) {
    return {
      stage: "VERIFY",
      requested: "verification_code_requested",
      succeeded: "verification_code_sent",
      failed: "verification_code_send_failed",
    };
  }

  if (pathname.endsWith("/verification/email/confirm")) {
    return {
      stage: "VERIFY",
      requested: "verification_code_submitted",
      succeeded: "verification_email_verified",
      failed: "verification_code_failed",
    };
  }

  if (pathname.endsWith("/verification/identity/session")) {
    return {
      stage: "VERIFY",
      requested: "identity_verification_requested",
      succeeded: "identity_verification_started",
      failed: "identity_verification_failed",
    };
  }

  if (pathname.endsWith("/policies/status")) {
    return {
      stage: "POLICIES",
      requested: "policy_status_requested",
      succeeded: "policy_status_succeeded",
      failed: "policy_status_failed",
    };
  }

  if (pathname.endsWith("/policies/open")) {
    const kind = body?.kind === "property" ? "property" : "platform";
    return {
      stage: "POLICIES",
      requested: `${kind}_policy_open_requested`,
      succeeded:
        kind === "property"
          ? "property_policy_opened"
          : "platform_terms_opened",
      failed: "policy_open_failed",
    };
  }

  if (pathname.endsWith("/policies/accept")) {
    return {
      stage: "POLICIES",
      requested: "policy_accept_clicked",
      succeeded: "policy_accepted",
      failed: "policy_accept_failed",
    };
  }

  if (pathname.endsWith("/payment-intent")) {
    return {
      stage: "PAYMENT",
      requested: "payment_intent_requested",
      succeeded: "payment_intent_ready",
      failed: "payment_intent_failed",
    };
  }

  if (pathname.endsWith("/status")) {
    return {
      stage: "CONFIRMATION",
      requested: "booking_status_requested",
      succeeded: "booking_status_succeeded",
      failed: "booking_status_failed",
    };
  }

  if (pathname.endsWith("/security-event")) {
    return {
      stage: "HOLD",
      requested: "security_event_requested",
      succeeded: "security_event_recorded",
      failed: "security_event_failed",
    };
  }

  return null;
}

function extractResponseInfo(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return {
      reservationId: null,
      unitId: null,
      error: null,
      status: null,
      paymentStatus: null,
      ready: null,
    };
  }

  const value = payload as Record<string, unknown>;

  return {
    reservationId:
      typeof value.reservationId === "string"
        ? value.reservationId
        : typeof value.reservation_id === "string"
          ? value.reservation_id
          : null,
    unitId:
      typeof value.unitId === "string"
        ? value.unitId
        : typeof value.unit_id === "string"
          ? value.unit_id
          : null,
    error:
      typeof value.error === "string" ? value.error : null,
    status:
      typeof value.status === "string"
        ? value.status
        : typeof value.reservationStatus === "string"
          ? value.reservationStatus
          : null,
    paymentStatus:
      typeof value.paymentStatus === "string"
        ? value.paymentStatus
        : null,
    ready:
      typeof value.ready === "boolean" ? value.ready : null,
  };
}

export function BookingJourneyTracker() {
  const pathname = usePathname();
  const stateRef = useRef<JourneyState | null>(null);
  const originalFetchRef = useRef<typeof window.fetch | null>(null);
  const pageStartedAtRef = useRef(Date.now());
  const seenFieldsRef = useRef(new Set<string>());
  const seenErrorsRef = useRef(new Set<string>());
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    originalFetchRef.current = originalFetch;

    if (!stateRef.current) {
      stateRef.current = loadState();
      saveState(stateRef.current);
    }

    function ensureState(options?: {
      slug?: string | null;
      unitId?: string | null;
      reservationId?: string | null;
    }) {
      let state = stateRef.current || loadState();
      const slug = options?.slug || null;

      const shouldRotate =
        state.completed ||
        state.startedAt < Date.now() - MAX_AGE_MS ||
        Boolean(
          slug &&
            state.slug &&
            slug !== state.slug &&
            !state.reservationId,
        );

      if (shouldRotate) {
        state = nowState();
      }

      if (slug) state.slug = slug;
      if (options?.unitId) state.unitId = options.unitId;
      if (options?.reservationId) {
        state.reservationId = options.reservationId;
      }

      stateRef.current = state;
      saveState(state);
      return state;
    }

    function sendTrack(
      input: Omit<TrackPayload, "attemptId"> & {
        attemptId?: string;
      },
      beacon = false,
    ) {
      const state = ensureState({
        unitId: input.unitId || null,
        reservationId: input.reservationId || null,
      });

      const payload: TrackPayload = {
        attemptId: input.attemptId || state.attemptId,
        eventName: input.eventName,
        stage: input.stage,
        unitId: input.unitId || state.unitId,
        reservationId:
          input.reservationId || state.reservationId,
        success:
          typeof input.success === "boolean"
            ? input.success
            : null,
        statusCode: input.statusCode || null,
        errorCode: input.errorCode || null,
        errorMessage: input.errorMessage || null,
        metadata: input.metadata || {},
      };

      const body = JSON.stringify(payload);

      try {
        if (beacon && navigator.sendBeacon) {
          navigator.sendBeacon(
            "/api/booking/track",
            new Blob([body], { type: "application/json" }),
          );
          return;
        }

        void originalFetch("/api/booking/track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-fap-page-path": window.location.pathname,
          },
          body,
          keepalive: true,
          cache: "no-store",
        }).catch(() => undefined);
      } catch {}
    }

    window.fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      let url: URL;

      try {
        url = new URL(rawUrl, window.location.href);
      } catch {
        return originalFetch(input, init);
      }

      if (
        url.origin !== window.location.origin ||
        !url.pathname.startsWith("/api/booking/") ||
        url.pathname === "/api/booking/track"
      ) {
        return originalFetch(input, init);
      }

      const body = safeJsonBody(init?.body);
      const descriptor = describeBookingRequest(
        url.pathname,
        body,
      );

      if (!descriptor) {
        return originalFetch(input, init);
      }

      const state = ensureState({
        unitId:
          typeof body?.unitId === "string"
            ? body.unitId
            : url.searchParams.get("unitId"),
        reservationId:
          typeof body?.reservationId === "string"
            ? body.reservationId
            : url.searchParams.get("reservationId"),
      });

      const requestMetadata = {
        method: (
          init?.method ||
          (input instanceof Request ? input.method : "GET")
        ).toUpperCase(),
        api_path: url.pathname,
        ...safeMetadataFromBody(body),
      };

      sendTrack({
        attemptId: state.attemptId,
        eventName: descriptor.requested,
        stage: descriptor.stage,
        unitId: state.unitId,
        reservationId: state.reservationId,
        metadata: requestMetadata,
      });

      const started = performance.now();

      try {
        const response = await originalFetch(input, init);
        const cloned = response.clone();
        const payload = await cloned.json().catch(() => null);
        const info = extractResponseInfo(payload);

        if (info.unitId) state.unitId = info.unitId;
        if (info.reservationId) {
          state.reservationId = info.reservationId;
        }

        stateRef.current = state;
        saveState(state);

        const eventName = response.ok
          ? descriptor.succeeded
          : descriptor.failed;

        sendTrack({
          attemptId: state.attemptId,
          eventName,
          stage: descriptor.stage,
          unitId: state.unitId,
          reservationId: state.reservationId,
          success: response.ok,
          statusCode: response.status,
          errorMessage:
            !response.ok && info.error
              ? scrubText(info.error)
              : null,
          metadata: {
            api_path: url.pathname,
            duration_ms: Math.max(
              0,
              Math.round(performance.now() - started),
            ),
            reservation_status: info.status,
            payment_status: info.paymentStatus,
            ready: info.ready,
          },
        });

        if (
          url.pathname.endsWith("/verification/status") &&
          response.ok &&
          info.ready === true
        ) {
          sendTrack({
            attemptId: state.attemptId,
            eventName: "verification_succeeded",
            stage: "VERIFY",
            unitId: state.unitId,
            reservationId: state.reservationId,
            success: true,
          });
        }

        if (
          url.pathname.endsWith("/status") &&
          response.ok &&
          info.status === "CONFIRMED"
        ) {
          state.completed = true;
          stateRef.current = state;
          saveState(state);

          sendTrack({
            attemptId: state.attemptId,
            eventName: "booking_confirmed",
            stage: "COMPLETE",
            unitId: state.unitId,
            reservationId: state.reservationId,
            success: true,
            metadata: {
              payment_status: info.paymentStatus,
              source: "booking_status_response",
            },
          });
        }

        return response;
      } catch (error) {
        sendTrack({
          attemptId: state.attemptId,
          eventName: descriptor.failed,
          stage: descriptor.stage,
          unitId: state.unitId,
          reservationId: state.reservationId,
          success: false,
          errorCode: "network_error",
          errorMessage:
            error instanceof Error
              ? scrubText(error.message)
              : "Network request failed.",
          metadata: {
            api_path: url.pathname,
            duration_ms: Math.max(
              0,
              Math.round(performance.now() - started),
            ),
          },
        });

        throw error;
      }
    };

    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const control = target?.closest(
        "button, a",
      ) as HTMLElement | null;

      if (!control) return;

      const inBookingUi =
        Boolean(control.closest(".booking-card")) ||
        Boolean(control.closest(".checkout-page")) ||
        Boolean(control.closest(".confirm-page"));

      if (!inBookingUi) return;

      const label = scrubText(
        control.getAttribute("aria-label") ||
          control.textContent ||
          "control",
      );

      if (!label) return;

      const stage = stageForPath(window.location.pathname);
      const state = ensureState();

      sendTrack({
        attemptId: state.attemptId,
        eventName: "booking_ui_clicked",
        stage,
        unitId: state.unitId,
        reservationId: state.reservationId,
        metadata: {
          label,
          element: control.tagName.toLowerCase(),
          elapsed_ms: Date.now() - pageStartedAtRef.current,
        },
      });

      if (/continue to checkout/i.test(label)) {
        sendTrack({
          attemptId: state.attemptId,
          eventName: "checkout_clicked",
          stage: "LISTING",
          unitId: state.unitId,
          reservationId: state.reservationId,
          metadata: {
            elapsed_ms:
              Date.now() - pageStartedAtRef.current,
          },
        });
      }

      if (/continue to secure checkout/i.test(label)) {
        sendTrack({
          attemptId: state.attemptId,
          eventName: "hold_submit_clicked",
          stage: "HOLD",
          unitId: state.unitId,
          reservationId: state.reservationId,
        });
      }

      if (/pay securely/i.test(label)) {
        sendTrack({
          attemptId: state.attemptId,
          eventName: "payment_submit_clicked",
          stage: "PAYMENT",
          unitId: state.unitId,
          reservationId: state.reservationId,
        });
      }

      const calendarLabel = control.getAttribute("aria-label") || "";
      const dateMatch = calendarLabel.match(
        /^(\d{4}-\d{2}-\d{2}):\s*(.+)$/i,
      );

      if (dateMatch) {
        sendTrack({
          attemptId: state.attemptId,
          eventName: "calendar_date_clicked",
          stage: "AVAILABILITY",
          unitId: state.unitId,
          reservationId: state.reservationId,
          metadata: {
            date: dateMatch[1],
            state: scrubText(dateMatch[2]),
          },
        });
      }
    }

    function onFieldInteraction(event: Event) {
      if (!window.location.pathname.startsWith("/checkout")) {
        return;
      }

      const target = event.target as
        | HTMLInputElement
        | HTMLSelectElement
        | null;

      if (!target) return;

      const label =
        target.closest("label")?.querySelector("span")
          ?.textContent ||
        target.getAttribute("aria-label") ||
        target.getAttribute("name") ||
        target.getAttribute("autocomplete") ||
        target.tagName.toLowerCase();

      const field = scrubText(label);

      if (!field) return;

      const key = `${target.tagName}:${target.getAttribute("type") || ""}:${field}`;

      if (seenFieldsRef.current.has(key)) return;

      seenFieldsRef.current.add(key);
      const state = ensureState();

      sendTrack({
        attemptId: state.attemptId,
        eventName:
          seenFieldsRef.current.size === 1
            ? "checkout_form_started"
            : "checkout_field_interacted",
        stage: "CHECKOUT_DETAILS",
        unitId: state.unitId,
        reservationId: state.reservationId,
        metadata: {
          field,
          control: target.tagName.toLowerCase(),
          input_type:
            target instanceof HTMLInputElement
              ? target.type
              : "select",
          elapsed_ms:
            Date.now() - pageStartedAtRef.current,
        },
      });
    }

    function onPageHide() {
      const state = stateRef.current;

      if (!state) return;

      sendTrack(
        {
          attemptId: state.attemptId,
          eventName: "booking_page_exit",
          stage: stageForPath(window.location.pathname),
          unitId: state.unitId,
          reservationId: state.reservationId,
          metadata: {
            path: window.location.pathname,
            elapsed_ms:
              Date.now() - pageStartedAtRef.current,
            completed: state.completed,
          },
        },
        true,
      );
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onFieldInteraction, true);
    document.addEventListener("change", onFieldInteraction, true);
    window.addEventListener("pagehide", onPageHide);

    const observer = new MutationObserver((mutations) => {
      if (
        !window.location.pathname.startsWith("/checkout") &&
        !window.location.pathname.startsWith("/booking/")
      ) {
        return;
      }

      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;

          const candidates = [
            ...(node.matches(
              '[class*="error"], [role="alert"]',
            )
              ? [node]
              : []),
            ...Array.from(
              node.querySelectorAll(
                '[class*="error"], [role="alert"]',
              ),
            ),
          ];

          for (const candidate of candidates) {
            const message = scrubText(
              candidate.textContent || "",
            );

            if (
              !message ||
              seenErrorsRef.current.has(message)
            ) {
              continue;
            }

            seenErrorsRef.current.add(message);
            const state = ensureState();

            sendTrack({
              attemptId: state.attemptId,
              eventName: "booking_ui_error",
              stage: stageForPath(
                window.location.pathname,
              ),
              unitId: state.unitId,
              reservationId: state.reservationId,
              success: false,
              errorMessage: message,
              metadata: {
                path: window.location.pathname,
              },
            });
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      window.fetch = originalFetch;
      document.removeEventListener("click", onClick, true);
      document.removeEventListener(
        "input",
        onFieldInteraction,
        true,
      );
      document.removeEventListener(
        "change",
        onFieldInteraction,
        true,
      );
      window.removeEventListener("pagehide", onPageHide);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const originalFetch = originalFetchRef.current;
    if (!pathname || !originalFetch) return;

    pageStartedAtRef.current = Date.now();
    seenFieldsRef.current.clear();
    seenErrorsRef.current.clear();

    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;

    let state = stateRef.current || loadState();
    const params = new URLSearchParams(window.location.search);

    if (pathname.startsWith("/stays/")) {
      const slug = pathname.split("/").filter(Boolean)[1] || null;

      if (
        state.completed ||
        state.startedAt < Date.now() - MAX_AGE_MS ||
        Boolean(
          slug &&
            state.slug &&
            slug !== state.slug &&
            !state.reservationId,
        )
      ) {
        state = nowState();
      }

      state.slug = slug;
      stateRef.current = state;
      saveState(state);

      void originalFetch("/api/booking/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fap-page-path": pathname,
        },
        body: JSON.stringify({
          attemptId: state.attemptId,
          eventName: "stay_page_viewed",
          stage: "LISTING",
          unitId: state.unitId,
          reservationId: state.reservationId,
          metadata: { slug },
        }),
        keepalive: true,
        cache: "no-store",
      }).catch(() => undefined);

      return;
    }

    if (pathname.startsWith("/checkout")) {
      state.slug = params.get("stay") || state.slug;
      stateRef.current = state;
      saveState(state);

      void originalFetch("/api/booking/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fap-page-path": pathname,
        },
        body: JSON.stringify({
          attemptId: state.attemptId,
          eventName: "checkout_page_viewed",
          stage: "CHECKOUT_DETAILS",
          unitId: state.unitId,
          reservationId:
            params.get("reservationId") ||
            state.reservationId,
          metadata: {
            stay: params.get("stay"),
            check_in: params.get("checkIn"),
            check_out: params.get("checkOut"),
            guests: params.get("guests"),
            resumed: Boolean(params.get("reservationId")),
          },
        }),
        keepalive: true,
        cache: "no-store",
      }).catch(() => undefined);

      return;
    }

    if (pathname.startsWith("/booking/confirmed")) {
      const reservationId =
        params.get("reservationId") || state.reservationId;

      if (reservationId) state.reservationId = reservationId;
      stateRef.current = state;
      saveState(state);

      void originalFetch("/api/booking/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-fap-page-path": pathname,
        },
        body: JSON.stringify({
          attemptId: state.attemptId,
          eventName: "confirmation_page_viewed",
          stage: "CONFIRMATION",
          unitId: state.unitId,
          reservationId: state.reservationId,
          metadata: {},
        }),
        keepalive: true,
        cache: "no-store",
      }).catch(() => undefined);
    }
  }, [pathname]);

  return null;
}
