import { NextRequest, NextResponse } from "next/server";

import { inspectIcalFeed } from "@/lib/calendar/diagnostics";
import {
  assertSafeCalendarUrl,
  normalizeIcalUrl,
} from "@/lib/calendar/fetch-ical";
import {
  syncIcalConnection,
  type IcalConnection,
} from "@/lib/calendar/sync-ical";
import { syncThinkReservationsConnection } from "@/lib/calendar/sync-thinkreservations";
import {
  decryptPmsCredential,
  encryptPmsCredential,
} from "@/lib/integrations/credential-crypto";
import {
  fetchThinkReservationsResources,
  type ThinkReservationsResourceCache,
} from "@/lib/integrations/thinkreservations";
import { sameOrigin } from "@/lib/payments/booking-runtime";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Body = {
  organizationId?: string;
  action?: string;
  provider?: string;
  label?: string;
  feedUrl?: string;
  connectionId?: string;
  hotelId?: string;
  apiKey?: string;
  integrationId?: string;
  roomId?: string;
  accountId?: string;
  login?: string;
  password?: string;
  syncIntervalMinutes?: number | string;
  verificationCode?: string;
  resourceKey?: string;
};

type Target = {
  organizationId: string;
  propertyId: string;
  unitId: string;
  slug: string;
  profileId: string;
};

type ConnectionRow = {
  id: string;
  provider: string;
  connection_kind: "ICAL" | "PMS_API" | "BROWSER_WORKER";
  label: string;
  feed_url: string | null;
  is_active: boolean;
  sync_status: string;
  last_success_at: string | null;
  last_error: string | null;
  pms_integration_id: string | null;
  external_calendar_id: string | null;
  external_room_type_id: string | null;
  created_at: string;
};

type ResNexusMappingRow = {
  id: string;
  browser_account_id: string;
  unit_id: string;
  calendar_connection_id: string;
  resource_key: string;
  resource_label: string;
  status: string;
  last_success_at: string | null;
  last_error: string | null;
};

type ResNexusAccountRow = {
  id: string;
  label: string;
  status: string;
  discovered_resources: unknown;
  attention_code: string | null;
  attention_message: string | null;
  sync_interval_minutes: number;
  next_sync_at: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
};

function text(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Calendar setup could not be updated.";
}

function safeThinkCache(value: unknown): ThinkReservationsResourceCache | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<ThinkReservationsResourceCache>;
  if (!candidate.hotel || !Array.isArray(candidate.rooms)) return null;
  if (!Array.isArray(candidate.roomTypes)) return null;
  return candidate as ThinkReservationsResourceCache;
}

function safeResNexusResources(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = item as Record<string, unknown>;
    const key = text(candidate.key, 160);
    const label = text(candidate.label, 240);
    if (!key || !label || seen.has(key)) return [];
    seen.add(key);
    return [{ key, label }];
  });
}

async function prepareTarget(
  organizationId: string,
): Promise<{ target: Target; supabase: Awaited<ReturnType<typeof createClient>> }> {
  if (!UUID_RE.test(organizationId)) {
    throw new Error("Host organization is invalid.");
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const profileId = claims?.claims?.sub;
  if (!profileId) throw new Error("Sign in again to continue host setup.");

  const { data, error } = await supabase.rpc("prepare_onboarding_property", {
    target_organization_id: organizationId,
  });

  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.property_id || !row?.unit_id || !row?.slug) {
    throw new Error("The onboarding property could not be prepared.");
  }

  return {
    supabase,
    target: {
      organizationId,
      propertyId: String(row.property_id),
      unitId: String(row.unit_id),
      slug: String(row.slug),
      profileId: String(profileId),
    },
  };
}

async function propertyTimeZone(unitId: string) {
  const admin = createAdminClient();
  const { data: unit, error: unitError } = await admin
    .from("property_units")
    .select("property_id")
    .eq("id", unitId)
    .maybeSingle();

  if (unitError || !unit?.property_id) {
    throw new Error("Calendar property could not be loaded.");
  }

  const { data: property, error: propertyError } = await admin
    .from("properties")
    .select("time_zone")
    .eq("id", unit.property_id)
    .maybeSingle();

  if (propertyError || !property) {
    throw new Error("Calendar property timezone could not be loaded.");
  }

  return property.time_zone || null;
}

