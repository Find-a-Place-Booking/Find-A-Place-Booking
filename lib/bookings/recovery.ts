import type { SupabaseClient } from "@supabase/supabase-js";

export const RECOVERY_DAY_ONE_HOURS = 24;
export const RECOVERY_OPPORTUNITY_HOURS = 72;
export const RECOVERY_LOOKBACK_DAYS = 10;

type AvailabilityBlockRow = {
  block_type: string;
  start_date: string;
  end_date: string;
  expires_at: string | null;
};

export type RecoverySettings = {
  property_id: string;
  organization_id: string;
  is_enabled: boolean;
  day_one_enabled: boolean;
  offer_mode: "ASK" | "AUTO" | "OFF";
  default_discount_bps: number;
  minimum_interest: number;
  offer_expiry_hours: number;
};

function overlaps(
  start: string,
  end: string,
  otherStart: string,
  otherEnd: string,
) {
  return start < otherEnd && end > otherStart;
}

export async function recoveryDatesAvailable(
  admin: SupabaseClient,
  unitId: string,
  checkIn: string,
  checkOut: string,
) {
  const { data: unit, error: unitError } = await admin
    .from("property_units")
    .select("id,property_id,is_active")
    .eq("id", unitId)
    .maybeSingle();

  if (unitError || !unit?.is_active) return false;

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("status")
    .eq("id", unit.property_id)
    .maybeSingle();

  if (propertyError || property?.status !== "PUBLISHED") return false;

  const { data: resNexusState, error: resNexusError } = await admin.rpc(
    "service_resnexus_unit_calendar_state",
    {
      target_unit_id: unitId,
      target_check_in: checkIn,
      target_check_out: checkOut,
    },
  );

  // Recovery emails/offers must fail closed if the ResNexus safety check itself
  // cannot run. A marketing email is never worth risking a stale-date claim.
  if (resNexusError) return false;

  if (resNexusState && typeof resNexusState === "object") {
    const state = resNexusState as {
      has_resnexus?: boolean;
      ready?: boolean;
      unresolved_ranges?: Array<{ start?: string; end?: string }>;
    };

    if (state.has_resnexus && state.ready === false) return false;

    if (
      (state.unresolved_ranges ?? []).some(
        (range) =>
          range.start &&
          range.end &&
          overlaps(checkIn, checkOut, range.start, range.end),
      )
    ) {
      return false;
    }
  }

  const { data: blocks, error } = await admin
    .from("availability_blocks")
    .select("block_type,start_date,end_date,expires_at")
    .eq("unit_id", unitId)
    .eq("state", "ACTIVE")
    .lt("start_date", checkOut)
    .gt("end_date", checkIn)
    .limit(100);

  if (error) throw new Error(`Unable to verify recovery availability: ${error.message}`);

  const now = Date.now();

  return !((blocks ?? []) as AvailabilityBlockRow[]).some((block) => {
    if (block.block_type !== "INTERNAL_HOLD") return true;
    if (!block.expires_at) return true;
    const expiresAt = new Date(block.expires_at).getTime();
    return Number.isNaN(expiresAt) || expiresAt > now;
  });
}

export async function ensureRecoverySuppression(
  admin: SupabaseClient,
  recipientEmail: string,
) {
  const email = recipientEmail.trim().toLowerCase();
  if (!email) return null;

  const { data: existing, error: existingError } = await admin
    .from("booking_recovery_suppressions")
    .select("recipient_email,access_token,opted_out_at")
    .eq("recipient_email", email)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Unable to inspect recovery email preference: ${existingError.message}`);
  }
  if (existing) return existing;

  const { error: insertError } = await admin
    .from("booking_recovery_suppressions")
    .insert({ recipient_email: email });

  if (insertError && insertError.code !== "23505") {
    throw new Error(`Unable to create recovery email preference: ${insertError.message}`);
  }

  const { data, error } = await admin
    .from("booking_recovery_suppressions")
    .select("recipient_email,access_token,opted_out_at")
    .eq("recipient_email", email)
    .single();

  if (error) throw new Error(`Unable to load recovery email preference: ${error.message}`);
  return data;
}

export async function recoveryEmailSuppressed(
  admin: SupabaseClient,
  recipientEmail: string,
) {
  const row = await ensureRecoverySuppression(admin, recipientEmail);
  return Boolean(row?.opted_out_at);
}

export function prettyRecoveryDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      });
}

export function nightsBetween(start: string, end: string) {
  const startAt = new Date(`${start}T00:00:00Z`).getTime();
  const endAt = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) {
    return 0;
  }
  return Math.round((endAt - startAt) / 86_400_000);
}
