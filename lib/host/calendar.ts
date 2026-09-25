import { redirect } from "next/navigation";

import { getManagedOrganizations } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";

export type CalendarTarget = {
  organizationId: string;
  propertyId: string;
  propertyName: string;
  propertyStatus: string;
  unitId: string;
  unitName: string;
  slug: string;
  isPrimary: boolean;
};

export type CalendarConnectionRecord = {
  id: string;
  unit_id: string;
  provider: string;
  connection_kind: "ICAL" | "PMS_API";
  label: string;
  feed_url: string | null;
  is_active: boolean;
  sync_status: "NEVER_SYNCED" | "SYNCING" | "HEALTHY" | "ERROR" | "DISABLED";
  last_sync_attempt_at: string | null;
  last_synced_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  created_at: string;
  sourceHost: string | null;
  activeBlockCount: number;
};

export type AvailabilityBlockRecord = {
  id: string;
  unit_id: string;
  connection_id: string | null;
  block_type: "OWNER_BLOCK" | "EXTERNAL_BLOCK" | "INTERNAL_HOLD" | "INTERNAL_RESERVATION";
  state: "ACTIVE" | "CANCELLED";
  start_date: string;
  end_date: string;
  label: string | null;
  expires_at: string | null;
  updated_at: string;
};

export type CalendarExportTokenRecord = {
  id: string;
  unit_id: string;
  exclude_connection_id: string | null;
  token: string;
  is_active: boolean;
  rotated_at: string | null;
  created_at: string;
};

export type CalendarPricingDay = {
  stay_date: string;
  nightly_cents: number | null;
  currency: string;
  rate_source: string;
  rate_rule_id: string | null;
  special_label: string | null;
  minimum_stay_nights: number;
  stay_rule_id: string | null;
};

export type CalendarDay = {
  date: string;
  dayNumber: number;
  inMonth: boolean;
};

export type CalendarWorkspace = {
  targets: CalendarTarget[];
  selected: CalendarTarget | null;
  month: string;
  monthLabel: string;
  previousMonth: string;
  nextMonth: string;
  gridStart: string;
  gridEnd: string;
  gridEndExclusive: string;
  days: CalendarDay[];
  connections: CalendarConnectionRecord[];
  blocks: AvailabilityBlockRecord[];
  exportTokens: CalendarExportTokenRecord[];
  pricingDays: CalendarPricingDay[];
};

type PropertyRow = {
  id: string;
  organization_id: string;
  name: string;
  status: string;
  created_at: string;
};

