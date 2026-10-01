import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptPmsCredential } from "@/lib/integrations/credential-crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const THINKRESERVATIONS_BASE_URL = "https://api.thinkreservations.com";
const EMPTY_CONFIRMATION = "[PMS_EMPTY_CONFIRMATION]";

type JsonObject = Record<string, unknown>;

type InventorySignal = {
  date: string;
  roomId: string | null;
  roomTypeId: string | null;
  available: boolean;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid calendar date: ${value}`);
  return new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    ),
  );
}

function nextDate(value: string) {
  return isoDate(addDays(parseDate(value), 1));
}

function daysBetween(start: string, end: string) {
  return Math.max(
    0,
    Math.round(
      (parseDate(end).getTime() - parseDate(start).getTime()) /
        86_400_000,
    ),
  );
}

function defaultWindow() {
  const lookaheadRaw = Number(process.env.PMS_SYNC_LOOKAHEAD_DAYS || "730");
  const lookahead =
    Number.isFinite(lookaheadRaw) && lookaheadRaw >= 30 && lookaheadRaw <= 1095
      ? Math.floor(lookaheadRaw)
      : 730;
  const today = new Date();
  const utcToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );

  return {
    startDate: isoDate(addDays(utcToday, -1)),
    endDate: isoDate(addDays(utcToday, lookahead)),
  };
}

function objectValue(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function stringValue(
  object: JsonObject | null,
  ...keys: string[]
): string | null {
  if (!object) return null;

  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function booleanValue(
  object: JsonObject | null,
  ...keys: string[]
): boolean | null {
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
      if (["true", "yes", "open", "available"].includes(normalized)) {
        return true;
      }
      if (
        ["false", "no", "closed", "unavailable", "sold_out", "sold out"].includes(
          normalized,
        )
      ) {
        return false;
      }
    }
  }

  return null;
}

function numberValue(
  object: JsonObject | null,
  ...keys: string[]
): number | null {
  if (!object) return null;

  for (const key of keys) {
    const value = object[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

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

function normalizedDate(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function responseMessage(body: unknown) {
  if (typeof body === "string" && body.trim()) {
    return body.trim().slice(0, 400);
  }

  const object = objectValue(body);
  return (
    stringValue(object, "message", "error_description", "error", "detail") ||
    null
  );
}

async function thinkRequest(
  apiKey: string,
  path: string,
  query: Record<string, string>,
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
    throw new Error(
      error instanceof Error
        ? `ThinkReservations inventory request could not be reached: ${error.message}`
        : "ThinkReservations inventory request could not be reached.",
    );
  }

  const raw = await response.text();
  let body: unknown = null;

  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw.slice(0, 500);
    }
  }

  if (!response.ok) {
    const detail = responseMessage(body);
    throw new Error(
      `ThinkReservations ${path} returned HTTP ${response.status}${
        detail ? `: ${detail}` : "."
      }`,
    );
  }

  return body;
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
    ) ||
    stringValue(
      objectValue(object.room),
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

  if (availableCount !== null) return availableCount > 0;

  return null;
}

function listPayload(body: unknown) {
  if (Array.isArray(body)) return body;

  const object = objectValue(body);
  if (!object) return [];

  for (const key of [
    "inventory",
    "inventories",
    "dailyInventory",
    "daily_inventory",
    "availability",
    "availabilities",
    "data",
    "items",
    "results",
  ]) {
    const candidate = object[key];
    if (Array.isArray(candidate)) return candidate;
  }

  return [body];
}

function directRoomTypeId(object: JsonObject | null) {
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

function directInventoryAvailability(
  object: JsonObject | null,
  hasOwnDate: boolean,
  hasOwnRoomType: boolean,
) {
  const explicit = availabilityFrom(object);
  if (explicit !== null) return explicit;

  /*
    Only interpret a bare numeric "inventory" value on a leaf that owns its
    own roomTypeId and date. Never inherit that value from a hotel-level,
    room-list, or another cabin's container.
  */
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
  if (depth > 8 || value === null || value === undefined) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectInventorySignals(item, inherited, depth + 1),
    );
  }

  const object = objectValue(value);
  if (!object) return [];

  const ownRoomTypeId = directRoomTypeId(object);
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

  /*
    ThinkReservations inventory is treated as room-type scoped. Do not attach
    a physical roomId discovered somewhere else in the response tree.
  */
  if (date && roomTypeId && available !== null) {
    output.push({
      date,
      roomId: null,
      roomTypeId,
      available,
    });
  }

  for (const [key, child] of Object.entries(object)) {
    if (
      [
        "room",
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

function topLevelShape(body: unknown) {
  if (Array.isArray(body)) {
    const sample = objectValue(body[0]);
    return sample
      ? `array[${body.length}] keys=${Object.keys(sample)
          .slice(0, 20)
          .join(",")}`
      : `array[${body.length}]`;
  }

  const object = objectValue(body);
  if (object) {
    return `object keys=${Object.keys(object).slice(0, 20).join(",")}`;
  }

  return typeof body;
}

function uniqueSignals(signals: InventorySignal[]) {
  const unique = new Map<string, InventorySignal>();

  for (const signal of signals) {
    unique.set(
      [
        signal.date,
        signal.roomId || "",
        signal.roomTypeId || "",
      ].join("|"),
      signal,
    );
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
  const depth = input.depth ?? 0;
  const path = `/v1/hotels/${encodeURIComponent(input.hotelId)}/inventory`;

  try {
    const body = await thinkRequest(input.apiKey, path, {
      start_date: input.startDate,
      end_date: input.endDate,
    });

    return listPayload(body);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    const serverError = /HTTP 5\d\d/.test(message);
    const span = daysBetween(input.startDate, input.endDate);

    if (!serverError || span <= 7 || depth >= 8) throw error;

    const midpoint = isoDate(
      addDays(parseDate(input.startDate), Math.max(1, Math.floor(span / 2))),
    );

    if (
      midpoint === input.startDate ||
      midpoint === input.endDate
    ) {
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

async function fetchThinkInventorySignals(input: {
  hotelId: string;
  apiKey: string;
  startDate: string;
  endDate: string;
}) {
  /*
    Pull inventory in modest windows. ThinkReservations documents inventory
    under read:availability. We intentionally do not depend on the reservation
    endpoint because that endpoint is returning HTTP 500 for the connected
    Lone Cedar account even though the key/hotel/room endpoints verify.
  */
  const rawItems: unknown[] = [];
  let cursor = input.startDate;

  while (cursor < input.endDate) {
    const remaining = daysBetween(cursor, input.endDate);
    const chunkEnd =
      remaining > 60
        ? isoDate(addDays(parseDate(cursor), 60))
        : input.endDate;

    rawItems.push(
      ...(await fetchInventoryWindow({
        hotelId: input.hotelId,
        apiKey: input.apiKey,
        startDate: cursor,
        endDate: chunkEnd,
      })),
    );

    if (chunkEnd === cursor) break;
    cursor = chunkEnd;
  }

  const signals = uniqueSignals(
    rawItems.flatMap((item) => collectInventorySignals(item)),
  );

  if (!signals.length && rawItems.length) {
    throw new Error(
      `ThinkReservations inventory connected, but Find A Place did not recognize the inventory response shape (${topLevelShape(
        rawItems[0],
      )}). Existing imported dates were preserved.`,
    );
  }

  return signals.filter(
    (signal) =>
      signal.date >= input.startDate &&
      signal.date < input.endDate,
  );
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

function compressUnavailableDates(input: {
  dates: string[];
  roomId: string;
  roomTypeId: string | null;
}) {
  const dates = [...new Set(input.dates)].sort();
  const ranges: Array<{ start: string; end: string }> = [];

  for (const date of dates) {
    const previous = ranges[ranges.length - 1];

    if (previous && previous.end === date) {
      previous.end = nextDate(date);
    } else {
      ranges.push({
        start: date,
        end: nextDate(date),
      });
    }
  }

  return ranges.map((range) => ({
    key: `thinkres:inventory:${input.roomId}:${range.start}:${range.end}`,
    uid: `inventory:${input.roomId}:${range.start}:${range.end}`,
    start: range.start,
    end: range.end,
    metadata: {
      provider: "THINKRESERVATIONS",
      source_kind: "inventory",
      room_type_id: input.roomTypeId,
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
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (activeBlocks.error) throw new Error(activeBlocks.error.message);
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

  const message =
    `${EMPTY_CONFIRMATION} ThinkReservations inventory returned no unavailable dates for this mapped room while imported dates still exist. ` +
    "Existing dates were preserved; a second empty result after five minutes is required before clearing them.";

  await admin.rpc("service_mark_calendar_sync_error", {
    target_connection_id: connectionId,
    error_message: message,
  });

  return false;
}

export async function syncThinkReservationsConnection(
  connectionId: string,
  suppliedAdmin?: SupabaseClient,
  requestedWindow?: { startDate: string; endDate: string },
) {
  const admin = suppliedAdmin ?? createAdminClient();
  const window = requestedWindow ?? defaultWindow();
  let errorAlreadyRecorded = false;

  try {
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
      !connection.external_calendar_id
    ) {
      throw new Error("ThinkReservations calendar mapping is incomplete.");
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
      throw new Error("ThinkReservations account connection is unavailable.");
    }

    const apiKey = decryptPmsCredential(integration.credential_ciphertext);

    const signals = await fetchThinkInventorySignals({
      hotelId: integration.external_account_id,
      apiKey,
      startDate: window.startDate,
      endDate: window.endDate,
    });

    if (!connection.external_room_type_id) {
      throw new Error(
        "ThinkReservations room mapping is missing its room-type ID. Re-save the room mapping before syncing.",
      );
    }

    const sameTypeRooms = roomsForRoomType(
      integration.resource_cache,
      connection.external_room_type_id,
    );

    /*
      ThinkReservations inventory is room-type scoped. Only use it for a
      single FAP cabin when that room type has exactly one physical room.
    */
    if (sameTypeRooms.length !== 1) {
      throw new Error(
        `ThinkReservations room type maps to ${sameTypeRooms.length} physical rooms. Find A Place preserved existing dates rather than mixing availability between cabins.`,
      );
    }

    const applicableSignals = signals.filter(
      (signal) =>
        signal.roomTypeId === connection.external_room_type_id,
    );

    if (!applicableSignals.length && signals.length) {
      throw new Error(
        "ThinkReservations inventory returned data, but none matched this cabin's exact room type. Existing imported dates were preserved instead of mixing cabins.",
      );
    }

    const unavailableDates = applicableSignals
      .filter((signal) => !signal.available)
      .map((signal) => signal.date);

    const uniqueSignalDates = new Set(
      applicableSignals.map((signal) => signal.date),
    );
    const uniqueUnavailableDates = new Set(unavailableDates);

    /*
      A nearly-solid unavailable calendar is the exact symptom produced by
      the previous loose parser. Preserve the current calendar instead of
      replacing it with another obviously bad import.
    */
    if (
      uniqueSignalDates.size >= 30 &&
      uniqueUnavailableDates.size / uniqueSignalDates.size > 0.92
    ) {
      throw new Error(
        `ThinkReservations inventory looked suspicious for this cabin (${uniqueUnavailableDates.size}/${uniqueSignalDates.size} returned nights unavailable). Existing dates were preserved instead of applying a likely mixed/invalid calendar.`,
      );
    }

    const mappedBlocks = compressUnavailableDates({
      dates: unavailableDates,
      roomId: connection.external_calendar_id,
      roomTypeId: connection.external_room_type_id,
    });

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
          "ThinkReservations returned an unexpected empty inventory result. Existing imported dates were preserved.",
        );
      }
    }

    const { data, error } = await admin.rpc("service_apply_pms_sync", {
      target_connection_id: connection.id,
      source_blocks: mappedBlocks,
      sync_window_start: window.startDate,
      sync_window_end: window.endDate,
    });

    if (error) throw new Error(error.message);

    const now = new Date().toISOString();

    await admin
      .from("pms_integrations")
      .update({
        status: "CONNECTED",
        last_sync_at: now,
        last_error: null,
        updated_at: now,
      })
      .eq("id", integration.id);

    const result = (data ?? {}) as {
      imported_count?: number;
      deactivated_count?: number;
    };

    return {
      id: connection.id,
      provider: "THINKRESERVATIONS",
      ok: true as const,
      imported: result.imported_count ?? mappedBlocks.length,
      deactivated: result.deactivated_count ?? 0,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ThinkReservations synchronization failed.";

    if (!errorAlreadyRecorded) {
      await admin.rpc("service_mark_calendar_sync_error", {
        target_connection_id: connectionId,
        error_message: message.slice(0, 1000),
      });
    }

    const { data: connection } = await admin
      .from("calendar_connections")
      .select("pms_integration_id")
      .eq("id", connectionId)
      .maybeSingle();

    if (connection?.pms_integration_id) {
      await admin
        .from("pms_integrations")
        .update({
          status: "ERROR",
          last_error: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.pms_integration_id);
    }

    return {
      id: connectionId,
      provider: "THINKRESERVATIONS",
      ok: false as const,
      error: message.slice(0, 240),
    };
  }
}
