import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchIcalFeed } from "@/lib/calendar/fetch-ical";
import { parseIcalAvailability } from "@/lib/calendar/ical";
import { syncThinkReservationsConnection } from "@/lib/calendar/sync-thinkreservations";
import { createAdminClient } from "@/lib/supabase/admin";

export type IcalConnection = {
  id: string;
  unit_id: string;
  provider: string;
  feed_url: string | null;
  last_sync_attempt_at: string | null;
  last_success_at: string | null;
};

const EMPTY_CONFIRMATION = "[EMPTY_FEED_CONFIRMATION]";

async function emptyFeedMayClear(
  admin: SupabaseClient,
  connection: IcalConnection,
) {
  const [activeBlocks, latestRun] = await Promise.all([
    admin
      .from("availability_blocks")
      .select("id", { count: "exact", head: true })
      .eq("connection_id", connection.id)
      .eq("block_type", "EXTERNAL_BLOCK")
      .eq("state", "ACTIVE"),
    admin
      .from("calendar_sync_runs")
      .select("status,error_message,completed_at")
      .eq("connection_id", connection.id)
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
    `${EMPTY_CONFIRMATION} The feed returned zero events while imported dates still exist. ` +
    "Existing dates were preserved; a second empty result after five minutes is required before clearing them.";

  await admin.rpc("service_mark_calendar_sync_error", {
    target_connection_id: connection.id,
    error_message: message,
  });

  return false;
}

export async function syncIcalConnection(
  connection: IcalConnection,
  suppliedAdmin?: SupabaseClient,
) {
  const admin = suppliedAdmin ?? createAdminClient();
  let errorAlreadyRecorded = false;

  try {
    if (!connection.feed_url) {
      throw new Error("Calendar connection has no feed URL.");
    }

    const { data: unit, error: unitError } = await admin
      .from("property_units")
      .select("property_id")
      .eq("id", connection.unit_id)
      .single();
    if (unitError || !unit) throw new Error("Calendar property could not be loaded.");

    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("time_zone")
      .eq("id", unit.property_id)
      .single();
    if (propertyError || !property) throw new Error("Calendar property timezone could not be loaded.");

    const fetched = await fetchIcalFeed(connection.feed_url);
    const parsed = parseIcalAvailability(fetched.body, property.time_zone);

    if (parsed.unsafeSkipped > 0) {
      const recurring = parsed.recurringSkipped
        ? ` (${parsed.recurringSkipped} recurring rule${
            parsed.recurringSkipped === 1 ? "" : "s"
          })`
        : "";

      throw new Error(
        `Calendar sync stopped safely: ${parsed.unsafeSkipped} event${
          parsed.unsafeSkipped === 1 ? "" : "s"
        }${recurring} could not be normalized without guessing.`,
      );
    }

    if (!parsed.events.length) {
      const mayClear = await emptyFeedMayClear(admin, connection);
      if (!mayClear) {
        errorAlreadyRecorded = true;
        throw new Error(
          "The calendar returned an unexpected empty feed. Existing imported dates were preserved.",
        );
      }
    }

    const { data, error } = await admin.rpc("service_apply_ical_sync", {
      target_connection_id: connection.id,
      source_events: parsed.events,
    });

    if (error) throw new Error(error.message);

    const result = (data ?? {}) as {
      imported_count?: number;
      deactivated_count?: number;
    };

    return {
      id: connection.id,
      provider: connection.provider,
      ok: true as const,
      imported: result.imported_count ?? parsed.events.length,
      deactivated: result.deactivated_count ?? 0,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Calendar synchronization failed.";

    if (!errorAlreadyRecorded) {
      await admin.rpc("service_mark_calendar_sync_error", {
        target_connection_id: connection.id,
        error_message: message.slice(0, 1000),
      });
    }

    return {
      id: connection.id,
      provider: connection.provider,
      ok: false as const,
      error: message.slice(0, 240),
    };
  }
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
) {
  const output: R[] = new Array(items.length);
  let index = 0;

  async function runner() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      output[current] = await worker(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runner()),
  );

  return output;
}

export async function refreshUnitCalendarsOrThrow(unitId: string) {
  const admin = createAdminClient();

  const [icalResult, pmsResult] = await Promise.all([
    admin
      .from("calendar_connections")
      .select("id,unit_id,provider,feed_url,last_sync_attempt_at,last_success_at")
      .eq("unit_id", unitId)
      .eq("connection_kind", "ICAL")
      .eq("is_active", true),
    admin
      .from("calendar_connections")
      .select("id")
      .eq("unit_id", unitId)
      .eq("connection_kind", "PMS_API")
      .eq("provider", "THINKRESERVATIONS")
      .eq("is_active", true),
  ]);

  if (icalResult.error || pmsResult.error) {
    throw new Error("Connected calendars could not be checked.");
  }

  const icalConnections = (icalResult.data ?? []) as IcalConnection[];
  const pmsConnectionIds = (pmsResult.data ?? []).map(
    (connection: { id: string }) => connection.id,
  );

  const [icalSyncs, pmsSyncs] = await Promise.all([
    runWithConcurrency(icalConnections, 3, (connection) =>
      syncIcalConnection(connection, admin),
    ),
    runWithConcurrency(pmsConnectionIds, 2, (connectionId) =>
      syncThinkReservationsConnection(connectionId, admin),
    ),
  ]);

  const failure = [...icalSyncs, ...pmsSyncs].find((result) => !result.ok);

  if (failure && !failure.ok) {
    throw new Error(
      `We could not verify the ${failure.provider} availability source. Please try booking again in a moment.`,
    );
  }
}