type UnitRow = {
  id: string;
  property_id: string;
  name: string;
  slug: string;
  is_primary: boolean;
  is_active: boolean;
  created_at: string;
};

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(value: Date, days: number) {
  const result = new Date(value.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function shiftMonth(value: string, amount: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function normalizeCalendarMonth(raw?: string) {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [year, month] = raw.split("-").map(Number);
    if (year >= 2020 && year <= 2100 && month >= 1 && month <= 12) return raw;
  }
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildMonthWindow(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const last = new Date(Date.UTC(year, month, 0));
  const gridStartDate = addUtcDays(first, -first.getUTCDay());
  const trailing = 6 - last.getUTCDay();
  let gridEndDate = addUtcDays(last, trailing);
  // Keep the host calendar visually stable at six rows like common channel managers.
  const currentDays = Math.round((gridEndDate.getTime() - gridStartDate.getTime()) / 86_400_000) + 1;
  if (currentDays < 42) gridEndDate = addUtcDays(gridEndDate, 42 - currentDays);
  const gridEndExclusiveDate = addUtcDays(gridEndDate, 1);
  const days: CalendarDay[] = [];
  for (let date = new Date(gridStartDate); date < gridEndExclusiveDate; date = addUtcDays(date, 1)) {
    days.push({
      date: iso(date),
      dayNumber: date.getUTCDate(),
      inMonth: date.getUTCFullYear() === year && date.getUTCMonth() === month - 1,
    });
  }

  return {
    monthLabel: first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    previousMonth: shiftMonth(monthValue, -1),
    nextMonth: shiftMonth(monthValue, 1),
    gridStart: iso(gridStartDate),
    gridEnd: iso(gridEndDate),
    gridEndExclusive: iso(gridEndExclusiveDate),
    days,
  };
}

async function requireHost() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/host/sign-in");
  return supabase;
}

export function calendarProviderLabel(provider: string) {
  const labels: Record<string, string> = {
    AIRBNB: "Airbnb",
    VRBO: "Vrbo",
    BOOKING_COM: "Booking.com",
    GOOGLE: "Google Calendar",
    LODGIFY: "Lodgify",
    OWNEREZ: "OwnerRez",
    RESNEXUS: "ResNexus",
    GUESTY: "Guesty",
    THINKRESERVATIONS: "ThinkReservations",
    OTHER_ICAL: "Other iCal",
  };
  return labels[provider] ?? provider.replaceAll("_", " ");
}

export function calendarExportUrl(token: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/calendar/${token}.ics`;
}

export function calendarMoney(cents: number | null | undefined, currency = "USD") {
  if (cents == null) return null;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

export async function getCalendarWorkspace(input: { unitId?: string; month?: string }): Promise<CalendarWorkspace> {
  const month = normalizeCalendarMonth(input.month);
  const window = buildMonthWindow(month);
  const organizations = await getManagedOrganizations();
  if (!organizations.length) {
    return {
      targets: [], selected: null, month, ...window,
      connections: [], blocks: [], exportTokens: [], pricingDays: [],
    };
  }

  const supabase = await requireHost();
  const organizationIds = organizations.map((organization) => organization.id);
  const { data: propertyData, error: propertyError } = await supabase
    .from("properties")
    .select("id,organization_id,name,status,created_at")
    .in("organization_id", organizationIds)
    .neq("status", "ARCHIVED")
    .order("created_at", { ascending: true });
  if (propertyError) throw new Error("Unable to load calendar properties.");

  const properties = (propertyData ?? []) as PropertyRow[];
  if (!properties.length) {
    return {
      targets: [], selected: null, month, ...window,
      connections: [], blocks: [], exportTokens: [], pricingDays: [],
    };
  }

  const propertyIds = properties.map((property) => property.id);
  const { data: unitData, error: unitError } = await supabase
    .from("property_units")
    .select("id,property_id,name,slug,is_primary,is_active,created_at")
    .in("property_id", propertyIds)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (unitError) throw new Error("Unable to load rentable units for the calendar.");

  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const targets = ((unitData ?? []) as UnitRow[]).flatMap((unit) => {
    const property = propertyById.get(unit.property_id);
    if (!property) return [];
    return [{
      organizationId: property.organization_id,
      propertyId: property.id,
      propertyName: property.name,
      propertyStatus: property.status,
      unitId: unit.id,
      unitName: unit.name,
      slug: unit.slug,
      isPrimary: unit.is_primary,
    } satisfies CalendarTarget];
  });

  const selected = targets.find((target) => target.unitId === input.unitId) ?? targets[0] ?? null;
  if (!selected) {
    return {
      targets, selected: null, month, ...window,
      connections: [], blocks: [], exportTokens: [], pricingDays: [],
    };
  }

  const [connectionResult, blockResult, exportResult, blockCountResult, pricingResult] = await Promise.all([
    supabase
      .from("calendar_connections")
      .select("id,unit_id,provider,connection_kind,label,feed_url,is_active,sync_status,last_sync_attempt_at,last_synced_at,last_success_at,last_error_at,last_error,created_at")
      .eq("unit_id", selected.unitId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("availability_blocks")
      .select("id,unit_id,connection_id,block_type,state,start_date,end_date,label,expires_at,updated_at")
      .eq("unit_id", selected.unitId)
      .eq("state", "ACTIVE")
      .lt("start_date", window.gridEndExclusive)
      .gt("end_date", window.gridStart)
      .order("start_date", { ascending: true }),
    supabase
      .from("calendar_export_tokens")
      .select("id,unit_id,exclude_connection_id,token,is_active,rotated_at,created_at")
      .eq("unit_id", selected.unitId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase.rpc("calendar_connection_active_block_counts", {
      target_unit_id: selected.unitId,
    }),
    supabase.rpc("resolve_unit_pricing_days", {
      target_unit_id: selected.unitId,
      range_start: window.gridStart,
      range_end: window.gridEnd,
    }),
  ]);

  const firstError = connectionResult.error ?? blockResult.error ?? exportResult.error ?? blockCountResult.error;
  if (firstError) {
    console.error("[getCalendarWorkspace]", { code: firstError.code, message: firstError.message, details: firstError.details, hint: firstError.hint });
    throw new Error("Unable to load the calendar workspace. Apply the current Milestone 9B migration and refresh.");
  }

  const blockCounts = new Map<string, number>();
  for (const row of (blockCountResult.data ?? []) as Array<{ connection_id: string; active_block_count: number | string }>) {
    blockCounts.set(row.connection_id, Number(row.active_block_count) || 0);
  }

  const connections = ((connectionResult.data ?? []) as Omit<CalendarConnectionRecord, "sourceHost" | "activeBlockCount">[]).map((connection) => {
    let sourceHost: string | null = null;
    if (connection.feed_url) {
      try { sourceHost = new URL(connection.feed_url).hostname; } catch { sourceHost = null; }
    }
    return { ...connection, sourceHost, activeBlockCount: blockCounts.get(connection.id) ?? 0 };
  });

  if (pricingResult.error) {
    console.error("[resolve_unit_pricing_days calendar]", { code: pricingResult.error.code, message: pricingResult.error.message });
  }

  return {
    targets,
    selected,
    month,
    ...window,
    connections,
    blocks: (blockResult.data ?? []) as AvailabilityBlockRecord[],
    exportTokens: (exportResult.data ?? []) as CalendarExportTokenRecord[],
    pricingDays: pricingResult.error ? [] : ((pricingResult.data ?? []) as CalendarPricingDay[]),
  };
}
