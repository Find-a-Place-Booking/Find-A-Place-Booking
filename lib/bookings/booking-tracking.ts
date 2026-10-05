import { stripeEnvironment } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SENSITIVE_KEY =
  /(email|phone|name|token|secret|password|code|address|card|client.?secret)/i;

function safeText(value: unknown, max = 1000) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function safeUuid(value: unknown) {
  const text = safeText(value, 64);
  return text && UUID_RE.test(text) ? text : null;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 2) return null;

  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value;
  }

  if (typeof value === "string") {
    return value.slice(0, 500);
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (SENSITIVE_KEY.test(key)) continue;

      output[key.slice(0, 80)] = sanitizeValue(item, depth + 1);

      if (Object.keys(output).length >= 30) break;
    }

    return output;
  }

  return null;
}

function scrubError(value: unknown) {
  const text = safeText(value, 1000);
  if (!text) return null;

  return text
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[email]",
    )
    .replace(/\b\d{7,}\b/g, "[number]")
    .slice(0, 1000);
}

export function validBookingAttemptId(value: unknown): value is string {
  return Boolean(safeUuid(value));
}

export async function recordBookingAttemptEvent(input: {
  attemptId?: string | null;
  eventName: string;
  stage: string;
  unitId?: string | null;
  reservationId?: string | null;
  success?: boolean | null;
  statusCode?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
  path?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  paymentEnvironment?: "TEST" | "LIVE" | null;
}) {
  const attemptId = safeUuid(input.attemptId);

  if (!attemptId) return false;

  try {
    const admin = createAdminClient();
    let unitId = safeUuid(input.unitId);
    const reservationId = safeUuid(input.reservationId);
    const now = new Date().toISOString();

    const eventName = (
      safeText(input.eventName, 100) || "unknown_event"
    )
      .replace(/[^a-zA-Z0-9_.:-]/g, "_")
      .toLowerCase();

    const stage = (safeText(input.stage, 60) || "UNKNOWN")
      .replace(/[^a-zA-Z0-9_.:-]/g, "_")
      .toUpperCase();

    if (reservationId && !unitId) {
      const { data: reservation } = await admin
        .from("reservations")
        .select("unit_id")
        .eq("id", reservationId)
        .maybeSingle();

      unitId = safeUuid(reservation?.unit_id);
    }

    const environment =
      input.paymentEnvironment || stripeEnvironment();

    const { data: existing } = await admin
      .from("booking_attempts")
      .select(
        "id,unit_id,reservation_id,outcome,landing_path,referrer,user_agent",
      )
      .eq("id", attemptId)
      .maybeSingle();

    const confirmed = eventName === "booking_confirmed";
    const expired =
      eventName === "hold_expired" ||
      eventName === "reservation_expired";
    const cancelled = eventName === "reservation_cancelled";

    const updatePayload = {
      current_stage: stage,
      last_event: eventName,
      last_seen_at: now,
      updated_at: now,
      ...(unitId ? { unit_id: unitId } : {}),
      ...(reservationId ? { reservation_id: reservationId } : {}),
      ...(safeText(input.path, 500) && !existing?.landing_path
        ? { landing_path: safeText(input.path, 500) }
        : {}),
      ...(safeText(input.referrer, 1000) && !existing?.referrer
        ? { referrer: safeText(input.referrer, 1000) }
        : {}),
      ...(safeText(input.userAgent, 500) && !existing?.user_agent
        ? { user_agent: safeText(input.userAgent, 500) }
        : {}),
      ...(confirmed
        ? { outcome: "CONFIRMED", completed_at: now }
        : expired && !existing?.outcome
          ? { outcome: "EXPIRED" }
          : cancelled
            ? { outcome: "CANCELLED", completed_at: now }
            : {}),
    };

    if (existing) {
      const { error: updateError } = await admin
        .from("booking_attempts")
        .update(updatePayload)
        .eq("id", attemptId);

      if (updateError) throw updateError;
    } else {
      // Multiple client events can arrive at the same time on the first page
      // load. Use ON CONFLICT DO NOTHING semantics so two requests that both
      // observe "no row yet" cannot throw booking_attempts_pkey violations.
      // The event table still records every event, and subsequent events update
      // the shared attempt summary normally.
      const { error: insertError } = await admin
        .from("booking_attempts")
        .upsert(
          {
            id: attemptId,
            unit_id: unitId,
            reservation_id: reservationId,
            payment_environment: environment,
            current_stage: stage,
            last_event: eventName,
            outcome: confirmed
              ? "CONFIRMED"
              : expired
                ? "EXPIRED"
                : cancelled
                  ? "CANCELLED"
                  : null,
            landing_path: safeText(input.path, 500),
            referrer: safeText(input.referrer, 1000),
            user_agent: safeText(input.userAgent, 500),
            started_at: now,
            last_seen_at: now,
            completed_at: confirmed || cancelled ? now : null,
            updated_at: now,
          },
          {
            onConflict: "id",
            ignoreDuplicates: true,
          },
        );

      if (insertError) throw insertError;
    }

    const { error: eventError } = await admin
      .from("booking_attempt_events")
      .insert({
        attempt_id: attemptId,
        unit_id: unitId,
        reservation_id: reservationId,
        event_name: eventName,
        stage,
        success:
          typeof input.success === "boolean" ? input.success : null,
        status_code:
          Number.isInteger(input.statusCode)
            ? Number(input.statusCode)
            : null,
        error_code: safeText(input.errorCode, 120),
        error_message: scrubError(input.errorMessage),
        path: safeText(input.path, 500),
        metadata: sanitizeValue(
          input.metadata || {},
        ) as Record<string, unknown>,
        created_at: now,
      });

    if (eventError) throw eventError;

    return true;
  } catch (error) {
    console.warn("[booking tracking] event persistence failed", {
      eventName: input.eventName,
      error:
        error instanceof Error
          ? error.message
          : "Unknown tracking error",
    });

    return false;
  }
}
