import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptPmsCredential } from "@/lib/integrations/credential-crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const THINKRESERVATIONS_BASE_URL = "https://api.thinkreservations.com";
const EMPTY_CONFIRMATION = "[PMS_EMPTY_CONFIRMATION]";
const MAX_WINDOW_DAYS = 30;

type JsonObject = Record<string, unknown>;

export type ThinkDateRange = {
  start: string;
  end: string;
};

type InventorySignal = {
  date: string;
  roomTypeId: string;
  available: boolean;
};

type ThinkSourceBlock = {
  key: string;
  uid: string;
  start: string;
  end: string;
  sourceKind: "inventory" | "blackout";
  roomId: string | null;
  roomTypeId: string | null;
  metadata: Record<string, unknown>;
};

class ThinkReservationsRequestError extends Error {
  status: number | null;
  path: string;
  requestId: string | null;
  contentType: string | null;
  sanitizedBody: string | null;

  constructor(input: {
    message: string;
    status?: number | null;
    path: string;
    requestId?: string | null;
    contentType?: string | null;
    sanitizedBody?: string | null;
  }) {
    super(input.message);
    this.name = "ThinkReservationsRequestError";
    this.status = input.status ?? null;
    this.path = input.path;
    this.requestId = input.requestId ?? null;
    this.contentType = input.contentType ?? null;
    this.sanitizedBody = input.sanitizedBody ?? null;
  }
}

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function stringValue(object: JsonObject | null, ...keys: string[]) {
  if (!object) return null;
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function booleanValue(object: JsonObject | null, ...keys: string[]) {
  if (!object) return null;
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (value === 1) return true;
      if (value === 0) return false;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "open", "available", "bookable"].includes(normalized)) return true;
      if (["false", "no", "closed", "unavailable", "sold_out", "sold out", "blocked"].includes(normalized)) return false;
    }
  }
  return null;
}

function numberValue(object: JsonObject | null, ...keys: string[]) {
  if (!object) return null;
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function normalizedDate(value: unknown) {
  if (typeof value !== "string") return null;
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

function parseDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid calendar date: ${value}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string | Date, days: number) {
  const date = typeof value === "string" ? parseDate(value) : new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function daysBetween(start: string, end: string) {
  return Math.max(0, Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000));
}

function defaultWindow() {
  const configured = Number(process.env.PMS_SYNC_LOOKAHEAD_DAYS || "730");
  const lookahead =
    Number.isFinite(configured) && configured >= 30 && configured <= 1095
      ? Math.floor(configured)
      : 730;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { startDate: isoDate(today), endDate: isoDate(new Date(today.getTime() + lookahead * 86_400_000)) };
}

function syncMode() {
  const raw = (process.env.THINK_SYNC_MODE || "current_api").trim().toLowerCase();
  return ["current_api", "current_api_shadow", "freeze_last_good"].includes(raw)
    ? raw
    : "current_api";
}

function responseMessage(body: unknown) {
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 400);
  const object = objectValue(body);
  return stringValue(object, "message", "error_description", "error", "detail");
}

function redactBody(body: string) {
  return body
    .replace(/rk_[A-Za-z0-9_-]+/g, "[REDACTED_API_KEY]")
    .replace(/"?(email|phone|firstName|lastName|guestName|guest_name)"?\s*:\s*"[^"]*"/gi, '"$1":"[REDACTED]"')
    .slice(0, 500);
}

async function thinkRequest(apiKey: string, path: string, query: Record<string, string> = {}) {
  const url = new URL(path, THINKRESERVATIONS_BASE_URL);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new ThinkReservationsRequestError({
      path,
      message:
        error instanceof Error
          ? `ThinkReservations could not be reached for ${path}: ${error.message}`
          : `ThinkReservations could not be reached for ${path}.`,
    });
  }

  const raw = await response.text();
  const contentType = response.headers.get("content-type");
  const requestId =
    response.headers.get("x-request-id") ||
    response.headers.get("x-correlation-id") ||
    response.headers.get("request-id");

  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  if (!response.ok) {
    const detail = responseMessage(body);
    throw new ThinkReservationsRequestError({
      path,
      status: response.status,
      requestId,
      contentType,
      sanitizedBody: raw ? redactBody(raw) : null,
      message: `ThinkReservations ${path} returned HTTP ${response.status}${detail ? `: ${detail}` : "."}`,
    });
  }

  return { body, status: response.status, requestId, contentType };
}

