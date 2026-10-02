import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptPmsCredential } from "@/lib/integrations/credential-crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const THINKRESERVATIONS_BASE_URL = "https://api.thinkreservations.com";
const EMPTY_CONFIRMATION = "[PMS_EMPTY_CONFIRMATION]";
const MAX_WINDOW_DAYS = 30;
const DEFAULT_SYNC_LOOKBACK_DAYS = 45;
const MAX_BLACKOUT_FRAGMENT_GAP_DAYS = 7;
const MIN_AMBIGUOUS_GAP_DAYS = 2;
const MAX_AMBIGUOUS_GAP_DAYS = 5;
const GAP_PROBE_LOOKAHEAD_DAYS = 365;

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
  sourceKind: "inventory" | "blackout" | "reservation" | "availability";
  roomId: string | null;
  roomTypeId: string | null;
  metadata: Record<string, unknown>;
};

type BlackoutParseContext = {
  knownRoomIds?: string[];
  knownRoomTypeIds?: string[];
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

      if (
        ["true", "yes", "open", "available", "bookable", "active"].includes(
          normalized,
        )
      ) {
        return true;
      }

      if (
        [
          "false",
          "no",
          "closed",
          "unavailable",
          "sold_out",
          "sold out",
          "blocked",
          "inactive",
        ].includes(normalized)
      ) {
        return false;
      }
    }
  }

  return null;
}

