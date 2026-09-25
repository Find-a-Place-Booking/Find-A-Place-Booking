import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptPmsCredential } from "@/lib/integrations/credential-crypto";
import { fetchThinkReservationsAvailabilityBlocks } from "@/lib/integrations/thinkreservations";
import { createAdminClient } from "@/lib/supabase/admin";

const EMPTY_CONFIRMATION = "[PMS_EMPTY_CONFIRMATION]";

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
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
    `${EMPTY_CONFIRMATION} ThinkReservations returned no mapped booked/blocked dates while imported dates still exist. ` +
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
        "id,external_account_id,credential_ciphertext,status",
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

    const sourceBlocks = await fetchThinkReservationsAvailabilityBlocks({
      hotelId: integration.external_account_id,
      apiKey,
      startDate: window.startDate,
      endDate: window.endDate,
    });

    const mappedBlocks = sourceBlocks
      .filter((block) => {
        if (block.roomId) {
          return block.roomId === connection.external_calendar_id;
        }

        // If the upstream record is only room-type scoped, use it only when
        // the mapping has the same room type. This safely catches a hotel-wide
        // blackout while still preferring exact room assignments.
        return Boolean(
          block.roomTypeId &&
            connection.external_room_type_id &&
            block.roomTypeId === connection.external_room_type_id,
        );
      })
      .map((block) => ({
        key: block.key,
        uid: block.uid,
        start: block.start,
        end: block.end,
        metadata: {
          provider: "THINKRESERVATIONS",
          source_kind: block.sourceKind,
        },
      }));

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
          "ThinkReservations returned an unexpected empty result. Existing imported dates were preserved.",
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