function diagnosticMessage(error: unknown) {
  if (!(error instanceof ThinkReservationsRequestError)) {
    return error instanceof Error ? error.message : String(error);
  }
  return [
    error.message,
    error.requestId ? `request_id=${error.requestId}` : null,
    error.contentType ? `content_type=${error.contentType}` : null,
    error.sanitizedBody ? `body=${error.sanitizedBody}` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1000);
}

function listPayload(body: unknown, keys: string[]) {
  if (Array.isArray(body)) return body;
  const object = objectValue(body);
  if (!object) return [];
  for (const key of keys) {
    const value = object[key];
    if (Array.isArray(value)) return value;
  }
  return [body];
}

function roomIdFrom(object: JsonObject | null) {
  if (!object) return null;
  return (
    stringValue(object, "roomId", "room_id", "assignedRoomId", "assigned_room_id") ||
    stringValue(objectValue(object.room), "id", "externalId", "external_id")
  );
}

function roomTypeIdFrom(object: JsonObject | null) {
  if (!object) return null;
  return (
    stringValue(object, "roomTypeId", "room_type_id", "roomtypeId", "roomtype_id") ||
    stringValue(objectValue(object.roomType ?? object.room_type), "id", "externalId", "external_id")
  );
}

function availabilityFrom(object: JsonObject | null) {
  if (!object) return null;
  const direct = booleanValue(object, "isAvailable", "is_available", "available", "bookable", "isBookable", "is_bookable");
  if (direct !== null) return direct;

  const unavailable = booleanValue(
    object,
    "soldOut",
    "sold_out",
    "isSoldOut",
    "is_sold_out",
    "blocked",
    "isBlocked",
    "is_blocked",
    "closed",
    "isClosed",
    "is_closed",
    "stopSell",
    "stop_sell",
  );
  if (unavailable !== null) return !unavailable;

  const availableCount = numberValue(
    object,
    "availableRooms",
    "available_rooms",
    "roomsAvailable",
    "rooms_available",
    "availableRoomCount",
    "available_room_count",
    "availableCount",
    "available_count",
    "quantityAvailable",
    "quantity_available",
    "availableQuantity",
    "available_quantity",
    "remaining",
    "remainingInventory",
    "remaining_inventory",
    "inventoryAvailable",
    "inventory_available",
  );
  return availableCount === null ? null : availableCount > 0;
}

function directInventoryAvailability(object: JsonObject | null, hasOwnDate: boolean, hasOwnRoomType: boolean) {
  const explicit = availabilityFrom(object);
  if (explicit !== null) return explicit;
  if (object && hasOwnDate && hasOwnRoomType) {
    const inventory = numberValue(object, "inventory");
    if (inventory !== null) return inventory > 0;
  }
  return null;
}

function collectInventorySignals(
  value: unknown,
  inherited: { date?: string | null; roomTypeId?: string | null } = {},
  depth = 0,
): InventorySignal[] {
  if (depth > 8 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectInventorySignals(item, inherited, depth + 1));
  const object = objectValue(value);
  if (!object) return [];

  const ownRoomTypeId = roomTypeIdFrom(object);
  const roomTypeId = ownRoomTypeId ?? inherited.roomTypeId ?? null;
  const ownDate =
    normalizedDate(stringValue(object, "date", "inventoryDate", "inventory_date", "stayDate", "stay_date", "night")) ?? null;
  const date = ownDate ?? inherited.date ?? null;
  const available = directInventoryAvailability(object, Boolean(ownDate), Boolean(ownRoomTypeId));
  const output: InventorySignal[] = [];

  if (date && roomTypeId && available !== null) output.push({ date, roomTypeId, available });

  for (const [key, child] of Object.entries(object)) {
    if (["room", "roomType", "room_type", "date", "inventoryDate", "inventory_date", "stayDate", "stay_date", "night"].includes(key)) continue;
    const dateKey = normalizedDate(key);
    output.push(...collectInventorySignals(child, { date: dateKey ?? date, roomTypeId }, depth + 1));
  }
  return output;
}

