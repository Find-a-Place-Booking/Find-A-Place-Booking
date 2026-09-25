"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getManagedOrganizations } from "@/lib/host/properties";
import { encryptPmsCredential, decryptPmsCredential } from "@/lib/integrations/credential-crypto";
import {
  fetchThinkReservationsResources,
  type ThinkReservationsResourceCache,
} from "@/lib/integrations/thinkreservations";
import { syncThinkReservationsConnection } from "@/lib/calendar/sync-thinkreservations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 1000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function calendarRedirect(
  unitId: string,
  month: string,
  result: string,
  detail?: string,
): never {
  const params = new URLSearchParams();
  if (unitId) params.set("unit", unitId);
  if (month) params.set("month", month);
  params.set("result", result);
  if (detail) params.set("detail", detail.slice(0, 260));
  redirect(`/host/calendar?${params.toString()}`);
}

function refreshCalendar() {
  revalidatePath("/host/calendar");
  revalidatePath("/host");
  revalidatePath("/admin/calendars");
}

async function actorProfileId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const profileId = data?.claims?.sub;
  if (!profileId) throw new Error("Authentication required.");
  return String(profileId);
}

async function assertManagedOrganization(organizationId: string) {
  const organizations = await getManagedOrganizations();
  if (!organizations.some((organization) => organization.id === organizationId)) {
    throw new Error("You do not manage that organization.");
  }
}

async function assertUnitBelongsToOrganization(
  unitId: string,
  organizationId: string,
) {
  const admin = createAdminClient();
  const { data: unit, error: unitError } = await admin
    .from("property_units")
    .select("property_id")
    .eq("id", unitId)
    .maybeSingle();

  if (unitError || !unit) throw new Error("Calendar unit not found.");

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("organization_id")
    .eq("id", unit.property_id)
    .maybeSingle();

  if (
    propertyError ||
    !property ||
    property.organization_id !== organizationId
  ) {
    throw new Error("That unit does not belong to this organization.");
  }
}

function resourceCache(value: unknown): ThinkReservationsResourceCache | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<ThinkReservationsResourceCache>;
  if (!candidate.hotel || !Array.isArray(candidate.rooms)) return null;
  if (!Array.isArray(candidate.roomTypes)) return null;
  return candidate as ThinkReservationsResourceCache;
}

export async function connectThinkReservations(formData: FormData) {
  const organizationId = field(formData, "organizationId", 100);
  const unitId = field(formData, "unitId", 100);
  const month = field(formData, "month", 20);
  const hotelId = field(formData, "hotelId", 240);
  const apiKey = field(formData, "apiKey", 4096);

  try {
    if (!hotelId || !apiKey) throw new Error("Hotel ID and API key are required.");
    if (!apiKey.startsWith("rk_")) {
      throw new Error("Use a ThinkReservations Restricted API Key.");
    }

    await assertManagedOrganization(organizationId);
    await assertUnitBelongsToOrganization(unitId, organizationId);
    const profileId = await actorProfileId();

    const resources = await fetchThinkReservationsResources(hotelId, apiKey);
    const encrypted = encryptPmsCredential(apiKey);
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data: existing } = await admin
      .from("pms_integrations")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("provider", "THINKRESERVATIONS")
      .eq("external_account_id", hotelId)
      .maybeSingle();

    let integrationId = existing?.id ?? null;

    if (integrationId) {
      const { error } = await admin
        .from("pms_integrations")
        .update({
          credential_ciphertext: encrypted,
          display_name: resources.hotel.name,
          resource_cache: resources,
          status: "CONNECTED",
          last_verified_at: now,
          last_error: null,
          updated_at: now,
        })
        .eq("id", integrationId);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await admin
        .from("pms_integrations")
        .insert({
          organization_id: organizationId,
          provider: "THINKRESERVATIONS",
          external_account_id: hotelId,
          display_name: resources.hotel.name,
          credential_ciphertext: encrypted,
          resource_cache: resources,
          status: "CONNECTED",
          last_verified_at: now,
          created_by: profileId,
        })
        .select("id")
        .single();

      if (error || !data) throw new Error(error?.message || "Unable to save integration.");
      integrationId = data.id;
    }

    await admin.from("audit_logs").insert({
      actor_profile_id: profileId,
      action: "pms.thinkreservations.connected",
      entity_type: "pms_integration",
      entity_id: integrationId,
      reason: "Host connected a read-only ThinkReservations availability integration.",
      metadata: {
        organization_id: organizationId,
        hotel_id: hotelId,
        room_count: resources.rooms.length,
        scopes_requested: [
          "read:hotel",
          "read:room",
          "read:availability",
          "read:reservation",
        ],
      },
    });

    refreshCalendar();
    calendarRedirect(
      unitId,
      month,
      "think-connected",
      `ThinkReservations connected. ${resources.rooms.length} room${resources.rooms.length === 1 ? "" : "s"} found. Map this Find A Place unit next.`,
    );
  } catch (error) {
    calendarRedirect(
      unitId,
      month,
      "error",
      error instanceof Error ? error.message : "ThinkReservations connection failed.",
    );
  }
}

