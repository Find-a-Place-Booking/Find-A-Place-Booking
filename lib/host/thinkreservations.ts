import { getManagedOrganizations } from "@/lib/host/properties";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ThinkReservationsResourceCache,
  ThinkReservationsRoom,
} from "@/lib/integrations/thinkreservations";

export type ThinkReservationsIntegrationState = {
  integration: null | {
    id: string;
    hotelId: string;
    displayName: string | null;
    status: "CONNECTED" | "ERROR";
    lastVerifiedAt: string | null;
    lastSyncAt: string | null;
    lastError: string | null;
  };
  mapping: null | {
    connectionId: string;
    externalRoomId: string;
    externalRoomTypeId: string | null;
    syncStatus: string;
    lastSuccessAt: string | null;
    lastError: string | null;
  };
  rooms: Array<
    ThinkReservationsRoom & {
      roomTypeName: string | null;
    }
  >;
};

function safeCache(value: unknown): ThinkReservationsResourceCache | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const cache = value as Partial<ThinkReservationsResourceCache>;
  if (!Array.isArray(cache.rooms) || !Array.isArray(cache.roomTypes)) return null;
  if (!cache.hotel || typeof cache.hotel !== "object") return null;
  return cache as ThinkReservationsResourceCache;
}

export async function getThinkReservationsIntegrationState(
  organizationId: string,
  unitId: string,
): Promise<ThinkReservationsIntegrationState> {
  const managed = await getManagedOrganizations();
  if (!managed.some((organization) => organization.id === organizationId)) {
    return { integration: null, mapping: null, rooms: [] };
  }

  const admin = createAdminClient();

  const { data: mappingData } = await admin
    .from("calendar_connections")
    .select(
      "id,pms_integration_id,external_calendar_id,external_room_type_id,sync_status,last_success_at,last_error",
    )
    .eq("unit_id", unitId)
    .eq("provider", "THINKRESERVATIONS")
    .eq("connection_kind", "PMS_API")
    .eq("is_active", true)
    .maybeSingle();

  let integrationId = mappingData?.pms_integration_id ?? null;

  if (!integrationId) {
    const { data: availableIntegration } = await admin
      .from("pms_integrations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("provider", "THINKRESERVATIONS")
      .in("status", ["CONNECTED", "ERROR"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    integrationId = availableIntegration?.id ?? null;
  }

  if (!integrationId) {
    return { integration: null, mapping: null, rooms: [] };
  }

  const { data: integration, error } = await admin
    .from("pms_integrations")
    .select(
      "id,external_account_id,display_name,status,last_verified_at,last_sync_at,last_error,resource_cache",
    )
    .eq("id", integrationId)
    .eq("organization_id", organizationId)
    .eq("provider", "THINKRESERVATIONS")
    .maybeSingle();

  if (error || !integration) {
    return { integration: null, mapping: null, rooms: [] };
  }

  const cache = safeCache(integration.resource_cache);
  const roomTypeNames = new Map(
    (cache?.roomTypes ?? []).map((roomType) => [roomType.id, roomType.name]),
  );

  return {
    integration: {
      id: integration.id,
      hotelId: integration.external_account_id,
      displayName: integration.display_name,
      status: integration.status as "CONNECTED" | "ERROR",
      lastVerifiedAt: integration.last_verified_at,
      lastSyncAt: integration.last_sync_at,
      lastError: integration.last_error,
    },
    mapping: mappingData
      ? {
          connectionId: mappingData.id,
          externalRoomId: mappingData.external_calendar_id,
          externalRoomTypeId: mappingData.external_room_type_id,
          syncStatus: mappingData.sync_status,
          lastSuccessAt: mappingData.last_success_at,
          lastError: mappingData.last_error,
        }
      : null,
    rooms: (cache?.rooms ?? []).map((room) => ({
      ...room,
      roomTypeName: room.roomTypeId
        ? roomTypeNames.get(room.roomTypeId) ?? null
        : null,
    })),
  };
}