function uniqueInventorySignals(signals: InventorySignal[]) {
  const unique = new Map<string, InventorySignal>();
  for (const signal of signals) unique.set(`${signal.date}|${signal.roomTypeId}`, signal);
  return [...unique.values()];
}

async function fetchInventoryWindow(input: {
  hotelId: string;
  apiKey: string;
  startDate: string;
  endDate: string;
  depth?: number;
}): Promise<unknown[]> {
  const path = `/v1/hotels/${encodeURIComponent(input.hotelId)}/inventory`;
  try {
    const response = await thinkRequest(input.apiKey, path, { start_date: input.startDate, end_date: input.endDate });
    return listPayload(response.body, ["inventory", "inventories", "dailyInventory", "daily_inventory", "availability", "availabilities", "data", "items", "results"]);
  } catch (error) {
    const depth = input.depth ?? 0;
    const span = daysBetween(input.startDate, input.endDate);
    const retryable = error instanceof ThinkReservationsRequestError && error.status !== null && error.status >= 500 && error.status <= 599;
    if (!retryable || span <= 7 || depth >= 8) throw error;
    const midpoint = addDays(input.startDate, Math.max(1, Math.floor(span / 2)));
    if (midpoint === input.startDate || midpoint === input.endDate) throw error;
    const [left, right] = await Promise.all([
      fetchInventoryWindow({ ...input, endDate: midpoint, depth: depth + 1 }),
      fetchInventoryWindow({ ...input, startDate: midpoint, depth: depth + 1 }),
    ]);
    return [...left, ...right];
  }
}

async function fetchInventorySignals(input: { hotelId: string; apiKey: string; startDate: string; endDate: string }) {
  const raw: unknown[] = [];
  let cursor = input.startDate;
  while (cursor < input.endDate) {
    const remaining = daysBetween(cursor, input.endDate);
    const chunkEnd = remaining > MAX_WINDOW_DAYS ? addDays(cursor, MAX_WINDOW_DAYS) : input.endDate;
    raw.push(...(await fetchInventoryWindow({ ...input, startDate: cursor, endDate: chunkEnd })));
    cursor = chunkEnd;
  }

  const signals = uniqueInventorySignals(raw.flatMap((item) => collectInventorySignals(item))).filter(
    (signal) => signal.date >= input.startDate && signal.date < input.endDate,
  );

  if (!signals.length && raw.length) {
    throw new Error("ThinkReservations inventory returned data in an unrecognized shape. Existing imported dates were preserved.");
  }
  return signals;
}

export function mergeDateRanges(ranges: ThinkDateRange[]) {
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .slice()
    .sort((a, b) => (a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)));
  const merged: ThinkDateRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end) merged.push({ ...range });
    else if (range.end > previous.end) previous.end = range.end;
  }
  return merged;
}

function compressUnavailableDates(dates: string[], roomId: string, roomTypeId: string) {
  const ranges: ThinkDateRange[] = [];
  for (const date of [...new Set(dates)].sort()) {
    const previous = ranges[ranges.length - 1];
    if (previous && previous.end === date) previous.end = addDays(date, 1);
    else ranges.push({ start: date, end: addDays(date, 1) });
  }
  return ranges.map<ThinkSourceBlock>((range) => ({
    key: `thinkres:inventory:${roomId}:${range.start}:${range.end}`,
    uid: `inventory:${roomId}:${range.start}:${range.end}`,
    start: range.start,
    end: range.end,
    sourceKind: "inventory",
    roomId,
    roomTypeId,
    metadata: { provider: "THINKRESERVATIONS", source_kind: "inventory", room_id: roomId, room_type_id: roomTypeId },
  }));
}

function dateFrom(object: JsonObject | null, ...keys: string[]) {
  return normalizedDate(stringValue(object, ...keys));
}