export async function refreshThinkReservationsConnection(formData: FormData) {
  const organizationId = field(formData, "organizationId", 100);
  const integrationId = field(formData, "integrationId", 100);
  const unitId = field(formData, "unitId", 100);
  const month = field(formData, "month", 20);

  try {
    await assertManagedOrganization(organizationId);
    const admin = createAdminClient();

    const { data: integration, error } = await admin
      .from("pms_integrations")
      .select("id,organization_id,external_account_id,credential_ciphertext")
      .eq("id", integrationId)
      .eq("provider", "THINKRESERVATIONS")
      .maybeSingle();

    if (
      error ||
      !integration ||
      integration.organization_id !== organizationId
    ) {
      throw new Error("ThinkReservations connection not found.");
    }

    const apiKey = decryptPmsCredential(integration.credential_ciphertext);
    const resources = await fetchThinkReservationsResources(
      integration.external_account_id,
      apiKey,
    );
    const now = new Date().toISOString();

    const { error: updateError } = await admin
      .from("pms_integrations")
      .update({
        display_name: resources.hotel.name,
        resource_cache: resources,
        status: "CONNECTED",
        last_verified_at: now,
        last_error: null,
        updated_at: now,
      })
      .eq("id", integration.id);

    if (updateError) throw new Error(updateError.message);

    refreshCalendar();
    calendarRedirect(
      unitId,
      month,
      "think-tested",
      `ThinkReservations connection passed. ${resources.rooms.length} room${resources.rooms.length === 1 ? "" : "s"} available to map.`,
    );
  } catch (error) {
    calendarRedirect(
      unitId,
      month,
      "error",
      error instanceof Error ? error.message : "ThinkReservations test failed.",
    );
  }
}

