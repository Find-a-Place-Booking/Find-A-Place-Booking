import type { SupabaseClient } from "@supabase/supabase-js";

import { createGuestCheckoutToken } from "@/lib/payments/booking-runtime";
import {
  escapeHtml,
  sendNotificationOnce,
  siteUrl,
} from "@/lib/notifications/transactional-email";

type Rule = {
  id: string;
  organization_id: string;
  property_id: string | null;
  name: string;
  trigger_event: "BEFORE_CHECKIN" | "AFTER_CHECKOUT";
  day_offset: number;
  send_time_local: string;
  subject_template: string;
  body_template: string;
  require_access_code: boolean;
  default_access_code: string | null;
  default_arrival_notes: string | null;
  created_at: string;
  updated_at: string;
};

type Reservation = {
  id: string;
  confirmation_code: string;
  organization_id: string;
  property_id: string;
  unit_id: string;
  guest_name: string | null;
  guest_email: string | null;
  check_in: string;
  check_out: string;
  status: string;
};

type Property = {
  id: string;
  organization_id: string;
  name: string;
  time_zone: string;
  notification_email: string | null;
  operations_email: string | null;
};

type Organization = {
  id: string;
  name: string;
  public_host_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
};

type Unit = {
  id: string;
  check_in: string | null;
  checkout: string | null;
};

type Instruction = {
  reservation_id: string;
  access_code: string | null;
  arrival_notes: string | null;
};

type TemplateValues = Record<string, string>;

const POST_STAY_CATCHUP_MS = 72 * 60 * 60 * 1000;

function shiftIsoDate(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function localParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return values;
}

function validTimeZone(value: string | null | undefined) {
  const candidate = value?.trim() || "America/Chicago";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "America/Chicago";
  }
}

function zonedLocalToUtcMs(
  localDate: string,
  localTime: string,
  timeZone: string,
) {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  let guess = wantedAsUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const parts = localParts(new Date(guess), timeZone);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const zoneOffsetMs = representedAsUtc - guess;
    const next = wantedAsUtc - zoneOffsetMs;
    if (Math.abs(next - guess) < 1000) return next;
    guess = next;
  }
  return guess;
}

function targetTimeMs(
  rule: Rule,
  reservation: Reservation,
  timeZone: string,
) {
  const baseDate =
    rule.trigger_event === "BEFORE_CHECKIN"
      ? reservation.check_in
      : reservation.check_out;
  const direction = rule.trigger_event === "BEFORE_CHECKIN" ? -1 : 1;
  const targetDate = shiftIsoDate(baseDate, direction * rule.day_offset);
  return zonedLocalToUtcMs(
    targetDate,
    String(rule.send_time_local).slice(0, 5),
    timeZone,
  );
}

function localBoundaryMs(
  reservation: Reservation,
  unit: Unit | undefined,
  timeZone: string,
  kind: "CHECK_IN" | "CHECK_OUT",
) {
  const date =
    kind === "CHECK_IN" ? reservation.check_in : reservation.check_out;
  const time =
    kind === "CHECK_IN"
      ? (unit?.check_in || "16:00").slice(0, 5)
      : (unit?.checkout || "11:00").slice(0, 5);

  return zonedLocalToUtcMs(date, time, timeZone);
}

function isDue(
  rule: Rule,
  reservation: Reservation,
  unit: Unit | undefined,
  timeZone: string,
  now: number,
) {
  const target = targetTimeMs(rule, reservation, timeZone);
  const configuredAt = new Date(rule.updated_at || rule.created_at).getTime();

  if (!Number.isFinite(configuredAt) || target < configuredAt || now < target) {
    return false;
  }

  if (rule.trigger_event === "BEFORE_CHECKIN") {
    return now <= localBoundaryMs(
      reservation,
      unit,
      timeZone,
      "CHECK_IN",
    );
  }

  return now - target <= POST_STAY_CATCHUP_MS;
}

function renderTemplate(template: string, values: TemplateValues) {
  return template.replace(/{{\s*([a-z_]+)\s*}}/gi, (_match, key: string) => {
    return values[key.toLowerCase()] ?? "";
  });
}

function textToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => {
      const safe = escapeHtml(paragraph).replace(/\n/g, "<br>");
      return `<p>${safe}</p>`;
    })
    .join("");
}

function dateWindow(daysFromNow: number) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + daysFromNow);
  return now.toISOString().slice(0, 10);
}

function ruleRevision(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? String(parsed) : "0";
}

function deliveryStateKey(
  reservationId: string,
  notificationType: string,
) {
  return `${reservationId}|${notificationType}`;
}