export function parseThinkBlackoutBlocks(body: unknown): ThinkSourceBlock[] {
  const items = listPayload(body, ["blackouts", "data", "items", "results"]);
  const blocks: ThinkSourceBlock[] = [];
  let recognized = items.length === 0;

  items.forEach((raw, index) => {
    const object = objectValue(raw);
    if (!object) return;
    const start = dateFrom(object, "startDate", "start_date", "startOn", "start_on", "arrivalDate", "arrival_date", "checkIn", "check_in", "date");
    let end = dateFrom(object, "endDate", "end_date", "endOn", "end_on", "departureDate", "departure_date", "checkOut", "check_out");
    if (start && !end && normalizedDate(stringValue(object, "date"))) end = addDays(start, 1);
    if (!start || !end || end <= start) return;
    recognized = true;
    const roomId = roomIdFrom(object);
    const roomTypeId = roomTypeIdFrom(object);
    const id = stringValue(object, "id", "externalId", "external_id", "blackoutId", "blackout_id") ?? `${index}`;
    blocks.push({
      key: `thinkres:blackout:${id}:${start}:${end}`,
      uid: `blackout:${id}`,
      start,
      end,
      sourceKind: "blackout",
      roomId,
      roomTypeId,
      metadata: { provider: "THINKRESERVATIONS", source_kind: "blackout", room_id: roomId, room_type_id: roomTypeId },
    });
  });

  if (!recognized && items.length) {
    throw new Error("ThinkReservations blackout data changed shape. Existing imported dates were preserved.");
  }
  return blocks;
}

async function fetchBlackoutBlocks(input: { hotelId: string; apiKey: string; startDate: string; endDate: string }) {
  const path = `/v1/hotels/${encodeURIComponent(input.hotelId)}/blackouts`;
  const all: ThinkSourceBlock[] = [];
  let cursor = input.startDate;
  while (cursor < input.endDate) {
    const remaining = daysBetween(cursor, input.endDate);
    const chunkEnd = remaining > MAX_WINDOW_DAYS ? addDays(cursor, MAX_WINDOW_DAYS) : input.endDate;
    const response = await thinkRequest(input.apiKey, path, { start_date: cursor, end_date: chunkEnd });
    all.push(...parseThinkBlackoutBlocks(response.body));
    cursor = chunkEnd;
  }
  const unique = new Map<string, ThinkSourceBlock>();
  for (const block of all) {
    if (block.start < input.endDate && block.end > input.startDate) unique.set(`${block.key}|${block.roomId ?? ""}|${block.roomTypeId ?? ""}`, block);
  }
  return [...unique.values()];
}

function roomsForRoomType(resourceCache: unknown, roomTypeId: string | null) {
  if (!roomTypeId) return [];
  const cache = objectValue(resourceCache);
  const rooms = Array.isArray(cache?.rooms) ? cache.rooms : [];
  return rooms
    .map(objectValue)
    .filter((room): room is JsonObject => Boolean(room))
    .filter((room) => roomTypeIdFrom(room) === roomTypeId);
}

function blackoutApplies(block: ThinkSourceBlock, roomId: string, roomTypeId: string, uniquePhysicalRoom: boolean) {
  if (block.roomId) return block.roomId === roomId;
  if (block.roomTypeId) return uniquePhysicalRoom && block.roomTypeId === roomTypeId;
  // A blackout with dates but no room identifiers is conservatively treated as hotel-wide.
  return true;
}