async function loadState(target: Target) {
  const admin = createAdminClient();

  const { data: connectionRows, error: connectionError } = await admin
    .from("calendar_connections")
    .select(
      "id,provider,connection_kind,label,feed_url,is_active,sync_status,last_success_at,last_error,pms_integration_id,external_calendar_id,external_room_type_id,created_at",
    )
    .eq("unit_id", target.unitId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (connectionError) throw new Error("Unable to load calendar connections.");

  const activeConnections = (connectionRows ?? []) as ConnectionRow[];
  const connectionIds = activeConnections.map((row) => row.id);
  const blockCountByConnection = new Map<string, number>();

  if (connectionIds.length) {
    const { data: blockRows, error: blockError } = await admin
      .from("availability_blocks")
      .select("connection_id")
      .in("connection_id", connectionIds)
      .eq("block_type", "EXTERNAL_BLOCK")
      .eq("state", "ACTIVE");

    if (blockError) throw new Error("Unable to load imported calendar blocks.");
    for (const row of blockRows ?? []) {
      const id = String(row.connection_id || "");
      if (!id) continue;
      blockCountByConnection.set(id, (blockCountByConnection.get(id) ?? 0) + 1);
    }
  }

  const connections = activeConnections.map((row) => {
    let sourceHost: string | null = null;
    if (row.feed_url) {
      try {
        sourceHost = new URL(row.feed_url).hostname;
      } catch {
        sourceHost = null;
      }
    }

    return {
      id: row.id,
      provider: row.provider,
      connectionKind: row.connection_kind,
      label: row.label,
      syncStatus: row.sync_status,
      lastSuccessAt: row.last_success_at,
      lastError: row.last_error,
      activeBlockCount: blockCountByConnection.get(row.id) ?? 0,
      sourceHost,
    };
  });

  const thinkMapping = activeConnections.find(
    (row) =>
      row.provider === "THINKRESERVATIONS" &&
      row.connection_kind === "PMS_API",
  );

  let thinkIntegrationId = thinkMapping?.pms_integration_id ?? null;
  if (!thinkIntegrationId) {
    const { data: availableIntegration } = await admin
      .from("pms_integrations")
      .select("id")
      .eq("organization_id", target.organizationId)
      .eq("provider", "THINKRESERVATIONS")
      .in("status", ["CONNECTED", "ERROR"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    thinkIntegrationId = availableIntegration?.id ?? null;
  }

  let think: {
    integration: null | {
      id: string;
      hotelId: string;
      displayName: string | null;
      status: string;
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
    rooms: Array<{
      id: string;
      name: string;
      roomTypeId: string | null;
      roomTypeName: string | null;
    }>;
  } = { integration: null, mapping: null, rooms: [] };

  if (thinkIntegrationId) {
    const { data: integration } = await admin
      .from("pms_integrations")
      .select(
        "id,external_account_id,display_name,status,last_verified_at,last_sync_at,last_error,resource_cache",
      )
      .eq("id", thinkIntegrationId)
      .eq("organization_id", target.organizationId)
      .eq("provider", "THINKRESERVATIONS")
      .maybeSingle();

    if (integration) {
      const cache = safeThinkCache(integration.resource_cache);
      const roomTypeNames = new Map(
        (cache?.roomTypes ?? []).map((roomType) => [roomType.id, roomType.name]),
      );

      think = {
        integration: {
          id: integration.id,
          hotelId: integration.external_account_id,
          displayName: integration.display_name,
          status: integration.status,
          lastVerifiedAt: integration.last_verified_at,
          lastSyncAt: integration.last_sync_at,
          lastError: integration.last_error,
        },
        mapping: thinkMapping
          ? {
              connectionId: thinkMapping.id,
              externalRoomId: thinkMapping.external_calendar_id || "",
              externalRoomTypeId: thinkMapping.external_room_type_id,
              syncStatus: thinkMapping.sync_status,
              lastSuccessAt: thinkMapping.last_success_at,
              lastError: thinkMapping.last_error,
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
  }

  const { data: resNexusRows, error: resNexusError } = await admin
    .from("resnexus_browser_accounts")
    .select(
      "id,label,status,discovered_resources,attention_code,attention_message,sync_interval_minutes,next_sync_at,last_attempt_at,last_success_at,last_error",
    )
    .eq("organization_id", target.organizationId)
    .neq("status", "DISABLED")
    .order("created_at", { ascending: true });

  if (resNexusError) throw new Error("Unable to load ResNexus connections.");

  const resNexusAccounts = (resNexusRows ?? []) as ResNexusAccountRow[];
  const resNexusIds = resNexusAccounts.map((row) => row.id);
  const { data: resNexusMappings } = resNexusIds.length
    ? await admin
        .from("resnexus_resource_mappings")
        .select(
          "id,browser_account_id,unit_id,calendar_connection_id,resource_key,resource_label,status,last_success_at,last_error",
        )
        .in("browser_account_id", resNexusIds)
        .eq("unit_id", target.unitId)
    : { data: [] };

  const unitMappings = (resNexusMappings ?? []) as ResNexusMappingRow[];
  const mappingByAccount = new Map(
    unitMappings.map((mapping) => [mapping.browser_account_id, mapping]),
  );
  const connectionById = new Map(
    activeConnections.map((connection) => [connection.id, connection]),
  );

  const resNexus = resNexusAccounts.map((account) => {
    const mapping = mappingByAccount.get(account.id);
    const calendar = mapping
      ? connectionById.get(mapping.calendar_connection_id)
      : null;

    return {
      id: account.id,
      label: account.label,
      status: account.status,
      discoveredResources: safeResNexusResources(account.discovered_resources),
      attentionCode: account.attention_code,
      attentionMessage: account.attention_message,
      syncIntervalMinutes: account.sync_interval_minutes,
      nextSyncAt: account.next_sync_at,
      lastAttemptAt: account.last_attempt_at,
      lastSuccessAt: account.last_success_at,
      lastError: account.last_error,
      mapping: mapping
        ? {
            id: mapping.id,
            calendarConnectionId: mapping.calendar_connection_id,
            resourceKey: mapping.resource_key,
            resourceLabel: mapping.resource_label,
            status: mapping.status,
            lastSuccessAt: mapping.last_success_at,
            lastError: mapping.last_error,
            calendarSyncStatus: calendar?.sync_status ?? "NEVER_SYNCED",
            activeBlockCount:
              blockCountByConnection.get(mapping.calendar_connection_id) ?? 0,
          }
        : null,
    };
  });

  return {
    target: {
      propertyId: target.propertyId,
      unitId: target.unitId,
      slug: target.slug,
    },
    connections,
    think,
    resNexus,
  };
}

async function response(target: Target, message: string, ok = true) {
  return NextResponse.json(
    { ok, message, state: await loadState(target) },
    { status: ok ? 200 : 409 },
  );
}

async function getIcalConnection(target: Target, connectionId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("calendar_connections")
    .select(
      "id,unit_id,provider,feed_url,connection_kind,is_active,last_sync_attempt_at,last_success_at",
    )
    .eq("id", connectionId)
    .eq("unit_id", target.unitId)
    .eq("connection_kind", "ICAL")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data?.feed_url) {
    throw new Error("That iCal connection is not available.");
  }
  return data as IcalConnection & { connection_kind: string; is_active: boolean };
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid calendar setup request." }, { status: 400 });
  }

  const organizationId = text(body.organizationId, 100);
  const action = text(body.action, 80).toLowerCase();

  try {
    const { target, supabase } = await prepareTarget(organizationId);
    const admin = createAdminClient();

    if (!action || action === "state") {
      return response(target, "Calendar setup loaded.");
    }

    if (action === "connect-ical") {
      const provider = text(body.provider, 40) || "OTHER_ICAL";
      const label = text(body.label, 120);
      const normalizedUrl = normalizeIcalUrl(text(body.feedUrl, 2000));

      await assertSafeCalendarUrl(normalizedUrl);
      const diagnostic = await inspectIcalFeed(
        normalizedUrl,
        provider,
        await propertyTimeZone(target.unitId),
      );
      if (!diagnostic.compatible) {
        return response(target, diagnostic.message, false);
      }

      const { data: created, error } = await supabase.rpc("create_ical_connection", {
        target_unit_id: target.unitId,
        provider_name: provider,
        connection_label: label,
        source_url: normalizedUrl,
      });
      if (error) throw new Error(error.message);

      const connectionId = String(created ?? "");
      if (!connectionId) throw new Error("The calendar connection was created without an ID.");
      const connection = await getIcalConnection(target, connectionId);
      const sync = await syncIcalConnection(connection, admin);

      if (!sync.ok) {
        return response(
          target,
          `Calendar connected, but the first sync needs attention: ${sync.error}`,
          false,
        );
      }

      return response(
        target,
        `${provider.replaceAll("_", " ")} connected. ${sync.imported} current event${sync.imported === 1 ? "" : "s"} synchronized.`,
      );
    }

    if (action === "test-ical") {
      const connection = await getIcalConnection(target, text(body.connectionId, 100));
      const diagnostic = await inspectIcalFeed(
        connection.feed_url as string,
        connection.provider,
        await propertyTimeZone(target.unitId),
      );
      return response(target, diagnostic.message, diagnostic.compatible);
    }

    if (action === "sync-ical") {
      const connection = await getIcalConnection(target, text(body.connectionId, 100));
      const sync = await syncIcalConnection(connection, admin);
      return sync.ok
        ? response(target, `${sync.imported} current event${sync.imported === 1 ? "" : "s"} synchronized.`)
        : response(target, sync.error, false);
    }

    if (action === "disconnect-ical") {
      const connectionId = text(body.connectionId, 100);
      await getIcalConnection(target, connectionId);
      const { error } = await supabase.rpc("disable_calendar_connection", {
        target_unit_id: target.unitId,
        target_connection_id: connectionId,
      });
      if (error) throw new Error(error.message);
      return response(target, "Calendar disconnected. Its imported blocks are no longer active.");
    }

    if (action === "connect-think") {
      const hotelId = text(body.hotelId, 240);
      const apiKey = text(body.apiKey, 4096);
      if (!hotelId || !apiKey) throw new Error("Hotel ID and API key are required.");
      if (!apiKey.startsWith("rk_")) throw new Error("Use a ThinkReservations Restricted API Key.");

      const resources = await fetchThinkReservationsResources(hotelId, apiKey);
      const encrypted = encryptPmsCredential(apiKey);
      const now = new Date().toISOString();

      const { data: existing } = await admin
        .from("pms_integrations")
        .select("id")
        .eq("organization_id", target.organizationId)
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
            organization_id: target.organizationId,
            provider: "THINKRESERVATIONS",
            external_account_id: hotelId,
            display_name: resources.hotel.name,
            credential_ciphertext: encrypted,
            resource_cache: resources,
            status: "CONNECTED",
            last_verified_at: now,
            created_by: target.profileId,
          })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message || "Unable to save ThinkReservations.");
        integrationId = data.id;
      }

      await admin.from("audit_logs").insert({
        actor_profile_id: target.profileId,
        action: "pms.thinkreservations.connected",
        entity_type: "pms_integration",
        entity_id: integrationId,
        reason: "Host connected ThinkReservations during onboarding.",
        metadata: {
          organization_id: target.organizationId,
          hotel_id: hotelId,
          room_count: resources.rooms.length,
          source: "host_onboarding",
        },
      });

      return response(
        target,
        `ThinkReservations connected. ${resources.rooms.length} room${resources.rooms.length === 1 ? "" : "s"} found. Choose the room for this property below.`,
      );
    }

    if (action === "test-think") {
      const integrationId = text(body.integrationId, 100);
      const { data: integration, error } = await admin
        .from("pms_integrations")
        .select("id,external_account_id,credential_ciphertext")
        .eq("id", integrationId)
        .eq("organization_id", target.organizationId)
        .eq("provider", "THINKRESERVATIONS")
        .maybeSingle();
      if (error || !integration) throw new Error("ThinkReservations connection not found.");

      const resources = await fetchThinkReservationsResources(
        integration.external_account_id,
        decryptPmsCredential(integration.credential_ciphertext),
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

      return response(target, `ThinkReservations connection passed. ${resources.rooms.length} room${resources.rooms.length === 1 ? "" : "s"} available to map.`);
    }

    if (action === "map-think") {
      const integrationId = text(body.integrationId, 100);
      const roomId = text(body.roomId, 500);
      const { data: integration, error } = await admin
        .from("pms_integrations")
        .select("id,resource_cache,status")
        .eq("id", integrationId)
        .eq("organization_id", target.organizationId)
        .eq("provider", "THINKRESERVATIONS")
        .maybeSingle();
      if (error || !integration || !["CONNECTED", "ERROR"].includes(integration.status)) {
        throw new Error("ThinkReservations connection not found.");
      }

      const cache = safeThinkCache(integration.resource_cache);
      const room = cache?.rooms.find((candidate) => candidate.id === roomId);
      if (!room) throw new Error("Choose a room returned by ThinkReservations.");
      const roomTypeName = room.roomTypeId
        ? cache?.roomTypes.find((candidate) => candidate.id === room.roomTypeId)?.name
        : null;
      const label = `ThinkReservations · ${room.name}${roomTypeName ? ` (${roomTypeName})` : ""}`.slice(0, 120);

      const { data: existing } = await admin
        .from("calendar_connections")
        .select("id")
        .eq("unit_id", target.unitId)
        .eq("provider", "THINKRESERVATIONS")
        .eq("connection_kind", "PMS_API")
        .eq("is_active", true)
        .maybeSingle();

      let connectionId = existing?.id ?? null;
      if (connectionId) {
        const { error: updateError } = await admin
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
        if (updateError) throw new Error(updateError.message);
      } else {
        const { data, error: insertError } = await admin
          .from("calendar_connections")
          .insert({
            unit_id: target.unitId,
            provider: "THINKRESERVATIONS",
            connection_kind: "PMS_API",
            label,
            feed_url: null,
            external_calendar_id: room.id,
            external_room_type_id: room.roomTypeId,
            pms_integration_id: integration.id,
            created_by: target.profileId,
          })
          .select("id")
          .single();
        if (insertError || !data) throw new Error(insertError?.message || "Unable to save room mapping.");
        connectionId = data.id;
      }

      const sync = await syncThinkReservationsConnection(connectionId, admin);
      return sync.ok
        ? response(target, `${room.name} mapped. ${sync.imported} booked/blocked date span${sync.imported === 1 ? "" : "s"} synchronized.`)
        : response(target, `Room mapped, but the first sync needs attention: ${sync.error}`, false);
    }

    if (action === "sync-think") {
      const connectionId = text(body.connectionId, 100);
      const { data: connection } = await admin
        .from("calendar_connections")
        .select("id")
        .eq("id", connectionId)
        .eq("unit_id", target.unitId)
        .eq("provider", "THINKRESERVATIONS")
        .eq("connection_kind", "PMS_API")
        .eq("is_active", true)
        .maybeSingle();
      if (!connection) throw new Error("ThinkReservations mapping is not available to sync.");
      const sync = await syncThinkReservationsConnection(connectionId, admin);
      return sync.ok
        ? response(target, `${sync.imported} booked/blocked date span${sync.imported === 1 ? "" : "s"} synchronized from ThinkReservations.`)
        : response(target, sync.error, false);
    }

    if (action === "connect-resnexus") {
      const label = text(body.label, 120) || "ResNexus";
      const login = text(body.login, 320);
      const password = text(body.password, 4096);
      const interval = Number(body.syncIntervalMinutes ?? 60);
      if (!login || !password) throw new Error("Enter the ResNexus login and password.");
      if (!Number.isInteger(interval) || interval < 15 || interval > 240) {
        throw new Error("ResNexus sync interval must be between 15 and 240 minutes.");
      }
      const { error } = await supabase.rpc("save_resnexus_browser_account", {
        target_organization_id: target.organizationId,
        account_label: label,
        encrypted_login: encryptPmsCredential(login),
        encrypted_password: encryptPmsCredential(password),
        requested_sync_interval: interval,
        target_account_id: null,
      });
      if (error) throw new Error(error.message);
      return response(target, "ResNexus login saved securely. The browser worker is checking the account for rooms/cabins now.");
    }

    if (action === "retry-resnexus") {
      const accountId = text(body.accountId, 100);
      const { data: account } = await admin
        .from("resnexus_browser_accounts")
        .select("id")
        .eq("id", accountId)
        .eq("organization_id", target.organizationId)
        .maybeSingle();
      if (!account) throw new Error("ResNexus account connection not found.");
      const { error } = await supabase.rpc("retry_resnexus_browser_account", {
        target_account_id: accountId,
      });
      if (error) throw new Error(error.message);
      return response(target, "ResNexus retry queued. This screen will keep checking for discovered rooms.");
    }

    if (action === "verify-resnexus") {
      const accountId = text(body.accountId, 100);
      const verificationCode = text(body.verificationCode, 120);
      if (!verificationCode) throw new Error("Enter the ResNexus verification code.");
      const { data: account } = await admin
        .from("resnexus_browser_accounts")
        .select("id")
        .eq("id", accountId)
        .eq("organization_id", target.organizationId)
        .maybeSingle();
      if (!account) throw new Error("ResNexus account connection not found.");
      const { error } = await supabase.rpc("submit_resnexus_browser_account_challenge", {
        target_account_id: accountId,
        encrypted_challenge: encryptPmsCredential(verificationCode),
      });
      if (error) throw new Error(error.message);
      return response(target, "Verification code saved securely. ResNexus retry queued.");
    }

    if (action === "map-resnexus") {
      const accountId = text(body.accountId, 100);
      const resourceKey = text(body.resourceKey, 160);
      const { data: account, error: accountError } = await admin
        .from("resnexus_browser_accounts")
        .select("id,discovered_resources")
        .eq("id", accountId)
        .eq("organization_id", target.organizationId)
        .maybeSingle();
      if (accountError || !account) throw new Error("ResNexus account connection not found.");
      const resources = safeResNexusResources(account.discovered_resources);
      if (!resources.some((resource) => resource.key === resourceKey)) {
        throw new Error("Choose a room/cabin from the latest ResNexus scan.");
      }

      const { data: existingMappings, error: mappingError } = await admin
        .from("resnexus_resource_mappings")
        .select("unit_id,resource_key")
        .eq("browser_account_id", accountId);
      if (mappingError) throw new Error("Unable to load existing ResNexus mappings.");

      const currentMappings = (existingMappings ?? []) as Array<{
        unit_id: string;
        resource_key: string;
      }>;
      const requestedMappings = currentMappings
        .filter((mapping) => mapping.unit_id !== target.unitId)
        .map((mapping) => ({
          unit_id: mapping.unit_id,
          resource_key: mapping.resource_key,
        }));
      requestedMappings.push({ unit_id: target.unitId, resource_key: resourceKey });

      const { error } = await supabase.rpc("replace_resnexus_resource_mappings", {
        target_account_id: accountId,
        requested_mappings: requestedMappings,
      });
      if (error) throw new Error(error.message);
      return response(target, "ResNexus room/cabin mapped to this property. The worker will sync its availability through the existing calendar pipeline.");
    }

    return NextResponse.json({ error: "Unknown calendar setup action." }, { status: 400 });
  } catch (error) {
    console.error("[onboarding calendar setup]", error);
    return NextResponse.json(
      { error: errorMessage(error) },
      { status: /sign in/i.test(errorMessage(error)) ? 401 : 409 },
    );
  }
}