type DeliveryState = {
  status: string;
  attemptCount: number;
};

function ruleAlreadySentForStay(
  states: Map<string, DeliveryState>,
  reservationId: string,
  ruleId: string,
  checkIn: string,
  checkOut: string,
) {
  const prefix = `${reservationId}|HOST_AUTO:${ruleId}:`;
  const suffix = `:${checkIn}:${checkOut}`;

  for (const [key, state] of states) {
    if (
      key.startsWith(prefix) &&
      key.endsWith(suffix) &&
      state.status === "SENT"
    ) {
      return true;
    }
  }

  return false;
}

async function loadReservationWindow(
  admin: SupabaseClient,
  organizationIds: string[],
) {
  const rows: Reservation[] = [];
  const pageSize = 1000;

  for (let offset = 0; offset < 10000; offset += pageSize) {
    const { data, error } = await admin
      .from("reservations")
      .select(
        "id,confirmation_code,organization_id,property_id,unit_id,guest_name,guest_email,check_in,check_out,status",
      )
      .in("organization_id", organizationIds)
      .eq("status", "CONFIRMED")
      .gte("check_out", dateWindow(-62))
      .lte("check_in", dateWindow(62))
      .order("check_in", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(
        `Unable to load automation reservations: ${error.message}`,
      );
    }

    rows.push(...((data ?? []) as Reservation[]));
    if ((data ?? []).length < pageSize) break;
  }

  return rows;
}

async function loadDeliveryStates(
  admin: SupabaseClient,
  reservationIds: string[],
) {
  const states = new Map<string, DeliveryState>();
  if (!reservationIds.length) return states;

  const chunkSize = 250;
  for (let i = 0; i < reservationIds.length; i += chunkSize) {
    const ids = reservationIds.slice(i, i + chunkSize);
    const { data, error } = await admin
      .from("notification_deliveries")
      .select("reservation_id,notification_type,status,attempt_count")
      .in("reservation_id", ids)
      .like("notification_type", "HOST_AUTO:%");

    if (error) {
      throw new Error(
        `Unable to inspect existing guest-email deliveries: ${error.message}`,
      );
    }

    for (const row of data ?? []) {
      states.set(
        deliveryStateKey(row.reservation_id, row.notification_type),
        {
          status: row.status,
          attemptCount: Number(row.attempt_count || 0),
        },
      );
    }
  }

  return states;
}

