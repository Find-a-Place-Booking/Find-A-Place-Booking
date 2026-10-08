import type { SupabaseClient } from "@supabase/supabase-js";

import {
  RECOVERY_DAY_ONE_HOURS,
  RECOVERY_LOOKBACK_DAYS,
  RECOVERY_OPPORTUNITY_HOURS,
  recoveryDatesAvailable,
  type RecoverySettings,
} from "@/lib/bookings/recovery";
import {
  activateRecoveryOpportunity,
  cleanupExpiredRecoveryOffers,
} from "@/lib/bookings/recovery-offers";
import { sendDayOneRecoveryEmail } from "@/lib/notifications/booking-recovery";

type EstimateEvent = {
  attempt_id: string;
  unit_id: string | null;
  event_name: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type UnitRow = { id: string; property_id: string };
type DayOneReservationRow = { id: string; property_id: string; unit_id: string; check_in: string; check_out: string; guest_email: string | null; status: string; payment_status: string; created_at: string; checkout_recovery_sent_at: string | null };

type ExistingOpportunity = {
  id: string;
  unit_id: string;
  check_in: string;
  check_out: string;
  status: string;
};

type Signal = {
  attemptId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  createdAt: string;
};

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function extractSuccessfulEstimateSignals(events: EstimateEvent[]) {
  const pending = new Map<string, EstimateEvent>();
  const signals: Signal[] = [];

  for (const event of events) {
    if (event.event_name === "estimate_requested") {
      pending.set(event.attempt_id, event);
      continue;
    }
    if (event.event_name !== "estimate_succeeded") continue;

    const request = pending.get(event.attempt_id);
    if (!request?.unit_id) continue;
    const checkIn = request.metadata?.checkIn;
    const checkOut = request.metadata?.checkOut;
    if (!validDate(checkIn) || !validDate(checkOut) || checkOut <= checkIn) continue;

    signals.push({
      attemptId: event.attempt_id,
      unitId: request.unit_id,
      checkIn,
      checkOut,
      createdAt: request.created_at,
    });
    pending.delete(event.attempt_id);
  }

  return signals;
}

export async function runBookingRecoveryCron(admin: SupabaseClient) {
  const expiredPromotions = await cleanupExpiredRecoveryOffers(admin);

  const { data: settingsRows, error: settingsError } = await admin
    .from("booking_recovery_settings")
    .select(
      "property_id,organization_id,is_enabled,day_one_enabled,offer_mode,default_discount_bps,minimum_interest,offer_expiry_hours",
    )
    .eq("is_enabled", true);

  if (settingsError) {
    throw new Error(`Unable to load booking recovery settings: ${settingsError.message}`);
  }

  const settings = (settingsRows ?? []) as RecoverySettings[];
  if (!settings.length) {
    return {
      settings: 0,
      dayOneSent: 0,
      dayOneSkipped: 0,
      opportunitiesOpened: 0,
      autoOffersSent: 0,
      expiredPromotions,
    };
  }

  const settingsByProperty = new Map(settings.map((row) => [row.property_id, row]));
  const propertyIds = settings.map((row) => row.property_id);

  const { data: unitRows, error: unitError } = await admin
    .from("property_units")
    .select("id,property_id")
    .in("property_id", propertyIds)
    .eq("is_primary", true)
    .eq("is_active", true);
  if (unitError) throw new Error(`Unable to load recovery units: ${unitError.message}`);

  const unitToProperty = new Map<string, string>(
    ((unitRows ?? []) as UnitRow[]).map((row) => [
      row.id as string,
      row.property_id as string,
    ]),
  );
  const unitIds = [...unitToProperty.keys()];
  if (!unitIds.length) {
    return {
      settings: settings.length,
      dayOneSent: 0,
      dayOneSkipped: 0,
      opportunitiesOpened: 0,
      autoOffersSent: 0,
      expiredPromotions,
    };
  }

  let dayOneSent = 0;
  let dayOneSkipped = 0;

  const { data: dayOneReservations, error: reservationError } = await admin
    .from("reservations")
    .select(
      "id,property_id,unit_id,check_in,check_out,guest_email,status,payment_status,created_at,checkout_recovery_sent_at",
    )
    .in("property_id", propertyIds)
    .not("guest_email", "is", null)
    .not("checkout_recovery_sent_at", "is", null)
    .lte("created_at", hoursAgo(RECOVERY_DAY_ONE_HOURS))
    .gt("created_at", hoursAgo(RECOVERY_DAY_ONE_HOURS + 24))
    .eq("payment_environment", "LIVE")
    .in("status", ["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED", "EXPIRED"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (reservationError) {
    throw new Error(`Unable to load day-one recovery queue: ${reservationError.message}`);
  }

  const dayOneRows = (dayOneReservations ?? []) as DayOneReservationRow[];
  const dayOneKey = (row: {
    guest_email: string | null;
    unit_id: string;
    check_in: string;
    check_out: string;
  }) =>
    `${row.guest_email?.trim().toLowerCase() || ""}|${row.unit_id}|${row.check_in}|${row.check_out}`;

  // Notification deliveries are reservation-scoped, but a guest can create
  // more than one abandoned reservation while retrying the same dates. Build a
  // persistent email+unit+date dedupe set so the 24-hour reminder is sent once
  // for that missed stay, not once per abandoned hold.
  const sentDayOneKeys = new Set<string>();
  const { data: sentDayOneDeliveries, error: sentDayOneError } = await admin
    .from("notification_deliveries")
    .select("reservation_id")
    .eq("notification_type", "BOOKING_RECOVERY_DAY1")
    .eq("status", "SENT")
    .gte("created_at", daysAgo(RECOVERY_LOOKBACK_DAYS))
    .limit(1000);
  if (sentDayOneError) {
    throw new Error(`Unable to inspect day-one recovery deliveries: ${sentDayOneError.message}`);
  }

  const deliveredReservationIds = [
    ...new Set(
      (sentDayOneDeliveries ?? []).map(
        (row: { reservation_id: string }) => row.reservation_id,
      ),
    ),
  ];
  if (deliveredReservationIds.length) {
    for (let index = 0; index < deliveredReservationIds.length; index += 500) {
      const batch = deliveredReservationIds.slice(index, index + 500);
      const { data: deliveredReservations, error: deliveredReservationError } = await admin
        .from("reservations")
        .select("id,guest_email,unit_id,check_in,check_out")
        .in("id", batch);
      if (deliveredReservationError) {
        throw new Error(
          `Unable to inspect delivered day-one reservations: ${deliveredReservationError.message}`,
        );
      }
      for (const row of deliveredReservations ?? []) {
        sentDayOneKeys.add(dayOneKey(row));
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const processedDayOneKeys = new Set<string>();
  for (const reservation of dayOneRows) {
    const key = dayOneKey(reservation);
    const setting = settingsByProperty.get(reservation.property_id as string);
    if (
      !setting?.day_one_enabled ||
      sentDayOneKeys.has(key) ||
      processedDayOneKeys.has(key)
    ) {
      dayOneSkipped += 1;
      continue;
    }
    if (
      reservation.payment_status === "SUCCEEDED" ||
      reservation.payment_status === "PROCESSING" ||
      reservation.check_in <= today
    ) {
      dayOneSkipped += 1;
      continue;
    }

    if (!(await recoveryDatesAvailable(
      admin,
      reservation.unit_id,
      reservation.check_in,
      reservation.check_out,
    ))) {
      dayOneSkipped += 1;
      continue;
    }

    try {
      const result = await sendDayOneRecoveryEmail(admin, reservation.id);
      processedDayOneKeys.add(key);
      if (result.sent) {
        dayOneSent += 1;
        sentDayOneKeys.add(key);
      } else {
        dayOneSkipped += 1;
      }
    } catch (error) {
      dayOneSkipped += 1;
      console.error("[booking recovery cron] day-one email failed", {
        reservationId: reservation.id,
        error: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  const { data: eventRows, error: eventError } = await admin
    .from("booking_attempt_events")
    .select("attempt_id,unit_id,event_name,metadata,created_at")
    .in("unit_id", unitIds)
    .in("event_name", ["estimate_requested", "estimate_succeeded"])
    .gte("created_at", daysAgo(RECOVERY_LOOKBACK_DAYS))
    .order("created_at", { ascending: true })
    .limit(10000);

  if (eventError) {
    throw new Error(`Unable to load booking-interest events: ${eventError.message}`);
  }

  let signals = extractSuccessfulEstimateSignals((eventRows ?? []) as EstimateEvent[]);

  const signalAttemptIds = [...new Set(signals.map((signal) => signal.attemptId))];
  if (signalAttemptIds.length) {
    const liveAttemptIds = new Set<string>();
    for (let index = 0; index < signalAttemptIds.length; index += 500) {
      const batch = signalAttemptIds.slice(index, index + 500);
      const { data: attemptRows, error: attemptError } = await admin
        .from("booking_attempts")
        .select("id")
        .in("id", batch)
        .eq("payment_environment", "LIVE");
      if (attemptError) {
        throw new Error(`Unable to filter live recovery attempts: ${attemptError.message}`);
      }
      for (const row of attemptRows ?? []) liveAttemptIds.add(row.id as string);
    }
    signals = signals.filter((signal) => liveAttemptIds.has(signal.attemptId));
  } else {
    signals = [];
  }

  const grouped = new Map<
    string,
    {
      unitId: string;
      propertyId: string;
      checkIn: string;
      checkOut: string;
      attempts: Set<string>;
      firstAt: string;
      lastAt: string;
    }
  >();

  for (const signal of signals) {
    const propertyId = unitToProperty.get(signal.unitId);
    if (!propertyId) continue;
    const key = `${signal.unitId}|${signal.checkIn}|${signal.checkOut}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.attempts.add(signal.attemptId);
      if (signal.createdAt < existing.firstAt) existing.firstAt = signal.createdAt;
      if (signal.createdAt > existing.lastAt) existing.lastAt = signal.createdAt;
    } else {
      grouped.set(key, {
        unitId: signal.unitId,
        propertyId,
        checkIn: signal.checkIn,
        checkOut: signal.checkOut,
        attempts: new Set([signal.attemptId]),
        firstAt: signal.createdAt,
        lastAt: signal.createdAt,
      });
    }
  }

  const { data: existingOpportunityRows } = await admin
    .from("booking_recovery_opportunities")
    .select("id,unit_id,check_in,check_out,status")
    .in("unit_id", unitIds);
  const opportunityByKey = new Map<string, ExistingOpportunity>(
    ((existingOpportunityRows ?? []) as ExistingOpportunity[]).map((row) => [
      `${row.unit_id}|${row.check_in}|${row.check_out}`,
      row,
    ]),
  );

  const { data: ownerRows } = await admin
    .from("organization_members")
    .select("organization_id,profile_id,role,status")
    .in("organization_id", settings.map((row) => row.organization_id))
    .eq("status", "ACTIVE")
    .eq("role", "OWNER")
    .order("created_at", { ascending: true });
  const ownerByOrganization = new Map<string, string>();
  for (const row of ownerRows ?? []) {
    if (!ownerByOrganization.has(row.organization_id)) {
      ownerByOrganization.set(row.organization_id, row.profile_id);
    }
  }

  let opportunitiesOpened = 0;
  let autoOffersSent = 0;
  const opportunityCutoff = Date.now() - RECOVERY_OPPORTUNITY_HOURS * 60 * 60 * 1000;

  for (const group of grouped.values()) {
    const setting = settingsByProperty.get(group.propertyId);
    if (!setting || setting.offer_mode === "OFF") continue;
    if (group.attempts.size < setting.minimum_interest) continue;
    if (new Date(group.firstAt).getTime() > opportunityCutoff) continue;
    if (group.checkIn <= today) continue;

    const key = `${group.unitId}|${group.checkIn}|${group.checkOut}`;
    const existing = opportunityByKey.get(key);
    if (existing && ["SENT", "DECLINED", "EXPIRED"].includes(existing.status)) {
      continue;
    }

    if (!(await recoveryDatesAvailable(admin, group.unitId, group.checkIn, group.checkOut))) {
      if (existing?.status === "OPEN") {
        await admin
          .from("booking_recovery_opportunities")
          .update({ status: "EXPIRED" })
          .eq("id", existing.id)
          .eq("status", "OPEN");
      }
      continue;
    }

    const { data: recoverableReservations } = await admin
      .from("reservations")
      .select("guest_email,status,payment_status")
      .eq("unit_id", group.unitId)
      .eq("check_in", group.checkIn)
      .eq("check_out", group.checkOut)
      .not("guest_email", "is", null)
      .eq("payment_environment", "LIVE")
      .gte("created_at", daysAgo(RECOVERY_LOOKBACK_DAYS))
      .in("status", ["HOLD", "PAYMENT_PENDING", "PAYMENT_FAILED", "EXPIRED"]);

    const recoverableEmails = new Set<string>();
    for (const row of recoverableReservations ?? []) {
      if (row.payment_status === "SUCCEEDED" || row.payment_status === "PROCESSING") continue;
      if (row.guest_email) recoverableEmails.add(row.guest_email.trim().toLowerCase());
    }
    if (!recoverableEmails.size) continue;

    const candidateEmails = [...recoverableEmails];
    const { data: suppressedRows, error: suppressionError } = await admin
      .from("booking_recovery_suppressions")
      .select("recipient_email,opted_out_at")
      .in("recipient_email", candidateEmails);
    if (suppressionError) {
      throw new Error(`Unable to inspect recovery suppressions: ${suppressionError.message}`);
    }
    for (const row of suppressedRows ?? []) {
      if (row.opted_out_at) {
        recoverableEmails.delete(String(row.recipient_email).trim().toLowerCase());
      }
    }
    if (!recoverableEmails.size) continue;

    let opportunityId = existing?.id as string | undefined;
    if (opportunityId) {
      await admin
        .from("booking_recovery_opportunities")
        .update({
          interest_count: group.attempts.size,
          recoverable_count: recoverableEmails.size,
          last_interest_at: group.lastAt,
          suggested_discount_bps: setting.default_discount_bps,
        })
        .eq("id", opportunityId)
        .eq("status", "OPEN");
    } else {
      const { data: created, error: createError } = await admin
        .from("booking_recovery_opportunities")
        .insert({
          organization_id: setting.organization_id,
          property_id: group.propertyId,
          unit_id: group.unitId,
          check_in: group.checkIn,
          check_out: group.checkOut,
          interest_count: group.attempts.size,
          recoverable_count: recoverableEmails.size,
          suggested_discount_bps: setting.default_discount_bps,
          status: "OPEN",
          first_interest_at: group.firstAt,
          last_interest_at: group.lastAt,
        })
        .select("id")
        .single();
      if (createError || !created) {
        if (createError?.code === "23505") continue;
        throw new Error(`Unable to create recovery opportunity: ${createError?.message ?? "Unknown error"}`);
      }
      opportunityId = created.id;
      opportunitiesOpened += 1;
    }

    if (setting.offer_mode === "AUTO" && opportunityId) {
      const ownerId = ownerByOrganization.get(setting.organization_id);
      if (!ownerId) continue;
      try {
        const result = await activateRecoveryOpportunity({
          admin,
          opportunityId,
          discountBps: setting.default_discount_bps,
          createdBy: ownerId,
        });
        autoOffersSent += result.sent;
      } catch (error) {
        console.error("[booking recovery cron] auto offer failed", {
          opportunityId,
          error: error instanceof Error ? error.message : "unknown_error",
        });
      }
    }
  }

  return {
    settings: settings.length,
    dayOneSent,
    dayOneSkipped,
    opportunitiesOpened,
    autoOffersSent,
    expiredPromotions,
  };
}