async function emptyResultMayClear(admin: SupabaseClient, connectionId: string, startDate: string, endDate: string) {
  const [activeBlocks, latestRun] = await Promise.all([
    admin
      .from("availability_blocks")
      .select("id", { count: "exact", head: true })
      .eq("connection_id", connectionId)
      .eq("block_type", "EXTERNAL_BLOCK")
      .eq("state", "ACTIVE")
      .lt("start_date", endDate)
      .gt("end_date", startDate),
    admin
      .from("calendar_sync_runs")
      .select("status,error_message,completed_at")
      .eq("connection_id", connectionId)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (activeBlocks.error) throw new Error(activeBlocks.error.message);
  if (!activeBlocks.count) return true;

  const previous = latestRun.data;
  const previousAt = previous?.completed_at ? new Date(previous.completed_at).getTime() : 0;
  const ageMs = Date.now() - previousAt;
  const confirmed =
    previous?.status === "ERROR" &&
    previous.error_message?.startsWith(EMPTY_CONFIRMATION) &&
    ageMs >= 5 * 60_000 &&
    ageMs <= 60 * 60_000;
  if (confirmed) return true;

  await admin.rpc("service_mark_calendar_sync_error", {
    target_connection_id: connectionId,
    error_message:
      `${EMPTY_CONFIRMATION} ThinkReservations inventory + blackouts returned no blocked dates while imported dates still exist. ` +
      "Existing dates were preserved; a second empty result after five minutes is required before clearing them.",
  });
  return false;
}

async function loadThinkConnection(admin: SupabaseClient, connectionId: string) {
  const { data: connection, error: connectionError } = await admin
    .from("calendar_connections")
    .select("id,unit_id,provider,connection_kind,is_active,pms_integration_id,external_calendar_id,external_room_type_id")
    .eq("id", connectionId)
    .single();
  if (
    connectionError ||
    !connection ||
    !connection.is_active ||
    connection.connection_kind !== "PMS_API" ||
    connection.provider !== "THINKRESERVATIONS" ||
    !connection.pms_integration_id ||
    !connection.external_calendar_id ||
    !connection.external_room_type_id
  ) {
    throw new Error("ThinkReservations calendar mapping is incomplete.");
  }

  const { data: integration, error: integrationError } = await admin
    .from("pms_integrations")
    .select("id,external_account_id,credential_ciphertext,status,resource_cache")
    .eq("id", connection.pms_integration_id)
    .eq("provider", "THINKRESERVATIONS")
    .maybeSingle();
  if (integrationError || !integration || !["CONNECTED", "ERROR"].includes(integration.status)) {
    throw new Error("ThinkReservations account connection is unavailable.");
  }
  return { connection, integration };
}

async function markIntegration(admin: SupabaseClient, integrationId: string, ok: boolean, message?: string | null) {
  const now = new Date().toISOString();
  await admin
    .from("pms_integrations")
    .update({
      status: ok ? "CONNECTED" : "ERROR",
      last_sync_at: ok ? now : undefined,
      last_error: message ? message.slice(0, 1000) : null,
      updated_at: now,
    })
    .eq("id", integrationId);
}

export async function syncThinkReservationsConnection(
  connectionId: string,
  suppliedAdmin?: SupabaseClient,
  requestedWindow?: { startDate: string; endDate: string },
) {
  const admin = suppliedAdmin ?? createAdminClient();
  const window = requestedWindow ?? defaultWindow();
  let integrationId: string | null = null;
  let errorAlreadyRecorded = false;

  try {
    const { connection, integration } = await loadThinkConnection(admin, connectionId);
    integrationId = integration.id;
    const apiKey = decryptPmsCredential(integration.credential_ciphertext);
    const sameTypeRooms = roomsForRoomType(integration.resource_cache, connection.external_room_type_id);
    if (sameTypeRooms.length !== 1) {
      throw new Error(
        `ThinkReservations room type maps to ${sameTypeRooms.length} physical rooms. Existing dates were preserved rather than mixing cabins.`,
      );
    }

    // Both official read:availability sources must succeed before reconciliation.
    // Never apply inventory alone: that is what caused Dawn's missing blocked dates.
    const [inventorySignals, blackoutBlocks] = await Promise.all([
      fetchInventorySignals({
        hotelId: integration.external_account_id,
        apiKey,
        startDate: window.startDate,
        endDate: window.endDate,
      }),
      fetchBlackoutBlocks({
        hotelId: integration.external_account_id,
        apiKey,
        startDate: window.startDate,
        endDate: window.endDate,
      }),
    ]);

    const applicableInventory = inventorySignals.filter(
      (signal) => signal.roomTypeId === connection.external_room_type_id,
    );
    if (!applicableInventory.length && inventorySignals.length) {
      throw new Error("ThinkReservations inventory returned data, but none matched this cabin's exact room type. Existing dates were preserved.");
    }

    const inventoryBlocks = compressUnavailableDates(
      applicableInventory.filter((signal) => !signal.available).map((signal) => signal.date),
      connection.external_calendar_id,
      connection.external_room_type_id,
    );

    const mappedBlackouts = blackoutBlocks
      .filter((block) =>
        blackoutApplies(
          block,
          connection.external_calendar_id,
          connection.external_room_type_id,
          sameTypeRooms.length === 1,
        ),
      )
      .map((block) => ({
        ...block,
        metadata: {
          ...block.metadata,
          mapped_room_id: connection.external_calendar_id,
          mapped_room_type_id: connection.external_room_type_id,
        },
      }));

    const mappedBlocks = [...inventoryBlocks, ...mappedBlackouts].map((block) => ({
      key: block.key,
      uid: block.uid,
      start: block.start < window.startDate ? window.startDate : block.start,
      end: block.end > window.endDate ? window.endDate : block.end,
      metadata: block.metadata,
    })).filter((block) => block.end > block.start);

    const mode = syncMode();
    if (mode === "freeze_last_good") {
      return { id: connection.id, provider: "THINKRESERVATIONS", ok: true as const, imported: 0, deactivated: 0, frozen: true as const };
    }
    if (mode === "current_api_shadow") {
      console.info("[ThinkReservations current API shadow]", {
        connectionId: connection.id,
        unitId: connection.unit_id,
        startDate: window.startDate,
        endDate: window.endDate,
        inventoryBlocks: inventoryBlocks.length,
        blackoutBlocks: mappedBlackouts.length,
        combinedBlocks: mappedBlocks.length,
      });
      return { id: connection.id, provider: "THINKRESERVATIONS", ok: true as const, imported: 0, deactivated: 0, shadow: true as const };
    }

    if (!mappedBlocks.length) {
      const mayClear = await emptyResultMayClear(admin, connection.id, window.startDate, window.endDate);
      if (!mayClear) {
        errorAlreadyRecorded = true;
        throw new Error("ThinkReservations returned an unexpected empty availability result. Existing imported dates were preserved.");
      }
    }

    const { data, error } = await admin.rpc("service_apply_pms_sync", {
      target_connection_id: connection.id,
      source_blocks: mappedBlocks,
      sync_window_start: window.startDate,
      sync_window_end: window.endDate,
    });
    if (error) throw new Error(error.message);

    await markIntegration(admin, integration.id, true, null);
    const result = (data ?? {}) as { imported_count?: number; deactivated_count?: number };
    return {
      id: connection.id,
      provider: "THINKRESERVATIONS",
      ok: true as const,
      imported: result.imported_count ?? mappedBlocks.length,
      deactivated: result.deactivated_count ?? 0,
    };
  } catch (error) {
    const message = diagnosticMessage(error);
    if (!errorAlreadyRecorded) {
      await admin.rpc("service_mark_calendar_sync_error", {
        target_connection_id: connectionId,
        error_message: message.slice(0, 1000),
      });
    }
    if (integrationId) await markIntegration(admin, integrationId, false, message);
    return { id: connectionId, provider: "THINKRESERVATIONS", ok: false as const, error: message.slice(0, 240) };
  }
}

function responseContainsMappedAvailability(
  value: unknown,
  mappedRoomId: string,
  mappedRoomTypeId: string,
  uniquePhysicalRoom: boolean,
  depth = 0,
): boolean {
  if (depth > 10 || value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some((item) => responseContainsMappedAvailability(item, mappedRoomId, mappedRoomTypeId, uniquePhysicalRoom, depth + 1));
  }
  const object = objectValue(value);
  if (!object) return false;

  const roomId = roomIdFrom(object);
  const roomTypeId = roomTypeIdFrom(object);
  const explicitAvailability = availabilityFrom(object);
  const booking = objectValue(object.booking);
  const bookingRoomId = roomIdFrom(booking);
  const bookingRoomTypeId = roomTypeIdFrom(booking);

  const exactRoomMatch = roomId === mappedRoomId || bookingRoomId === mappedRoomId;
  const typeMatch =
    uniquePhysicalRoom &&
    (roomTypeId === mappedRoomTypeId || bookingRoomTypeId === mappedRoomTypeId);

  if (exactRoomMatch || typeMatch) {
    // If the candidate itself explicitly says unavailable, do not recurse into
    // its booking object and accidentally turn that same candidate back on.
    if (explicitAvailability === false) return false;
    return true;
  }

  for (const child of Object.values(object)) {
    if (responseContainsMappedAvailability(child, mappedRoomId, mappedRoomTypeId, uniquePhysicalRoom, depth + 1)) return true;
  }
  return false;
}

export function thinkAvailabilityResponseHasMappedRoom(input: {
  body: unknown;
  roomId: string;
  roomTypeId: string;
  uniquePhysicalRoom: boolean;
}) {
  return responseContainsMappedAvailability(
    input.body,
    input.roomId,
    input.roomTypeId,
    input.uniquePhysicalRoom,
  );
}

export async function assertThinkReservationsUnitAvailable(
  unitId: string,
  checkIn: string,
  checkOut: string,
  suppliedAdmin?: SupabaseClient,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) {
    throw new Error("The requested ThinkReservations stay dates are invalid.");
  }

  const admin = suppliedAdmin ?? createAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from("calendar_connections")
    .select("id,pms_integration_id,external_calendar_id,external_room_type_id,is_active")
    .eq("unit_id", unitId)
    .eq("provider", "THINKRESERVATIONS")
    .eq("connection_kind", "PMS_API")
    .eq("is_active", true)
    .maybeSingle();
  if (connectionError) throw new Error("ThinkReservations availability could not be verified.");
  if (!connection) return { connected: false as const };
  if (!connection.pms_integration_id || !connection.external_calendar_id || !connection.external_room_type_id) {
    throw new Error("ThinkReservations room mapping is incomplete.");
  }

  const { data: integration, error: integrationError } = await admin
    .from("pms_integrations")
    .select("external_account_id,credential_ciphertext,status,resource_cache")
    .eq("id", connection.pms_integration_id)
    .eq("provider", "THINKRESERVATIONS")
    .maybeSingle();
  if (integrationError || !integration || !["CONNECTED", "ERROR"].includes(integration.status)) {
    throw new Error("ThinkReservations availability could not be verified.");
  }

  const sameTypeRooms = roomsForRoomType(integration.resource_cache, connection.external_room_type_id);
  if (sameTypeRooms.length !== 1) {
    throw new Error("ThinkReservations live availability cannot safely identify this physical cabin from its room type.");
  }

  const apiKey = decryptPmsCredential(integration.credential_ciphertext);
  const path = `/v1/hotels/${encodeURIComponent(integration.external_account_id)}/availabilities`;

  const combinedSourcesSayAvailable = async () => {
    const [inventorySignals, blackoutBlocks] = await Promise.all([
      fetchInventorySignals({
        hotelId: integration.external_account_id,
        apiKey,
        startDate: checkIn,
        endDate: checkOut,
      }),
      fetchBlackoutBlocks({
        hotelId: integration.external_account_id,
        apiKey,
        startDate: checkIn,
        endDate: checkOut,
      }),
    ]);

    const inventoryBlocked = inventorySignals.some(
      (signal) =>
        signal.roomTypeId === connection.external_room_type_id &&
        !signal.available &&
        signal.date >= checkIn &&
        signal.date < checkOut,
    );

    const blackoutBlocked = blackoutBlocks.some(
      (block) =>
        blackoutApplies(
          block,
          connection.external_calendar_id,
          connection.external_room_type_id,
          true,
        ) &&
        block.start < checkOut &&
        block.end > checkIn,
    );

    if (inventoryBlocked || blackoutBlocked) {
      throw new Error(
        "Those dates are no longer available in ThinkReservations. Choose different dates.",
      );
    }

    return { connected: true as const, available: true as const, verifiedBy: "inventory+blackouts" as const };
  };

  let response: Awaited<ReturnType<typeof thinkRequest>>;
  try {
    response = await thinkRequest(apiKey, path, {
      start_date: checkIn,
      end_date: checkOut,
      room_type_id: connection.external_room_type_id,
    });
  } catch (error) {
    // Think's public availability endpoint is new. If this hotel rejects only
    // the search-query shape (400/422), fall back to a fresh exact-window read
    // of BOTH official read:availability sources. Authentication, permission,
    // network and server failures still fail closed.
    if (
      error instanceof ThinkReservationsRequestError &&
      (error.status === 400 || error.status === 422)
    ) {
      return combinedSourcesSayAvailable();
    }
    throw error;
  }

  const items = listPayload(response.body, [
    "availabilities",
    "availability",
    "data",
    "items",
    "results",
  ]);

  if (!items.length) {
    throw new Error(
      "Those dates are no longer available in ThinkReservations. Choose different dates.",
    );
  }

  if (
    !thinkAvailabilityResponseHasMappedRoom({
      body: response.body,
      roomId: connection.external_calendar_id,
      roomTypeId: connection.external_room_type_id,
      uniquePhysicalRoom: true,
    })
  ) {
    // A successful but unfamiliar response must never be treated as available.
    // The exact-window inventory + blackout verification is safe because both
    // sources are fetched fresh and any failure bubbles up.
    return combinedSourcesSayAvailable();
  }

  return { connected: true as const, available: true as const, verifiedBy: "availabilities" as const };
}