export async function runDueHostGuestAutomations(admin: SupabaseClient) {
  const { data: ruleData, error: ruleError } = await admin
    .from("host_guest_email_rules")
    .select(
      "id,organization_id,property_id,name,trigger_event,day_offset,send_time_local,subject_template,body_template,require_access_code,default_access_code,default_arrival_notes,created_at,updated_at",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1000);

  if (ruleError) {
    throw new Error(
      `Unable to load host guest email rules: ${ruleError.message}`,
    );
  }

  const rules = (ruleData ?? []) as Rule[];
  if (!rules.length) {
    return {
      rules: 0,
      due: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      missingCode: 0,
    };
  }

  const organizationIds = [
    ...new Set(rules.map((rule) => rule.organization_id)),
  ];
  const reservations = await loadReservationWindow(admin, organizationIds);

  if (!reservations.length) {
    return {
      rules: rules.length,
      due: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      missingCode: 0,
    };
  }

  const propertyIds = [...new Set(reservations.map((row) => row.property_id))];
  const unitIds = [...new Set(reservations.map((row) => row.unit_id))];
  const reservationIds = reservations.map((row) => row.id);

  const [
    propertyResult,
    organizationResult,
    unitResult,
    instructionResult,
    deliveryStates,
  ] = await Promise.all([
    admin
      .from("properties")
      .select(
        "id,organization_id,name,time_zone,notification_email,operations_email",
      )
      .in("id", propertyIds),
    admin
      .from("organizations")
      .select(
        "id,name,public_host_name,contact_email,contact_phone",
      )
      .in("id", organizationIds),
    admin
      .from("property_units")
      .select("id,check_in,checkout")
      .in("id", unitIds),
    admin
      .from("reservation_guest_instructions")
      .select("reservation_id,access_code,arrival_notes")
      .in("reservation_id", reservationIds),
    loadDeliveryStates(admin, reservationIds),
  ]);

  const firstError =
    propertyResult.error ??
    organizationResult.error ??
    unitResult.error ??
    instructionResult.error;

  if (firstError) {
    throw new Error(
      `Unable to load guest automation context: ${firstError.message}`,
    );
  }

  const propertyById = new Map(
    ((propertyResult.data ?? []) as Property[]).map((row) => [row.id, row]),
  );
  const organizationById = new Map(
    ((organizationResult.data ?? []) as Organization[]).map((row) => [
      row.id,
      row,
    ]),
  );
  const unitById = new Map(
    ((unitResult.data ?? []) as Unit[]).map((row) => [row.id, row]),
  );
  const instructionByReservation = new Map(
    ((instructionResult.data ?? []) as Instruction[]).map((row) => [
      row.reservation_id,
      row,
    ]),
  );

  const now = Date.now();
  let due = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let missingCode = 0;

  for (const rule of rules) {
    for (const reservation of reservations) {
      if (reservation.organization_id !== rule.organization_id) continue;
      if (rule.property_id && reservation.property_id !== rule.property_id) {
        continue;
      }
      if (!reservation.guest_email) continue;

      const property = propertyById.get(reservation.property_id);
      const organization = organizationById.get(reservation.organization_id);
      const unit = unitById.get(reservation.unit_id);
      if (!property || !organization) continue;

      const timeZone = validTimeZone(property.time_zone);
      if (!isDue(rule, reservation, unit, timeZone, now)) continue;

      due += 1;

      if (
        ruleAlreadySentForStay(
          deliveryStates,
          reservation.id,
          rule.id,
          reservation.check_in,
          reservation.check_out,
        )
      ) {
        skipped += 1;
        continue;
      }

      const notificationType =
        `HOST_AUTO:${rule.id}:${ruleRevision(rule.updated_at)}:` +
        `${reservation.check_in}:${reservation.check_out}`;
      const state =
        deliveryStates.get(
          deliveryStateKey(reservation.id, notificationType),
        ) ?? null;

      if (
        state?.status === "SENT" ||
        state?.status === "PENDING" ||
        state?.status === "FAILED"
      ) {
        skipped += 1;
        continue;
      }

      const instructions = instructionByReservation.get(reservation.id);
      const accessCode =
        instructions?.access_code?.trim() ||
        rule.default_access_code?.trim() ||
        "";
      const arrivalNotes =
        instructions?.arrival_notes?.trim() ||
        rule.default_arrival_notes?.trim() ||
        "";

      if (rule.require_access_code && !accessCode) {
        missingCode += 1;
        skipped += 1;
        continue;
      }

      const token = createGuestCheckoutToken(reservation.id);
      const tripUrl =
        `${siteUrl()}/trip/${encodeURIComponent(
          reservation.confirmation_code,
        )}` +
        `?reservationId=${encodeURIComponent(reservation.id)}` +
        `&checkoutToken=${encodeURIComponent(token)}`;

      const hostName =
        organization.public_host_name || organization.name || property.name;

      const values: TemplateValues = {
        guest_name: reservation.guest_name || "Guest",
        property_name: property.name,
        check_in: reservation.check_in,
        check_out: reservation.check_out,
        confirmation_code: reservation.confirmation_code,
        access_code: accessCode,
        arrival_notes: arrivalNotes,
        host_name: hostName,
        host_email:
          property.notification_email ||
          property.operations_email ||
          organization.contact_email ||
          "",
        host_phone: organization.contact_phone || "",
        trip_url: tripUrl,
      };

      const renderedSubject = renderTemplate(
        rule.subject_template,
        values,
      )
        .replace(/[\r\n]+/g, " ")
        .trim();

      const subject = (
        renderedSubject || `Message about your stay at ${property.name}`
      ).slice(0, 200);

      const text = renderTemplate(rule.body_template, values).trim();

      try {
        const result = await sendNotificationOnce({
          admin,
          reservationId: reservation.id,
          type: notificationType,
          recipient: reservation.guest_email,
          subject,
          text,
          html:
            textToHtml(text) +
            `<hr><p><small>Sent automatically by ${escapeHtml(
              hostName,
            )} through Find A Place Booking.</small></p>`,
        });

        if (result.sent) {
          sent += 1;
          deliveryStates.set(
            deliveryStateKey(reservation.id, notificationType),
            {
              status: "SENT",
              attemptCount: (state?.attemptCount ?? 0) + 1,
            },
          );
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        deliveryStates.set(
          deliveryStateKey(reservation.id, notificationType),
          {
            status: "FAILED",
            attemptCount: (state?.attemptCount ?? 0) + 1,
          },
        );
        console.error("[host guest automation]", {
          ruleId: rule.id,
          reservationId: reservation.id,
          error:
            error instanceof Error ? error.message : "unknown_error",
        });
      }
    }
  }

  return {
    rules: rules.length,
    due,
    sent,
    skipped,
    failed,
    missingCode,
  };
}
