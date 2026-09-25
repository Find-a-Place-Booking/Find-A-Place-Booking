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
  const object = objectValue(body);
  return (
    stringValue(object, "message", "error_description", "error") ||
    fallback
  );
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
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `ThinkReservations could not be reached: ${error.message}`
        : "ThinkReservations could not be reached.",
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
    const message = errorMessage(
      body,
      `ThinkReservations returned HTTP ${response.status}.`,
    );

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `ThinkReservations rejected the credential or required permission: ${message}`,
      );
    }

    throw new Error(`ThinkReservations request failed: ${message}`);
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
    stringValue(object, "next", "nextPage", "next_page", "nextCursor", "next_cursor") ||
    stringValue(pagination, "next", "nextPage", "next_page", "nextCursor", "next_cursor");

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
  const normalized = value.toUpperCase().replaceAll("-", "_").replaceAll(" ", "_");
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

export async function fetchThinkReservationsAvailabilityBlocks(input: {
  hotelId: string;
  apiKey: string;
  startDate: string;
  endDate: string;
}) {
  const encodedHotelId = encodeURIComponent(input.hotelId);
  const query = {
    start_date: input.startDate,
    end_date: input.endDate,
  };

  const [reservationsBody, blackoutsBody] = await Promise.all([
    thinkRequest(
      input.apiKey,
      `/v1/hotels/${encodedHotelId}/reservations`,
      query,
    ),
    thinkRequest(
      input.apiKey,
      `/v1/hotels/${encodedHotelId}/blackouts`,
      query,
    ),
  ]);

  const reservations = listPayload(reservationsBody, [
    "reservations",
    "data",
    "items",
    "results",
  ]);
  const blackouts = listPayload(blackoutsBody, [
    "blackouts",
    "data",
    "items",
    "results",
  ]);

  return [
    ...extractReservationBlocks(reservations),
    ...extractBlackoutBlocks(blackouts),
  ];
}