function numberValue(object: JsonObject | null, ...keys: string[]) {
  if (!object) return null;

  for (const key of keys) {
    const value = object[key];

    if (typeof value === "number" && Number.isFinite(value)) return value;

    if (
      typeof value === "string" &&
      value.trim() &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }

  return null;
}

function arrayValue(object: JsonObject | null, ...keys: string[]) {
  if (!object) return null;

  for (const key of keys) {
    const value = object[key];
    if (Array.isArray(value)) return value;
  }

  return null;
}

function normalizedDate(value: unknown) {
  if (typeof value !== "string") return null;
  return value.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

function parseDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid calendar date: ${value}`);
  }

  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
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
  return Math.max(
    0,
    Math.round(
      (parseDate(end).getTime() - parseDate(start).getTime()) / 86_400_000,
    ),
  );
}

function utcTodayDate() {
  const now = new Date();
  return isoDate(
    new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ),
  );
}

function defaultWindow() {
  const configured = Number(process.env.PMS_SYNC_LOOKAHEAD_DAYS || "730");
  const lookahead =
    Number.isFinite(configured) && configured >= 30 && configured <= 1095
      ? Math.floor(configured)
      : 730;

  const configuredLookback = Number(
    process.env.PMS_SYNC_LOOKBACK_DAYS || String(DEFAULT_SYNC_LOOKBACK_DAYS),
  );
  const lookback =
    Number.isFinite(configuredLookback) &&
    configuredLookback >= 0 &&
    configuredLookback <= 120
      ? Math.floor(configuredLookback)
      : DEFAULT_SYNC_LOOKBACK_DAYS;

  const today = utcTodayDate();

  return {
    // Think can expose the two ends of an already-active stay as separate
    // dated fragments. A small lookback keeps enough context to reconstruct
    // a stay that began before today's cron run and also lets reconciliation
    // clean stale fragment rows from the current/previous month.
    startDate: addDays(today, -lookback),
    endDate: addDays(today, lookahead),
  };
}

function syncMode() {
  const raw = (process.env.THINK_SYNC_MODE || "current_api")
    .trim()
    .toLowerCase();

  return ["current_api", "current_api_shadow", "freeze_last_good"].includes(raw)
    ? raw
    : "current_api";
}

function responseMessage(body: unknown) {
  if (typeof body === "string" && body.trim()) {
    return body.trim().slice(0, 400);
  }

  const object = objectValue(body);

  return stringValue(
    object,
    "message",
    "error_description",
    "error",
    "detail",
  );
}

function redactBody(body: string) {
  return body
    .replace(/rk_[A-Za-z0-9_-]+/g, "[REDACTED_API_KEY]")
    .replace(
      /"?(email|phone|firstName|lastName|guestName|guest_name)"?\s*:\s*"[^"]*"/gi,
      '"$1":"[REDACTED]"',
    )
    .slice(0, 500);
}

async function thinkRequest(
  apiKey: string,
  path: string,
  query: Record<string, string> = {},
) {
  const url = new URL(path, THINKRESERVATIONS_BASE_URL);

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
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
      message: `ThinkReservations ${path} returned HTTP ${response.status}${
        detail ? `: ${detail}` : "."
      }`,
    });
  }

  return {
    body,
    status: response.status,
    requestId,
    contentType,
  };
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
    stringValue(
      object,
      "roomId",
      "room_id",
      "assignedRoomId",
      "assigned_room_id",
      "physicalRoomId",
      "physical_room_id",
    ) ||
    stringValue(
      objectValue(object.room ?? object.physicalRoom ?? object.physical_room),
      "id",
      "externalId",
      "external_id",
    )
  );
}

function roomTypeIdFrom(object: JsonObject | null) {
  if (!object) return null;

  return (
    stringValue(
      object,
      "roomTypeId",
      "room_type_id",
      "roomtypeId",
      "roomtype_id",
    ) ||
    stringValue(
      objectValue(object.roomType ?? object.room_type),
      "id",
      "externalId",
      "external_id",
    )
  );
}

function availabilityFrom(object: JsonObject | null) {
  if (!object) return null;

  const direct = booleanValue(
    object,
    "isAvailable",
    "is_available",
    "available",
    "bookable",
    "isBookable",
    "is_bookable",
  );

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

function directInventoryAvailability(
  object: JsonObject | null,
  hasOwnDate: boolean,
  hasOwnRoomType: boolean,
) {
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
  inherited: {
    date?: string | null;
    roomTypeId?: string | null;
  } = {},
  depth = 0,
): InventorySignal[] {
  if (depth > 10 || value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectInventorySignals(item, inherited, depth + 1),
    );
  }

  const object = objectValue(value);
  if (!object) return [];

  const ownRoomTypeId = roomTypeIdFrom(object);
  const roomTypeId = ownRoomTypeId ?? inherited.roomTypeId ?? null;

  const ownDate =
    normalizedDate(
      stringValue(
        object,
        "date",
        "inventoryDate",
        "inventory_date",
        "stayDate",
        "stay_date",
        "night",
      ),
    ) ?? null;

  const date = ownDate ?? inherited.date ?? null;

  const available = directInventoryAvailability(
    object,
    Boolean(ownDate),
    Boolean(ownRoomTypeId),
  );

  const output: InventorySignal[] = [];

  if (date && roomTypeId && available !== null) {
    output.push({
      date,
      roomTypeId,
      available,
    });
  }

  for (const [key, child] of Object.entries(object)) {
    if (
      [
        "room",
        "physicalRoom",
        "physical_room",
        "roomType",
        "room_type",
        "date",
        "inventoryDate",
        "inventory_date",
        "stayDate",
        "stay_date",
        "night",
      ].includes(key)
    ) {
      continue;
    }

    const dateKey = normalizedDate(key);

    output.push(
      ...collectInventorySignals(
        child,
        {
          date: dateKey ?? date,
          roomTypeId,
        },
        depth + 1,
      ),
    );
  }

  return output;
}

function uniqueInventorySignals(signals: InventorySignal[]) {
  const unique = new Map<string, InventorySignal>();

  for (const signal of signals) {
    unique.set(`${signal.date}|${signal.roomTypeId}`, signal);
  }

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
    const response = await thinkRequest(input.apiKey, path, {
      start_date: input.startDate,
      end_date: input.endDate,
    });

    return listPayload(response.body, [
      "inventory",
      "inventories",
      "dailyInventory",
      "daily_inventory",
      "availability",
      "availabilities",
      "data",
      "items",
      "results",
    ]);
  } catch (error) {
    const depth = input.depth ?? 0;
    const span = daysBetween(input.startDate, input.endDate);
    const retryable =
      error instanceof ThinkReservationsRequestError &&
      error.status !== null &&
      error.status >= 500 &&
      error.status <= 599;

    if (!retryable || span <= 7 || depth >= 8) throw error;

    const midpoint = addDays(
      input.startDate,
      Math.max(1, Math.floor(span / 2)),
    );

    if (midpoint === input.startDate || midpoint === input.endDate) {
      throw error;
    }

    const [left, right] = await Promise.all([
      fetchInventoryWindow({
        ...input,
        endDate: midpoint,
        depth: depth + 1,
      }),
      fetchInventoryWindow({
        ...input,
        startDate: midpoint,
        depth: depth + 1,
      }),
    ]);

    return [...left, ...right];
  }
}

async function fetchInventorySignals(input: {
  hotelId: string;
  apiKey: string;
  startDate: string;
  endDate: string;
}) {
  const raw: unknown[] = [];
  let cursor = input.startDate;

  while (cursor < input.endDate) {
    const remaining = daysBetween(cursor, input.endDate);
    const chunkEnd =
      remaining > MAX_WINDOW_DAYS
        ? addDays(cursor, MAX_WINDOW_DAYS)
        : input.endDate;

    raw.push(
      ...(await fetchInventoryWindow({
        ...input,
        startDate: cursor,
        endDate: chunkEnd,
      })),
    );

    cursor = chunkEnd;
  }

  const signals = uniqueInventorySignals(
    raw.flatMap((item) => collectInventorySignals(item)),
  ).filter(
    (signal) =>
      signal.date >= input.startDate &&
      signal.date < input.endDate,
  );

  if (!signals.length && raw.length) {
    throw new Error(
      "ThinkReservations inventory returned data in an unrecognized shape. Existing imported dates were preserved.",
    );
  }

  return signals;
}

export function mergeDateRanges(ranges: ThinkDateRange[]) {
  const sorted = ranges
    .filter((range) => range.end > range.start)
    .slice()
    .sort((a, b) =>
      a.start === b.start
        ? a.end.localeCompare(b.end)
        : a.start.localeCompare(b.start),
    );

  const merged: ThinkDateRange[] = [];

  for (const range of sorted) {
    const previous = merged[merged.length - 1];

    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
    } else if (range.end > previous.end) {
      previous.end = range.end;
    }
  }

  return merged;
}

function compressUnavailableDates(
  dates: string[],
  roomId: string,
  roomTypeId: string,
) {
  const ranges: ThinkDateRange[] = [];

  for (const date of [...new Set(dates)].sort()) {
    const previous = ranges[ranges.length - 1];

    if (previous && previous.end === date) {
      previous.end = addDays(date, 1);
    } else {
      ranges.push({
        start: date,
        end: addDays(date, 1),
      });
    }
  }

  return ranges.map<ThinkSourceBlock>((range) => ({
    key: `thinkres:inventory:${roomId}:${range.start}:${range.end}`,
    uid: `inventory:${roomId}:${range.start}:${range.end}`,
    start: range.start,
    end: range.end,
    sourceKind: "inventory",
    roomId,
    roomTypeId,
    metadata: {
      provider: "THINKRESERVATIONS",
      source_kind: "inventory",
      room_id: roomId,
      room_type_id: roomTypeId,
    },
  }));
}

function dateFrom(object: JsonObject | null, ...keys: string[]) {
  return normalizedDate(stringValue(object, ...keys));
}

function stringArrayValue(object: JsonObject | null, ...keys: string[]) {
  const raw = arrayValue(object, ...keys);
  if (!raw) return [];

  return raw
    .map((value) => {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }

      const nested = objectValue(value);
      return nested
        ? stringValue(nested, "id", "externalId", "external_id")
        : null;
    })
    .filter((value): value is string => Boolean(value));
}

function cancelledStatus(value: string | null) {
  if (!value) return false;

  const normalized = value
    .trim()
    .toUpperCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");

  return [
    "CANCELLED",
    "CANCELED",
    "VOID",
    "VOIDED",
    "DELETED",
    "INACTIVE",
  ].includes(normalized);
}

function blackoutInactive(object: JsonObject | null) {
  if (!object) return false;

  if (cancelledStatus(stringValue(object, "status", "state"))) return true;

  const active = booleanValue(object, "active", "isActive", "is_active");
  if (active === false) return true;

  const inactive = booleanValue(
    object,
    "inactive",
    "isInactive",
    "is_inactive",
  );

  return inactive === true;
}

function shapeSummary(value: unknown, depth = 0): string {
  if (depth > 3) return "…";
  if (value === null) return "null";

  if (Array.isArray(value)) {
    const sample = value.length ? shapeSummary(value[0], depth + 1) : "";
    return `array(${value.length})${sample ? `<${sample}>` : ""}`;
  }

  const object = objectValue(value);

  if (object) {
    const keys = Object.keys(object).slice(0, 12);
    const nested = keys
      .slice(0, 4)
      .map((key) => `${key}:${shapeSummary(object[key], depth + 1)}`)
      .join(",");

    return `object[${keys.join("|")}]${nested ? `{${nested}}` : ""}`;
  }

  return typeof value;
}

function stablePathId(path: string) {
  let hash = 2166136261;

  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function primitiveMeansBlocked(value: unknown) {
  if (value === true) return true;
  if (typeof value === "number") return value > 0;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return [
      "true",
      "blocked",
      "blackout",
      "unavailable",
      "closed",
      "yes",
      "1",
    ].includes(normalized);
  }

  return false;
}

function collectBlackoutBlocks(
  value: unknown,
  context: {
    knownRoomIds: Set<string>;
    knownRoomTypeIds: Set<string>;
  },
  inherited: {
    roomId?: string | null;
    roomTypeId?: string | null;
    start?: string | null;
    end?: string | null;
    sourceId?: string | null;
  } = {},
  path = "root",
  depth = 0,
): ThinkSourceBlock[] {
  if (depth > 12 || value === null || value === undefined) return [];

  if (!Array.isArray(value) && !objectValue(value)) {
    if (
      primitiveMeansBlocked(value) &&
      inherited.start &&
      inherited.end &&
      inherited.end > inherited.start
    ) {
      const id = inherited.sourceId || stablePathId(path);

      return [
        {
          key: `thinkres:blackout:${id}:${inherited.start}:${inherited.end}:${
            inherited.roomId || inherited.roomTypeId || "hotel"
          }`,
          uid: `blackout:${id}`,
          start: inherited.start,
          end: inherited.end,
          sourceKind: "blackout",
          roomId: inherited.roomId ?? null,
          roomTypeId: inherited.roomTypeId ?? null,
          metadata: {
            provider: "THINKRESERVATIONS",
            source_kind: "blackout",
            room_id: inherited.roomId ?? null,
            room_type_id: inherited.roomTypeId ?? null,
          },
        },
      ];
    }

    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectBlackoutBlocks(
        item,
        context,
        inherited,
        `${path}[${index}]`,
        depth + 1,
      ),
    );
  }

  const object = objectValue(value);
  if (!object || blackoutInactive(object)) return [];

  const objectId = stringValue(object, "id", "externalId", "external_id");
  const ownRoomId =
    roomIdFrom(object) ??
    (objectId && context.knownRoomIds.has(objectId) ? objectId : null);
  const ownRoomTypeId =
    roomTypeIdFrom(object) ??
    (objectId && context.knownRoomTypeIds.has(objectId) ? objectId : null);

  const roomId = ownRoomId ?? inherited.roomId ?? null;
  const roomTypeId = ownRoomTypeId ?? inherited.roomTypeId ?? null;

  const ownStart = dateFrom(
    object,
    "startDate",
    "start_date",
    "startOn",
    "start_on",
    "fromDate",
    "from_date",
    "from",
    "arrivalDate",
    "arrival_date",
    "arrivalOn",
    "arrival_on",
    "checkIn",
    "check_in",
    "stayDate",
    "stay_date",
    "night",
    "date",
  );

  let ownEnd = dateFrom(
    object,
    "endDate",
    "end_date",
    "endOn",
    "end_on",
    "toDate",
    "to_date",
    "to",
    "departureDate",
    "departure_date",
    "departureOn",
    "departure_on",
    "checkOut",
    "check_out",
  );

  if (
    ownStart &&
    !ownEnd &&
    normalizedDate(
      stringValue(
        object,
        "date",
        "stayDate",
        "stay_date",
        "night",
      ),
    )
  ) {
    ownEnd = addDays(ownStart, 1);
  }

  const start = ownStart ?? inherited.start ?? null;
  const end = ownEnd ?? inherited.end ?? null;
  const sourceId =
    stringValue(
      object,
      "id",
      "externalId",
      "external_id",
      "blackoutId",
      "blackout_id",
      "blockId",
      "block_id",
      "uid",
    ) ??
    inherited.sourceId ??
    null;

  const roomIds = [
    ...(ownRoomId ? [ownRoomId] : []),
    ...stringArrayValue(
      object,
      "roomIds",
      "room_ids",
      "physicalRoomIds",
      "physical_room_ids",
    ),
  ];

  const roomTypeIds = [
    ...(ownRoomTypeId ? [ownRoomTypeId] : []),
    ...stringArrayValue(
      object,
      "roomTypeIds",
      "room_type_ids",
      "roomTypes",
      "room_types",
    ),
  ];

  const output: ThinkSourceBlock[] = [];

  const nestedEntries = Object.entries(object).filter(
    ([key, child]) =>
      child !== null &&
      child !== undefined &&
      (Array.isArray(child) || Boolean(objectValue(child))) &&
      ![
        "room",
        "physicalRoom",
        "physical_room",
        "roomType",
        "room_type",
      ].includes(key),
  );

  const hasNestedContent = nestedEntries.length > 0;
  const hasScopedChildKeys = Object.keys(object).some(
    (key) =>
      Boolean(normalizedDate(key)) ||
      context.knownRoomIds.has(key) ||
      context.knownRoomTypeIds.has(key),
  );

  if (start && end && end > start) {
    const emittedRoomIds = [...new Set(roomIds.filter(Boolean))];
    const emittedRoomTypeIds = [...new Set(roomTypeIds.filter(Boolean))];

    if (emittedRoomIds.length) {
      for (const candidateRoomId of emittedRoomIds) {
        const id = sourceId || stablePathId(`${path}:${candidateRoomId}`);

        output.push({
          key: `thinkres:blackout:${id}:${start}:${end}:${candidateRoomId}`,
          uid: `blackout:${id}`,
          start,
          end,
          sourceKind: "blackout",
          roomId: candidateRoomId,
          roomTypeId,
          metadata: {
            provider: "THINKRESERVATIONS",
            source_kind: "blackout",
            room_id: candidateRoomId,
            room_type_id: roomTypeId,
          },
        });
      }
    } else if (emittedRoomTypeIds.length) {
      for (const candidateRoomTypeId of emittedRoomTypeIds) {
        const id = sourceId || stablePathId(`${path}:${candidateRoomTypeId}`);

        output.push({
          key: `thinkres:blackout:${id}:${start}:${end}:${candidateRoomTypeId}`,
          uid: `blackout:${id}`,
          start,
          end,
          sourceKind: "blackout",
          roomId,
          roomTypeId: candidateRoomTypeId,
          metadata: {
            provider: "THINKRESERVATIONS",
            source_kind: "blackout",
            room_id: roomId,
            room_type_id: candidateRoomTypeId,
          },
        });
      }
    } else if (
      (roomId || roomTypeId) ||
      (!hasNestedContent && !hasScopedChildKeys)
    ) {
      const id =
        sourceId ||
        stablePathId(`${path}:${roomId || roomTypeId || "hotel"}`);

      output.push({
        key: `thinkres:blackout:${id}:${start}:${end}:${
          roomId || roomTypeId || "hotel"
        }`,
        uid: `blackout:${id}`,
        start,
        end,
        sourceKind: "blackout",
        roomId,
        roomTypeId,
        metadata: {
          provider: "THINKRESERVATIONS",
          source_kind: "blackout",
          room_id: roomId,
          room_type_id: roomTypeId,
        },
      });
    }
  }

  for (const [key, child] of Object.entries(object)) {
    if (
      [
        "id",
        "externalId",
        "external_id",
        "blackoutId",
        "blackout_id",
        "blockId",
        "block_id",
        "uid",
        "status",
        "state",
        "active",
        "isActive",
        "is_active",
        "inactive",
        "isInactive",
        "is_inactive",
        "startDate",
        "start_date",
        "startOn",
        "start_on",
        "fromDate",
        "from_date",
        "from",
        "arrivalDate",
        "arrival_date",
        "arrivalOn",
        "arrival_on",
        "checkIn",
        "check_in",
        "endDate",
        "end_date",
        "endOn",
        "end_on",
        "toDate",
        "to_date",
        "to",
        "departureDate",
        "departure_date",
        "departureOn",
        "departure_on",
        "checkOut",
        "check_out",
        "date",
        "stayDate",
        "stay_date",
        "night",
        "roomId",
        "room_id",
        "assignedRoomId",
        "assigned_room_id",
        "physicalRoomId",
        "physical_room_id",
        "roomTypeId",
        "room_type_id",
        "roomtypeId",
        "roomtype_id",
        "roomIds",
        "room_ids",
        "physicalRoomIds",
        "physical_room_ids",
        "roomTypeIds",
        "room_type_ids",
      ].includes(key)
    ) {
      continue;
    }

    let childRoomId = roomId;
    let childRoomTypeId = roomTypeId;
    let childStart = start;
    let childEnd = end;

    const dateKey = normalizedDate(key);

    if (dateKey) {
      childStart = dateKey;
      childEnd = addDays(dateKey, 1);
    } else if (context.knownRoomIds.has(key)) {
      childRoomId = key;
    } else if (context.knownRoomTypeIds.has(key)) {
      childRoomTypeId = key;
    }

    output.push(
      ...collectBlackoutBlocks(
        child,
        context,
        {
          roomId: childRoomId,
          roomTypeId: childRoomTypeId,
          start: childStart,
          end: childEnd,
          sourceId,
        },
        `${path}.${key}`,
        depth + 1,
      ),
    );
  }

  return output;
}

function dedupeSourceBlocks(blocks: ThinkSourceBlock[]) {
  const unique = new Map<string, ThinkSourceBlock>();

  for (const block of blocks) {
    const identity = [
      block.sourceKind,
      block.start,
      block.end,
      block.roomId || "",
      block.roomTypeId || "",
    ].join("|");

    if (!unique.has(identity)) {
      unique.set(identity, block);
    }
  }

  return [...unique.values()];
}

function consolidateFragmentedSourceBlocks(
  blocks: ThinkSourceBlock[],
  maxGapDays = MAX_BLACKOUT_FRAGMENT_GAP_DAYS,
) {
  const passthrough: ThinkSourceBlock[] = [];
  const groups = new Map<string, ThinkSourceBlock[]>();

  for (const block of blocks) {
    if (block.sourceKind !== "blackout") {
      passthrough.push(block);
      continue;
    }

    const identity = [
      block.sourceKind,
      block.uid,
      block.roomId || "",
      block.roomTypeId || "",
    ].join("|");

    const group = groups.get(identity) ?? [];
    group.push(block);
    groups.set(identity, group);
  }

  const consolidated: ThinkSourceBlock[] = [];

  for (const group of groups.values()) {
    const sorted = group
      .slice()
      .sort((a, b) =>
        a.start === b.start
          ? a.end.localeCompare(b.end)
          : a.start.localeCompare(b.start),
      );

    let cluster: ThinkSourceBlock[] = [];

    const flush = () => {
      if (!cluster.length) return;

      const first = cluster[0];
      const start = cluster.reduce(
        (value, block) => (block.start < value ? block.start : value),
        first.start,
      );
      const end = cluster.reduce(
        (value, block) => (block.end > value ? block.end : value),
        first.end,
      );
      const scope = first.roomId || first.roomTypeId || "hotel";

      consolidated.push({
        ...first,
        key: `thinkres:blackout-span:${first.uid}:${start}:${end}:${scope}`,
        start,
        end,
        metadata: {
          ...first.metadata,
          normalized_fragment_count: cluster.length,
        },
      });

      cluster = [];
    };

    for (const block of sorted) {
      const clusterEnd = cluster.reduce<string | null>(
        (value, current) =>
          value === null || current.end > value ? current.end : value,
        null,
      );

      if (
        clusterEnd === null ||
        daysBetween(clusterEnd, block.start) <= maxGapDays
      ) {
        cluster.push(block);
      } else {
        flush();
        cluster.push(block);
      }
    }

    flush();
  }

  return dedupeSourceBlocks([...passthrough, ...consolidated]);
}

type AvailabilityEvidence = Map<string, Set<string>>;

function addEvidenceRange(
  evidence: AvailabilityEvidence,
  start: string,
  end: string,
  source: string,
  windowStart: string,
  windowEnd: string,
) {
  let cursor = start < windowStart ? windowStart : start;
  const clippedEnd = end > windowEnd ? windowEnd : end;

  while (cursor < clippedEnd) {
    const sources = evidence.get(cursor) ?? new Set<string>();
    sources.add(source);
    evidence.set(cursor, sources);
    cursor = addDays(cursor, 1);
  }
}

function evidenceRanges(evidence: AvailabilityEvidence) {
  const dates = [...evidence.keys()].sort();
  const ranges: Array<{ start: string; end: string }> = [];

  for (const date of dates) {
    const previous = ranges[ranges.length - 1];

    if (previous && previous.end === date) {
      previous.end = addDays(date, 1);
    } else {
      ranges.push({ start: date, end: addDays(date, 1) });
    }
  }

  return ranges;
}

function ambiguousGapRanges(
  evidence: AvailabilityEvidence,
  windowStart: string,
  windowEnd: string,
) {
  const ranges = evidenceRanges(evidence);
  if (!ranges.length) return [];

  const today = utcTodayDate();
  const probeStart = windowStart < today ? today : windowStart;
  const probeEnd =
    windowEnd < addDays(today, GAP_PROBE_LOOKAHEAD_DAYS)
      ? windowEnd
      : addDays(today, GAP_PROBE_LOOKAHEAD_DAYS);

  const candidates: Array<{ start: string; end: string }> = [];

  const maybeAdd = (start: string, end: string) => {
    const clippedStart = start < probeStart ? probeStart : start;
    const clippedEnd = end > probeEnd ? probeEnd : end;
    const length = daysBetween(clippedStart, clippedEnd);

    if (
      length >= MIN_AMBIGUOUS_GAP_DAYS &&
      length <= MAX_AMBIGUOUS_GAP_DAYS
    ) {
      candidates.push({ start: clippedStart, end: clippedEnd });
    }
  };

  // If today's sync begins inside a stay, the provider may only expose the
  // departure-side fragment. Probe only a short leading gap; long open spans
  // remain governed by the normal inventory/blackout sources.
  maybeAdd(probeStart, ranges[0].start);

  for (let index = 1; index < ranges.length; index += 1) {
    maybeAdd(ranges[index - 1].end, ranges[index].start);
  }

  return candidates;
}

async function mappedStayIsAvailable(input: {
  hotelId: string;
  apiKey: string;
  startDate: string;
  endDate: string;
  roomId: string;
  roomTypeId: string;
}) {
  const path = `/v1/hotels/${encodeURIComponent(
    input.hotelId,
  )}/availabilities`;

  const response = await thinkRequest(input.apiKey, path, {
    start_date: input.startDate,
    end_date: input.endDate,
    room_type_id: input.roomTypeId,
  });

  const items = listPayload(response.body, [
    "availabilities",
    "availability",
    "data",
    "items",
    "results",
  ]);

  if (!items.length) return false;

  return thinkAvailabilityResponseHasMappedRoom({
    body: response.body,
    roomId: input.roomId,
    roomTypeId: input.roomTypeId,
    uniquePhysicalRoom: true,
  });
}

async function closeAmbiguousAvailabilityGaps(input: {
  evidence: AvailabilityEvidence;
  hotelId: string;
  apiKey: string;
  roomId: string;
  roomTypeId: string;
  windowStart: string;
  windowEnd: string;
}) {
  const gaps = ambiguousGapRanges(
    input.evidence,
    input.windowStart,
    input.windowEnd,
  );

  let verifiedUnavailableGaps = 0;

  // These are only short gaps between provider-derived blocked ranges. One
  // availability search per gap keeps API volume low while resolving the
  // exact holes the inventory/blackout feeds can leave behind.
  for (const gap of gaps) {
    const available = await mappedStayIsAvailable({
      hotelId: input.hotelId,
      apiKey: input.apiKey,
      startDate: gap.start,
      endDate: gap.end,
      roomId: input.roomId,
      roomTypeId: input.roomTypeId,
    });

    if (!available) {
      addEvidenceRange(
        input.evidence,
        gap.start,
        gap.end,
        "live_availability",
        input.windowStart,
        input.windowEnd,
      );
      verifiedUnavailableGaps += 1;
    }
  }

  return {
    checked: gaps.length,
    unavailable: verifiedUnavailableGaps,
  };
}

function canonicalAvailabilityBlocks(input: {
  evidence: AvailabilityEvidence;
  roomId: string;
  roomTypeId: string;
}) {
  return evidenceRanges(input.evidence).map<ThinkSourceBlock>((range) => {
    const sources = new Set<string>();
    let cursor = range.start;

    while (cursor < range.end) {
      for (const source of input.evidence.get(cursor) ?? []) {
        sources.add(source);
      }
      cursor = addDays(cursor, 1);
    }

    return {
      key: `thinkres:availability:${input.roomId}:${range.start}:${range.end}`,
      uid: `availability:${input.roomId}:${range.start}:${range.end}`,
      start: range.start,
      end: range.end,
      sourceKind: "availability",
      roomId: input.roomId,
      roomTypeId: input.roomTypeId,
      metadata: {
        provider: "THINKRESERVATIONS",
        source_kind: "availability",
        evidence_sources: [...sources].sort(),
        room_id: input.roomId,
        room_type_id: input.roomTypeId,
      },
    };
  });
}

function containsActiveDatedBlackoutCandidate(
  value: unknown,
  depth = 0,
): boolean {
  if (depth > 12 || value === null || value === undefined) return false;

  if (Array.isArray(value)) {
    return value.some((item) =>
      containsActiveDatedBlackoutCandidate(item, depth + 1),
    );
  }

  const object = objectValue(value);
  if (!object || blackoutInactive(object)) return false;

  if (
    dateFrom(
      object,
      "startDate",
      "start_date",
      "startOn",
      "start_on",
      "fromDate",
      "from_date",
      "from",
      "arrivalDate",
      "arrival_date",
      "arrivalOn",
      "arrival_on",
      "checkIn",
      "check_in",
      "stayDate",
      "stay_date",
      "night",
      "date",
      "endDate",
      "end_date",
      "endOn",
      "end_on",
      "toDate",
      "to_date",
      "to",
      "departureDate",
      "departure_date",
      "departureOn",
      "departure_on",
      "checkOut",
      "check_out",
    )
  ) {
    return true;
  }

  for (const [key, child] of Object.entries(object)) {
    if (normalizedDate(key)) return true;
    if (containsActiveDatedBlackoutCandidate(child, depth + 1)) return true;
  }

  return false;
}

export function parseThinkBlackoutBlocks(
  body: unknown,
  parseContext: BlackoutParseContext = {},
): ThinkSourceBlock[] {
  const context = {
    knownRoomIds: new Set(parseContext.knownRoomIds ?? []),
    knownRoomTypeIds: new Set(parseContext.knownRoomTypeIds ?? []),
  };

  const blocks = dedupeSourceBlocks(
    collectBlackoutBlocks(body, context),
  );

  if (blocks.length) return blocks;

  const serialized = (() => {
    try {
      return JSON.stringify(body);
    } catch {
      return "";
    }
  })();

  const containsDate = /\d{4}-\d{2}-\d{2}/.test(serialized);
  const containsActiveDate = containsActiveDatedBlackoutCandidate(body);

  // A response containing only explicitly cancelled/inactive dated records is
  // a valid empty blackout result, not a schema failure.
  if (containsDate && !containsActiveDate) return [];

  const candidateItems = listPayload(body, [
    "blackouts",
    "blocks",
    "availabilityBlocks",
    "availability_blocks",
    "data",
    "items",
    "results",
    "rooms",
    "roomTypes",
    "room_types",
  ]);

  const appearsNonEmpty =
    candidateItems.length > 1 ||
    (candidateItems.length === 1 &&
      candidateItems[0] !== body) ||
    containsDate;

  if (appearsNonEmpty) {
    throw new Error(
      `ThinkReservations blackout data could not be normalized safely (${shapeSummary(
        body,
      )}). Existing imported dates were preserved.`,
    );
  }

  return [];
}

async function fetchBlackoutBlocks(input: {
  hotelId: string;
  apiKey: string;
  startDate: string;
  endDate: string;
  knownRoomIds: string[];
  knownRoomTypeIds: string[];
}) {
  const path = `/v1/hotels/${encodeURIComponent(input.hotelId)}/blackouts`;
  const all: ThinkSourceBlock[] = [];

  let cursor = input.startDate;

  while (cursor < input.endDate) {
    const remaining = daysBetween(cursor, input.endDate);
    const chunkEnd =
      remaining > MAX_WINDOW_DAYS
        ? addDays(cursor, MAX_WINDOW_DAYS)
        : input.endDate;

    const response = await thinkRequest(input.apiKey, path, {
      start_date: cursor,
      end_date: chunkEnd,
    });

    all.push(
      ...parseThinkBlackoutBlocks(response.body, {
        knownRoomIds: input.knownRoomIds,
        knownRoomTypeIds: input.knownRoomTypeIds,
      }),
    );

    cursor = chunkEnd;
  }

  return consolidateFragmentedSourceBlocks(
    dedupeSourceBlocks(all).filter(
      (block) =>
        block.start < input.endDate &&
        block.end > input.startDate,
    ),
  );
}

function collectReservationBlocks(
  value: unknown,
  inherited: {
    reservationId?: string | null;
    status?: string | null;
    roomId?: string | null;
    roomTypeId?: string | null;
    start?: string | null;
    end?: string | null;
  } = {},
  path = "root",
  depth = 0,
): ThinkSourceBlock[] {
  if (depth > 12 || value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectReservationBlocks(
        item,
        inherited,
        `${path}[${index}]`,
        depth + 1,
      ),
    );
  }

  const object = objectValue(value);
  if (!object) return [];

  const status =
    stringValue(object, "status", "state") ??
    inherited.status ??
    null;

  if (cancelledStatus(status)) return [];

  const reservationId =
    stringValue(
      object,
      "reservationId",
      "reservation_id",
    ) ??
    inherited.reservationId ??
    null;

  const ownId = stringValue(
    object,
    "id",
    "externalId",
    "external_id",
    "bookingId",
    "booking_id",
  );

  const roomId = roomIdFrom(object) ?? inherited.roomId ?? null;
  const roomTypeId =
    roomTypeIdFrom(object) ?? inherited.roomTypeId ?? null;

  const start =
    dateFrom(
      object,
      "startDate",
      "start_date",
      "arrivalDate",
      "arrival_date",
      "arrivalOn",
      "arrival_on",
      "checkIn",
      "check_in",
      "arrival",
    ) ??
    inherited.start ??
    null;

  const end =
    dateFrom(
      object,
      "endDate",
      "end_date",
      "departureDate",
      "departure_date",
      "departureOn",
      "departure_on",
      "checkOut",
      "check_out",
      "departure",
    ) ??
    inherited.end ??
    null;

  const nextReservationId =
    reservationId ??
    (path.split(".").length <= 3 ? ownId : null) ??
    inherited.reservationId ??
    null;

  const output: ThinkSourceBlock[] = [];

  if (start && end && end > start && (roomId || roomTypeId)) {
    const blockId =
      ownId ??
      nextReservationId ??
      stablePathId(`${path}:${start}:${end}`);

    output.push({
      key: `thinkres:reservation:${
        nextReservationId || blockId
      }:${blockId}:${start}:${end}`,
      uid: blockId,
      start,
      end,
      sourceKind: "reservation",
      roomId,
      roomTypeId,
      metadata: {
        provider: "THINKRESERVATIONS",
        source_kind: "reservation",
        reservation_id: nextReservationId,
        room_id: roomId,
        room_type_id: roomTypeId,
      },
    });
  }

  for (const [key, child] of Object.entries(object)) {
    if (
      [
        "status",
        "state",
        "reservationId",
        "reservation_id",
        "id",
        "externalId",
        "external_id",
        "bookingId",
        "booking_id",
        "startDate",
        "start_date",
        "arrivalDate",
        "arrival_date",
        "arrivalOn",
        "arrival_on",
        "checkIn",
        "check_in",
        "arrival",
        "endDate",
        "end_date",
        "departureDate",
        "departure_date",
        "departureOn",
        "departure_on",
        "checkOut",
        "check_out",
        "departure",
        "roomId",
        "room_id",
        "assignedRoomId",
        "assigned_room_id",
        "physicalRoomId",
        "physical_room_id",
        "roomTypeId",
        "room_type_id",
        "roomtypeId",
        "roomtype_id",
        "room",
        "physicalRoom",
        "physical_room",
        "roomType",
        "room_type",
      ].includes(key)
    ) {
      continue;
    }

    output.push(
      ...collectReservationBlocks(
        child,
        {
          reservationId: nextReservationId,
          status,
          roomId,
          roomTypeId,
          start,
          end,
        },
        `${path}.${key}`,
        depth + 1,
      ),
    );
  }

  return output;
}

function parseThinkReservationBlocks(body: unknown) {
  const blocks = dedupeSourceBlocks(
    collectReservationBlocks(body),
  );

  if (blocks.length) return blocks;

  const items = listPayload(body, [
    "reservations",
    "data",
    "items",
    "results",
  ]);

  if (!items.length) return [];

  const serialized = (() => {
    try {
      return JSON.stringify(body);
    } catch {
      return "";
    }
  })();

  if (/\d{4}-\d{2}-\d{2}/.test(serialized)) {
    throw new Error(
      `ThinkReservations reservation data could not be normalized safely (${shapeSummary(
        body,
      )}).`,
    );
  }

  return [];
}

async function fetchReservationBlocksBestEffort(input: {
  hotelId: string;
  apiKey: string;
  startDate: string;
  endDate: string;
}) {
  const path = `/v1/hotels/${encodeURIComponent(
    input.hotelId,
  )}/reservations`;

  let firstError: unknown = null;

  try {
    const response = await thinkRequest(input.apiKey, path, {
      start_date: input.startDate,
      end_date: input.endDate,
    });

    return {
      blocks: parseThinkReservationBlocks(response.body).filter(
        (block) =>
          block.start < input.endDate &&
          block.end > input.startDate,
      ),
      warning: null as string | null,
    };
  } catch (error) {
    firstError = error;
  }

  try {
    const response = await thinkRequest(input.apiKey, path);

    return {
      blocks: parseThinkReservationBlocks(response.body).filter(
        (block) =>
          block.start < input.endDate &&
          block.end > input.startDate,
      ),
      warning: null as string | null,
    };
  } catch (error) {
    const message = diagnosticMessage(error || firstError);

    return {
      blocks: [] as ThinkSourceBlock[],
      warning: `ThinkReservations reservation enrichment unavailable: ${message}`.slice(
        0,
        1000,
      ),
    };
  }
}

function roomsForRoomType(
  resourceCache: unknown,
  roomTypeId: string | null,
) {
  if (!roomTypeId) return [];

  const cache = objectValue(resourceCache);
  const rooms = Array.isArray(cache?.rooms) ? cache.rooms : [];

  return rooms
    .map(objectValue)
    .filter((room): room is JsonObject => Boolean(room))
    .filter((room) => roomTypeIdFrom(room) === roomTypeId);
}

function cachedProviderIds(resourceCache: unknown) {
  const cache = objectValue(resourceCache);

  const rooms = Array.isArray(cache?.rooms)
    ? cache.rooms.map(objectValue).filter(Boolean)
    : [];

  const roomTypes = Array.isArray(cache?.roomTypes)
    ? cache.roomTypes.map(objectValue).filter(Boolean)
    : [];

  return {
    roomIds: rooms
      .map((room) =>
        stringValue(room as JsonObject, "id", "externalId", "external_id"),
      )
      .filter((value): value is string => Boolean(value)),
    roomTypeIds: roomTypes
      .map((roomType) =>
        stringValue(
          roomType as JsonObject,
          "id",
          "externalId",
          "external_id",
        ),
      )
      .filter((value): value is string => Boolean(value)),
  };
}

function sourceApplies(
  block: ThinkSourceBlock,
  roomId: string,
  roomTypeId: string,
  uniquePhysicalRoom: boolean,
) {
  if (block.roomId) return block.roomId === roomId;

  if (block.roomTypeId) {
    return uniquePhysicalRoom && block.roomTypeId === roomTypeId;
  }

  return true;
}

async function existingSourceBlocks(
  admin: SupabaseClient,
  connectionId: string,
  startDate: string,
  endDate: string,
  sourceKind: string,
) {
  const { data, error } = await admin
    .from("availability_blocks")
    .select(
      "external_event_key,external_uid,start_date,end_date,metadata",
    )
    .eq("connection_id", connectionId)
    .eq("block_type", "EXTERNAL_BLOCK")
    .eq("state", "ACTIVE")
    .lt("start_date", endDate)
    .gt("end_date", startDate);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Array<{
    external_event_key: string | null;
    external_uid: string | null;
    start_date: string | null;
    end_date: string | null;
    metadata: unknown;
  }>;

  return rows
    .filter((row) => {
      const metadata =
        row.metadata &&
        typeof row.metadata === "object" &&
        !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};

      return metadata.source_kind === sourceKind;
    })
    .filter(
      (row) =>
        row.external_event_key &&
        row.external_uid &&
        row.start_date &&
        row.end_date,
    )
    .map((row) => ({
      key: String(row.external_event_key),
      uid: String(row.external_uid),
      start: String(row.start_date),
      end: String(row.end_date),
      metadata:
        row.metadata &&
        typeof row.metadata === "object" &&
        !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {
              provider: "THINKRESERVATIONS",
              source_kind: sourceKind,
            },
    }));
}

async function emptyResultMayClear(
  admin: SupabaseClient,
  connectionId: string,
  startDate: string,
  endDate: string,
) {
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
      .order("completed_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle(),
  ]);

  if (activeBlocks.error) {
    throw new Error(activeBlocks.error.message);
  }

  if (!activeBlocks.count) return true;

  const previous = latestRun.data;
  const previousAt = previous?.completed_at
    ? new Date(previous.completed_at).getTime()
    : 0;
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
      `${EMPTY_CONFIRMATION} ThinkReservations returned no blocked dates while imported dates still exist. ` +
      "Existing dates were preserved; a second empty result after five minutes is required before clearing them.",
  });

  return false;
}

async function loadThinkConnection(
  admin: SupabaseClient,
  connectionId: string,
) {
  const { data: connection, error: connectionError } = await admin
    .from("calendar_connections")
    .select(
      "id,unit_id,provider,connection_kind,is_active,pms_integration_id,external_calendar_id,external_room_type_id",
    )
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
    throw new Error(
      "ThinkReservations calendar mapping is incomplete.",
    );
  }

  const { data: integration, error: integrationError } = await admin
    .from("pms_integrations")
    .select(
      "id,external_account_id,credential_ciphertext,status,resource_cache",
    )
    .eq("id", connection.pms_integration_id)
    .eq("provider", "THINKRESERVATIONS")
    .maybeSingle();

  if (
    integrationError ||
    !integration ||
    !["CONNECTED", "ERROR"].includes(integration.status)
  ) {
    throw new Error(
      "ThinkReservations account connection is unavailable.",
    );
  }

  return {
    connection,
    integration,
  };
}

async function markIntegration(
  admin: SupabaseClient,
  integrationId: string,
  ok: boolean,
  message?: string | null,
) {
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
  requestedWindow?: {
    startDate: string;
    endDate: string;
  },
) {
  const admin = suppliedAdmin ?? createAdminClient();
  const window = requestedWindow ?? defaultWindow();

  let integrationId: string | null = null;
  let errorAlreadyRecorded = false;

  try {
    const { connection, integration } =
      await loadThinkConnection(admin, connectionId);

    integrationId = integration.id;

    const apiKey = decryptPmsCredential(
      integration.credential_ciphertext,
    );

    const sameTypeRooms = roomsForRoomType(
      integration.resource_cache,
      connection.external_room_type_id,
    );

    if (sameTypeRooms.length !== 1) {
      throw new Error(
        `ThinkReservations room type maps to ${sameTypeRooms.length} physical rooms. Existing dates were preserved rather than mixing cabins.`,
      );
    }

    const providerIds = cachedProviderIds(
      integration.resource_cache,
    );

    const [inventorySignals, blackoutBlocks, reservationResult] =
      await Promise.all([
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
          knownRoomIds: providerIds.roomIds,
          knownRoomTypeIds: providerIds.roomTypeIds,
        }),
        fetchReservationBlocksBestEffort({
          hotelId: integration.external_account_id,
          apiKey,
          startDate: window.startDate,
          endDate: window.endDate,
        }),
      ]);

    const applicableInventory = inventorySignals.filter(
      (signal) =>
        signal.roomTypeId === connection.external_room_type_id,
    );

    if (!applicableInventory.length && inventorySignals.length) {
      throw new Error(
        "ThinkReservations inventory returned data, but none matched this cabin's exact room type. Existing dates were preserved.",
      );
    }

    const inventoryBlocks = compressUnavailableDates(
      applicableInventory
        .filter((signal) => !signal.available)
        .map((signal) => signal.date),
      connection.external_calendar_id,
      connection.external_room_type_id,
    );

    const mappedBlackouts = blackoutBlocks
      .filter((block) =>
        sourceApplies(
          block,
          connection.external_calendar_id,
          connection.external_room_type_id,
          true,
        ),
      )
      .map((block) => ({
        ...block,
        metadata: {
          ...block.metadata,
          mapped_room_id: connection.external_calendar_id,
          mapped_room_type_id:
            connection.external_room_type_id,
        },
      }));

    let mappedReservations = reservationResult.blocks
      .filter((block) =>
        sourceApplies(
          block,
          connection.external_calendar_id,
          connection.external_room_type_id,
          true,
        ),
      )
      .map((block) => ({
        ...block,
        metadata: {
          ...block.metadata,
          mapped_room_id: connection.external_calendar_id,
          mapped_room_type_id:
            connection.external_room_type_id,
        },
      }));

    let preservedReservationBlocks: Array<{
      key: string;
      uid: string;
      start: string;
      end: string;
      metadata: Record<string, unknown>;
    }> = [];

    if (reservationResult.warning) {
      preservedReservationBlocks = await existingSourceBlocks(
        admin,
        connection.id,
        window.startDate,
        window.endDate,
        "reservation",
      );
      mappedReservations = [];
    }

    const evidence: AvailabilityEvidence = new Map();

    for (const block of inventoryBlocks) {
      addEvidenceRange(
        evidence,
        block.start,
        block.end,
        "inventory",
        window.startDate,
        window.endDate,
      );
    }

    for (const block of mappedBlackouts) {
      addEvidenceRange(
        evidence,
        block.start,
        block.end,
        "blackout",
        window.startDate,
        window.endDate,
      );
    }

    for (const block of mappedReservations) {
      addEvidenceRange(
        evidence,
        block.start,
        block.end,
        "reservation",
        window.startDate,
        window.endDate,
      );
    }

    for (const block of preservedReservationBlocks) {
      addEvidenceRange(
        evidence,
        block.start,
        block.end,
        "reservation_preserved",
        window.startDate,
        window.endDate,
      );
    }

    const gapVerification = await closeAmbiguousAvailabilityGaps({
      evidence,
      hotelId: integration.external_account_id,
      apiKey,
      roomId: connection.external_calendar_id,
      roomTypeId: connection.external_room_type_id,
      windowStart: window.startDate,
      windowEnd: window.endDate,
    });

    // Reconcile one canonical set of unavailable ranges. Inventory, blackout
    // fragments and live availability are evidence for the same final calendar
    // state; writing each source separately is what produced duplicate/striped
    // blocks in the host calendar.
    const mappedBlocks = canonicalAvailabilityBlocks({
      evidence,
      roomId: connection.external_calendar_id,
      roomTypeId: connection.external_room_type_id,
    }).map((block) => ({
      key: block.key,
      uid: block.uid,
      start: block.start,
      end: block.end,
      metadata: block.metadata,
    }));

    const mode = syncMode();

    if (mode === "freeze_last_good") {
      return {
        id: connection.id,
        provider: "THINKRESERVATIONS",
        ok: true as const,
        imported: 0,
        deactivated: 0,
        frozen: true as const,
      };
    }

    if (mode === "current_api_shadow") {
      console.info("[ThinkReservations current API shadow]", {
        connectionId: connection.id,
        unitId: connection.unit_id,
        startDate: window.startDate,
        endDate: window.endDate,
        inventoryBlocks: inventoryBlocks.length,
        blackoutBlocks: mappedBlackouts.length,
        reservationBlocks: mappedReservations.length,
        preservedReservationBlocks:
          preservedReservationBlocks.length,
        canonicalBlocks: mappedBlocks.length,
        gapChecks: gapVerification.checked,
        gapUnavailable: gapVerification.unavailable,
        reservationWarning: reservationResult.warning,
      });

      return {
        id: connection.id,
        provider: "THINKRESERVATIONS",
        ok: true as const,
        imported: 0,
        deactivated: 0,
        shadow: true as const,
      };
    }

    if (!mappedBlocks.length) {
      const mayClear = await emptyResultMayClear(
        admin,
        connection.id,
        window.startDate,
        window.endDate,
      );

      if (!mayClear) {
        errorAlreadyRecorded = true;

        throw new Error(
          "ThinkReservations returned an unexpected empty availability result. Existing imported dates were preserved.",
        );
      }
    }

    const { data, error } = await admin.rpc(
      "service_apply_pms_sync",
      {
        target_connection_id: connection.id,
        source_blocks: mappedBlocks,
        sync_window_start: window.startDate,
        sync_window_end: window.endDate,
      },
    );

    if (error) throw new Error(error.message);

    await markIntegration(
      admin,
      integration.id,
      true,
      reservationResult.warning
        ? `[RESERVATION_ENRICHMENT_DEGRADED] ${reservationResult.warning}`
        : null,
    );

    const result = (data ?? {}) as {
      imported_count?: number;
      deactivated_count?: number;
    };

    return {
      id: connection.id,
      provider: "THINKRESERVATIONS",
      ok: true as const,
      imported:
        result.imported_count ?? mappedBlocks.length,
      deactivated: result.deactivated_count ?? 0,
      inventoryBlocks: inventoryBlocks.length,
      blackoutBlocks: mappedBlackouts.length,
      reservationBlocks: mappedReservations.length,
      canonicalBlocks: mappedBlocks.length,
      gapChecks: gapVerification.checked,
      gapUnavailable: gapVerification.unavailable,
      reservationWarning: reservationResult.warning,
    };
  } catch (error) {
    const message = diagnosticMessage(error);

    if (!errorAlreadyRecorded) {
      await admin.rpc("service_mark_calendar_sync_error", {
        target_connection_id: connectionId,
        error_message: message.slice(0, 1000),
      });
    }

    if (integrationId) {
      await markIntegration(
        admin,
        integrationId,
        false,
        message,
      );
    }

    return {
      id: connectionId,
      provider: "THINKRESERVATIONS",
      ok: false as const,
      error: message.slice(0, 240),
    };
  }
}

function responseContainsMappedAvailability(
  value: unknown,
  mappedRoomId: string,
  mappedRoomTypeId: string,
  uniquePhysicalRoom: boolean,
  depth = 0,
): boolean {
  if (depth > 10 || value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) =>
      responseContainsMappedAvailability(
        item,
        mappedRoomId,
        mappedRoomTypeId,
        uniquePhysicalRoom,
        depth + 1,
      ),
    );
  }

  const object = objectValue(value);
  if (!object) return false;

  const roomId = roomIdFrom(object);
  const roomTypeId = roomTypeIdFrom(object);
  const explicitAvailability = availabilityFrom(object);
  const booking = objectValue(object.booking);
  const bookingRoomId = roomIdFrom(booking);
  const bookingRoomTypeId = roomTypeIdFrom(booking);

  const exactRoomMatch =
    roomId === mappedRoomId ||
    bookingRoomId === mappedRoomId;

  const typeMatch =
    uniquePhysicalRoom &&
    (roomTypeId === mappedRoomTypeId ||
      bookingRoomTypeId === mappedRoomTypeId);

  if (exactRoomMatch || typeMatch) {
    if (explicitAvailability === false) return false;
    return true;
  }

  for (const child of Object.values(object)) {
    if (
      responseContainsMappedAvailability(
        child,
        mappedRoomId,
        mappedRoomTypeId,
        uniquePhysicalRoom,
        depth + 1,
      )
    ) {
      return true;
    }
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
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) ||
    checkOut <= checkIn
  ) {
    throw new Error(
      "The requested ThinkReservations stay dates are invalid.",
    );
  }

  const admin = suppliedAdmin ?? createAdminClient();

  const { data: connection, error: connectionError } =
    await admin
      .from("calendar_connections")
      .select(
        "id,pms_integration_id,external_calendar_id,external_room_type_id,is_active",
      )
      .eq("unit_id", unitId)
      .eq("provider", "THINKRESERVATIONS")
      .eq("connection_kind", "PMS_API")
      .eq("is_active", true)
      .maybeSingle();

  if (connectionError) {
    throw new Error(
      "ThinkReservations availability could not be verified.",
    );
  }

  if (!connection) {
    return {
      connected: false as const,
    };
  }

  if (
    !connection.pms_integration_id ||
    !connection.external_calendar_id ||
    !connection.external_room_type_id
  ) {
    throw new Error(
      "ThinkReservations room mapping is incomplete.",
    );
  }

  const { data: integration, error: integrationError } =
    await admin
      .from("pms_integrations")
      .select(
        "external_account_id,credential_ciphertext,status,resource_cache",
      )
      .eq("id", connection.pms_integration_id)
      .eq("provider", "THINKRESERVATIONS")
      .maybeSingle();

  if (
    integrationError ||
    !integration ||
    !["CONNECTED", "ERROR"].includes(integration.status)
  ) {
    throw new Error(
      "ThinkReservations availability could not be verified.",
    );
  }

  const sameTypeRooms = roomsForRoomType(
    integration.resource_cache,
    connection.external_room_type_id,
  );

  if (sameTypeRooms.length !== 1) {
    throw new Error(
      "ThinkReservations live availability cannot safely identify this physical cabin from its room type.",
    );
  }

  const providerIds = cachedProviderIds(
    integration.resource_cache,
  );

  const apiKey = decryptPmsCredential(
    integration.credential_ciphertext,
  );

  const path = `/v1/hotels/${encodeURIComponent(
    integration.external_account_id,
  )}/availabilities`;

  const combinedSourcesSayAvailable = async () => {
    const [inventorySignals, blackoutBlocks] =
      await Promise.all([
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
          knownRoomIds: providerIds.roomIds,
          knownRoomTypeIds: providerIds.roomTypeIds,
        }),
      ]);

    const inventoryBlocked = inventorySignals.some(
      (signal) =>
        signal.roomTypeId ===
          connection.external_room_type_id &&
        !signal.available &&
        signal.date >= checkIn &&
        signal.date < checkOut,
    );

    const blackoutBlocked = blackoutBlocks.some(
      (block) =>
        sourceApplies(
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

    return {
      connected: true as const,
      available: true as const,
      verifiedBy: "inventory+blackouts" as const,
    };
  };

  let response: Awaited<ReturnType<typeof thinkRequest>>;

  try {
    response = await thinkRequest(apiKey, path, {
      start_date: checkIn,
      end_date: checkOut,
      room_type_id: connection.external_room_type_id,
    });
  } catch (error) {
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
    return combinedSourcesSayAvailable();
  }

  return {
    connected: true as const,
    available: true as const,
    verifiedBy: "availabilities" as const,
  };
}
