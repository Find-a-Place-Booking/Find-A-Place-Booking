const THINKRESERVATIONS_BASE_URL = "https://api.thinkreservations.com";

type JsonObject = Record<string, unknown>;

export type ThinkReservationsRoom = {
  id: string;
  name: string;
  roomTypeId: string | null;
};

export type ThinkReservationsRoomType = {
  id: string;
  name: string;
};

export type ThinkReservationsResourceCache = {
  hotel: {
    id: string;
    name: string;
  };
  rooms: ThinkReservationsRoom[];
  roomTypes: ThinkReservationsRoomType[];
  refreshedAt: string;
};

export type ThinkReservationsSourceBlock = {
  key: string;
  uid: string;
  start: string;
  end: string;
  roomId: string | null;
  roomTypeId: string | null;
  sourceKind: "reservation" | "blackout";
};

class ThinkReservationsHttpError extends Error {
  status: number;
  path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = "ThinkReservationsHttpError";
    this.status = status;
    this.path = path;
  }
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
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function arrayValue(
  object: JsonObject | null,
  ...keys: string[]
): unknown[] | null {
  if (!object) return null;
  for (const key of keys) {
    const value = object[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

function dateValue(object: JsonObject | null, ...keys: string[]) {
  const raw = stringValue(object, ...keys);
  if (!raw) return null;
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function normalizeId(object: JsonObject | null) {
  return stringValue(object, "id", "externalId", "external_id");
}

function errorMessage(body: unknown, fallback: string) {
  if (typeof body === "string" && body.trim()) {
    return body.trim().slice(0, 500);
  }

  const object = objectValue(body);
  return (
    stringValue(object, "message", "error_description", "error") ||
    fallback
  );
}

function parseIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid ThinkReservations sync date: ${value}`);
  }

  return new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    ),
  );
}

function formatIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dateSpanDays(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate).getTime();
  const end = parseIsoDate(endDate).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

function midpointDate(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate);
  const span = dateSpanDays(startDate, endDate);
  const midpoint = new Date(start.getTime());
  midpoint.setUTCDate(
    midpoint.getUTCDate() + Math.max(1, Math.floor(span / 2)),
  );
  return formatIsoDate(midpoint);
}

async function thinkRequest(
  apiKey: string,
  path: string,
  query?: Record<string, string | null | undefined>,
) {
  const url = new URL(path, THINKRESERVATIONS_BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) url.searchParams.set(key, value);
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
        ? `ThinkReservations could not be reached for ${path}: ${error.message}`
        : `ThinkReservations could not be reached for ${path}.`,
    );
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }
  }

  if (!response.ok) {
    const fallback = `ThinkReservations returned HTTP ${response.status}.`;
    const message = errorMessage(body, fallback);

    if (response.status === 401 || response.status === 403) {
      throw new ThinkReservationsHttpError(
        response.status,
        path,
        `ThinkReservations rejected the credential or required permission on ${path}: ${message}`,
      );
    }

    throw new ThinkReservationsHttpError(
      response.status,
      path,
      `ThinkReservations ${path} returned HTTP ${response.status}: ${message}`,
    );
  }

  return body;
}

function listPayload(body: unknown, keys: string[]) {
  if (Array.isArray(body)) return body;

  const object = objectValue(body);

  const pagination = objectValue(
    object?.pagination ?? object?.meta ?? object?.page,
  );
  const hasMore =
    object?.hasMore === true ||
    object?.has_more === true ||
    pagination?.hasMore === true ||
    pagination?.has_more === true;
  const next =
    stringValue(
      object,
      "next",
      "nextPage",
      "next_page",
      "nextCursor",
      "next_cursor",
    ) ||
    stringValue(
      pagination,
      "next",
      "nextPage",
      "next_page",
      "nextCursor",
      "next_cursor",
    );

  if (hasMore || next) {
    throw new Error(
      "ThinkReservations returned a paginated response that requires another page; existing availability was preserved.",
    );
  }

  for (const key of keys) {
    const candidate = object?.[key];
    if (Array.isArray(candidate)) return candidate;
  }

  throw new Error(
    "ThinkReservations returned a list response Find A Place does not recognize.",
  );
}

function permissionHint(path: string) {
  if (path.endsWith("/reservations")) {
    return "Make sure the Restricted API Key includes read:reservation.";
  }

  if (path.endsWith("/blackouts")) {
    return "Make sure the Restricted API Key includes read:availability.";
  }

  return "Check the permissions on the Restricted API Key.";
}

async function fetchUnfilteredFallback(input: {
  apiKey: string;
  path: string;
  keys: string[];
  originalError: unknown;
}) {
  try {
    const body = await thinkRequest(input.apiKey, input.path);
    return listPayload(body, input.keys);
  } catch (fallbackError) {
    if (
      fallbackError instanceof ThinkReservationsHttpError &&
      (fallbackError.status === 401 || fallbackError.status === 403)
    ) {
      throw new Error(
        `${fallbackError.message} ${permissionHint(input.path)}`,
      );
    }

    if (
      fallbackError instanceof ThinkReservationsHttpError &&
      fallbackError.status >= 500
    ) {
      throw new Error(
        `ThinkReservations is returning HTTP ${fallbackError.status} from ${input.path} even without a date filter. ${permissionHint(input.path)} If the permission is already enabled, this is an upstream ThinkReservations API error.`,
      );
    }

    throw fallbackError ?? input.originalError;
  }
}

async function fetchDateRangedList(input: {
  apiKey: string;
  path: string;
  startDate: string;
  endDate: string;
  keys: string[];
  depth?: number;
}): Promise<unknown[]> {
  const depth = input.depth ?? 0;

  try {
    const body = await thinkRequest(input.apiKey, input.path, {
      start_date: input.startDate,
      end_date: input.endDate,
    });

    return listPayload(body, input.keys);
  } catch (error) {
    const spanDays = dateSpanDays(input.startDate, input.endDate);
    const retryableServerError =
      error instanceof ThinkReservationsHttpError &&
      error.status >= 500 &&
      error.status <= 599;

    if (!retryableServerError) {
      throw error;
    }

    /*
      First shrink a large request. If ThinkReservations still returns 5xx
      on a small range, retry the same endpoint without date parameters.
      This covers hotels where the reservation endpoint accepts the key but
      currently errors on its date-range filter. The final block list is
      clipped back to the requested FAP sync window below.
    */
    if (spanDays <= 14 || depth >= 8) {
      return fetchUnfilteredFallback({
        apiKey: input.apiKey,
        path: input.path,
        keys: input.keys,
        originalError: error,
      });
    }

    const midpoint = midpointDate(input.startDate, input.endDate);

    if (
      midpoint === input.startDate ||
      midpoint === input.endDate
    ) {
      return fetchUnfilteredFallback({
        apiKey: input.apiKey,
        path: input.path,
        keys: input.keys,
        originalError: error,
      });
    }

    const [left, right] = await Promise.all([
      fetchDateRangedList({
        ...input,
        endDate: midpoint,
        depth: depth + 1,
      }),
      fetchDateRangedList({
        ...input,
        startDate: midpoint,
        depth: depth + 1,
      }),
    ]);

    return [...left, ...right];
  }
}

function normalizeRoom(body: unknown): ThinkReservationsRoom | null {
  const object = objectValue(body);
  const id = normalizeId(object);
  if (!id) return null;

  const roomTypeObject = objectValue(object?.roomType ?? object?.room_type);
  const roomTypeId =
    stringValue(object, "roomTypeId", "room_type_id") ||
    normalizeId(roomTypeObject);

  return {
    id,
    name:
      stringValue(object, "name", "roomName", "room_name", "code") ||
      `Room ${id}`,
    roomTypeId,
  };
}

function normalizeRoomType(body: unknown): ThinkReservationsRoomType | null {
  const object = objectValue(body);
  const id = normalizeId(object);
  if (!id) return null;
  return {
    id,
    name:
      stringValue(object, "name", "roomTypeName", "room_type_name", "code") ||
      `Room type ${id}`,
  };
}

export async function fetchThinkReservationsResources(
  hotelId: string,
  apiKey: string,
): Promise<ThinkReservationsResourceCache> {
  const encodedHotelId = encodeURIComponent(hotelId);
  const [hotelBody, roomsBody, roomTypesBody] = await Promise.all([
    thinkRequest(apiKey, `/v1/hotels/${encodedHotelId}`),
    thinkRequest(apiKey, `/v1/hotels/${encodedHotelId}/rooms`),
    thinkRequest(apiKey, `/v1/hotels/${encodedHotelId}/room_types`),
  ]);

  const hotelObject = objectValue(hotelBody);
  const hotelName =
    stringValue(hotelObject, "name", "hotelName", "hotel_name") ||
    `ThinkReservations hotel ${hotelId}`;

  const rooms = listPayload(roomsBody, ["rooms", "data", "items", "results"])
    .map(normalizeRoom)
    .filter((room): room is ThinkReservationsRoom => Boolean(room));

  const roomTypes = listPayload(roomTypesBody, [
    "roomTypes",
    "room_types",
    "data",
    "items",
    "results",
  ])
    .map(normalizeRoomType)
    .filter((roomType): roomType is ThinkReservationsRoomType =>
      Boolean(roomType),
    );

  if (!rooms.length) {
    throw new Error(
      "ThinkReservations connected, but no rooms were returned for this hotel.",
    );
  }

  return {
    hotel: {
      id: normalizeId(hotelObject) || hotelId,
      name: hotelName,
    },
    rooms,
    roomTypes,
    refreshedAt: new Date().toISOString(),
  };
}

function cancelledStatus(value: string | null) {
  if (!value) return false;
  const normalized = value
    .toUpperCase()
    .replaceAll("-", "_")
    .replaceAll(" ", "_");
  return ["CANCELLED", "CANCELED", "VOID", "VOIDED"].includes(normalized);
}

function extractReservationBlocks(items: unknown[]) {
  const output: ThinkReservationsSourceBlock[] = [];
  let structurallyRecognized = items.length === 0;

  items.forEach((rawReservation, reservationIndex) => {
    const reservation = objectValue(rawReservation);
    if (!reservation) return;

    const reservationId =
      normalizeId(reservation) || `reservation-${reservationIndex}`;
    const reservationStatus = stringValue(reservation, "status");

    const nested = arrayValue(
      reservation,
      "bookings",
      "roomBookings",
      "room_bookings",
      "stays",
      "rooms",
    );
    const bookings = nested ?? [rawReservation];

    bookings.forEach((rawBooking, bookingIndex) => {
      const booking = objectValue(rawBooking);
      if (!booking) return;

      const start = dateValue(
        booking,
        "startDate",
        "start_date",
        "arrivalDate",
        "arrival_date",
        "checkIn",
        "check_in",
        "arrival",
      );
      const end = dateValue(
        booking,
        "endDate",
        "end_date",
        "departureDate",
        "departure_date",
        "checkOut",
        "check_out",
        "departure",
      );
      const roomId = stringValue(
        booking,
        "roomId",
        "room_id",
        "assignedRoomId",
        "assigned_room_id",
      );
      const roomTypeId = stringValue(
        booking,
        "roomTypeId",
        "room_type_id",
      );
      const bookingId =
        normalizeId(booking) || `${reservationId}-${bookingIndex}`;

      if (start && end && (roomId || roomTypeId)) {
        structurallyRecognized = true;
      } else {
        return;
      }

      if (
        cancelledStatus(reservationStatus) ||
        cancelledStatus(stringValue(booking, "status"))
      ) {
        return;
      }

      output.push({
        key: `thinkres:reservation:${reservationId}:${bookingId}`,
        uid: bookingId,
        start,
        end,
        roomId,
        roomTypeId,
        sourceKind: "reservation",
      });
    });
  });

  if (!structurallyRecognized && items.length) {
    throw new Error(
      "ThinkReservations reservation data changed shape; existing availability was preserved.",
    );
  }

  return output;
}

function extractBlackoutBlocks(items: unknown[]) {
  const output: ThinkReservationsSourceBlock[] = [];
  let structurallyRecognized = items.length === 0;

  items.forEach((rawBlackout, index) => {
    const blackout = objectValue(rawBlackout);
    if (!blackout) return;

    const id = normalizeId(blackout) || `blackout-${index}`;
    const start = dateValue(
      blackout,
      "startDate",
      "start_date",
      "arrivalDate",
      "arrival_date",
      "checkIn",
      "check_in",
      "date",
    );
    const end = dateValue(
      blackout,
      "endDate",
      "end_date",
      "departureDate",
      "departure_date",
      "checkOut",
      "check_out",
    );
    const roomId = stringValue(
      blackout,
      "roomId",
      "room_id",
      "assignedRoomId",
      "assigned_room_id",
    );
    const roomTypeId = stringValue(
      blackout,
      "roomTypeId",
      "room_type_id",
    );

    if (start && end && (roomId || roomTypeId)) {
      structurallyRecognized = true;
      output.push({
        key: `thinkres:blackout:${id}`,
        uid: id,
        start,
        end,
        roomId,
        roomTypeId,
        sourceKind: "blackout",
      });
    }
  });

  if (!structurallyRecognized && items.length) {
    throw new Error(
      "ThinkReservations blackout data changed shape; existing availability was preserved.",
    );
  }

  return output;
}

function dedupeSourceBlocks(
  blocks: ThinkReservationsSourceBlock[],
) {
  const unique = new Map<string, ThinkReservationsSourceBlock>();

  for (const block of blocks) {
    const key = [
      block.key,
      block.start,
      block.end,
      block.roomId || "",
      block.roomTypeId || "",
    ].join("|");

    unique.set(key, block);
  }

  return [...unique.values()];
}

function overlapsSyncWindow(
  block: ThinkReservationsSourceBlock,
  startDate: string,
  endDate: string,
) {
  return block.start < endDate && block.end > startDate;
}

export async function fetchThinkReservationsAvailabilityBlocks(input: {
  hotelId: string;
  apiKey: string;
  startDate: string;
  endDate: string;
}) {
  const encodedHotelId = encodeURIComponent(input.hotelId);

  const reservations = await fetchDateRangedList({
    apiKey: input.apiKey,
    path: `/v1/hotels/${encodedHotelId}/reservations`,
    startDate: input.startDate,
    endDate: input.endDate,
    keys: ["reservations", "data", "items", "results"],
  });

  const blackouts = await fetchDateRangedList({
    apiKey: input.apiKey,
    path: `/v1/hotels/${encodedHotelId}/blackouts`,
    startDate: input.startDate,
    endDate: input.endDate,
    keys: ["blackouts", "data", "items", "results"],
  });

  return dedupeSourceBlocks([
    ...extractReservationBlocks(reservations),
    ...extractBlackoutBlocks(blackouts),
  ]).filter((block) =>
    overlapsSyncWindow(
      block,
      input.startDate,
      input.endDate,
    ),
  );
}