export async function mapThinkReservationsRoom(formData: FormData) {
  const organizationId = field(formData, "organizationId", 100);
  const integrationId = field(formData, "integrationId", 100);
  const unitId = field(formData, "unitId", 100);
  const roomId = field(formData, "roomId", 500);
  const month = field(formData, "month", 20);

  try {
    await assertManagedOrganization(organizationId);
    await assertUnitBelongsToOrganization(unitId, organizationId);
    const profileId = await actorProfileId();
    const admin = createAdminClient();

    const { data: integration, error: integrationError } = await admin
      .from("pms_integrations")
      .select("id,organization_id,resource_cache,status")
      .eq("id", integrationId)
      .eq("provider", "THINKRESERVATIONS")
      .maybeSingle();

    if (
      integrationError ||
      !integration ||
      integration.organization_id !== organizationId ||
      !["CONNECTED", "ERROR"].includes(integration.status)
    ) {
      throw new Error("ThinkReservations connection not found.");
    }

    const cache = resourceCache(integration.resource_cache);
    const room = cache?.rooms.find((candidate) => candidate.id === roomId);
    if (!room) {
      throw new Error("Choose a room returned by ThinkReservations.");
    }

    const roomTypeName =
      room.roomTypeId
        ? cache?.roomTypes.find((candidate) => candidate.id === room.roomTypeId)?.name
        : null;
    const label = `ThinkReservations · ${room.name}${roomTypeName ? ` (${roomTypeName})` : ""}`.slice(0, 120);

    const { data: existing } = await admin
      .from("calendar_connections")
      .select("id")
      .eq("unit_id", unitId)
      .eq("provider", "THINKRESERVATIONS")
      .eq("connection_kind", "PMS_API")
      .eq("is_active", true)
      .maybeSingle();

    let connectionId = existing?.id ?? null;

    if (connectionId) {
      const { error } = await admin
        .from("calendar_connections")
        .update({
          pms_integration_id: integration.id,
          external_calendar_id: room.id,
          external_room_type_id: room.roomTypeId,
          label,
          sync_status: "NEVER_SYNCED",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);
      if (error) throw new Error(error.message);

    } else {
      const { data, error } = await admin
        .from("calendar_connections")
        .insert({
          unit_id: unitId,
          provider: "THINKRESERVATIONS",
          connection_kind: "PMS_API",
          label,
          feed_url: null,
          external_calendar_id: room.id,
          external_room_type_id: room.roomTypeId,
          pms_integration_id: integration.id,
          created_by: profileId,
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(error?.message || "Unable to save room mapping.");
      }
      connectionId = data.id;
    }

    const sync = await syncThinkReservationsConnection(connectionId, admin);
    refreshCalendar();

    if (!sync.ok) {
      calendarRedirect(
        unitId,
        month,
        "connected-sync-error",
        `Room mapped, but the first ThinkReservations sync needs attention: ${sync.error}`,
      );
    }

    calendarRedirect(
      unitId,
      month,
      "think-mapped",
      `${room.name} mapped. ${sync.imported} booked/blocked date span${sync.imported === 1 ? "" : "s"} synchronized.`,
    );
  } catch (error) {
    calendarRedirect(
      unitId,
      month,
      "error",
      error instanceof Error ? error.message : "Unable to map ThinkReservations room.",
    );
  }
}

export async function syncThinkReservationsNow(formData: FormData) {
  const connectionId = field(formData, "connectionId", 100);
  const unitId = field(formData, "unitId", 100);
  const month = field(formData, "month", 20);

  try {
    const supabase = await createClient();
    const { data: connection, error } = await supabase
      .from("calendar_connections")
      .select("id,unit_id,provider,connection_kind,is_active")
      .eq("id", connectionId)
      .eq("unit_id", unitId)
      .maybeSingle();

    if (
      error ||
      !connection ||
      !connection.is_active ||
      connection.provider !== "THINKRESERVATIONS" ||
      connection.connection_kind !== "PMS_API"
    ) {
      throw new Error("ThinkReservations mapping is not available to sync.");
    }

    const result = await syncThinkReservationsConnection(connectionId);
    refreshCalendar();

    if (!result.ok) throw new Error(result.error);

    calendarRedirect(
      unitId,
      month,
      "think-synced",
      `${result.imported} booked/blocked date span${result.imported === 1 ? "" : "s"} synchronized from ThinkReservations.`,
    );
  } catch (error) {
    calendarRedirect(
      unitId,
      month,
      "error",
      error instanceof Error ? error.message : "ThinkReservations sync failed.",
    );
  }
}

export async function disconnectThinkReservationsUnit(formData: FormData) {
  const connectionId = field(formData, "connectionId", 100);
  const unitId = field(formData, "unitId", 100);
  const month = field(formData, "month", 20);

  const supabase = await createClient();
  const { error } = await supabase.rpc("disable_calendar_connection", {
    target_unit_id: unitId,
    target_connection_id: connectionId,
  });

  if (error) {
    calendarRedirect(unitId, month, "error", error.message);
  }

  refreshCalendar();
  calendarRedirect(
    unitId,
    month,
    "think-disconnected",
    "ThinkReservations disconnected from this unit and its imported blocks were removed from active availability.",
  );
}
