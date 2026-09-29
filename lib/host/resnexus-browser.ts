import { redirect } from "next/navigation";

import { getManagedOrganizations } from "@/lib/host/properties";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ResNexusBrowserSafeState = {
  id: string;
  organizationId: string;
  unitId: string;
  calendarConnectionId: string;
  label: string;
  status:
    | "PENDING"
    | "REFRESHING"
    | "CONNECTED"
    | "NEEDS_ATTENTION"
    | "ERROR"
    | "DISABLED";
  resourceMatch: string | null;
  discoveredResources: string[];
  attentionCode: string | null;
  attentionMessage: string | null;
  syncIntervalMinutes: number;
  nextSyncAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  calendarSyncStatus: string;
  activeBlockCount: number;
};

async function requireHost() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/host/sign-in");
  return supabase;
}

export async function getResNexusBrowserStates(
  unitIds: string[],
): Promise<ResNexusBrowserSafeState[]> {
  if (!unitIds.length) return [];

  const [supabase, organizations] = await Promise.all([
    requireHost(),
    getManagedOrganizations(),
  ]);

  const allowedOrganizations = new Set(
    organizations.map((organization) => organization.id),
  );
  if (!allowedOrganizations.size) return [];

  const { data: unitRows, error: unitError } = await supabase
    .from("property_units")
    .select("id,property_id")
    .in("id", unitIds);

  if (unitError || !(unitRows ?? []).length) return [];

  const propertyIds = [
    ...new Set((unitRows ?? []).map((row) => row.property_id as string)),
  ];

  const { data: propertyRows, error: propertyError } = await supabase
    .from("properties")
    .select("id,organization_id")
    .in("id", propertyIds);

  if (propertyError) {
    throw new Error("Unable to verify ResNexus property access.");
  }

  const orgByProperty = new Map(
    (propertyRows ?? []).map((row) => [
      row.id as string,
      row.organization_id as string,
    ]),
  );

  const allowedUnits = (unitRows ?? [])
    .filter((row) =>
      allowedOrganizations.has(orgByProperty.get(row.property_id as string) || ""),
    )
    .map((row) => row.id as string);

  if (!allowedUnits.length) return [];

  const admin = createAdminClient();

  const { data: browserRows, error: browserError } = await admin
    .from("resnexus_browser_connections")
    .select(
      "id,organization_id,unit_id,calendar_connection_id,status,resource_match,discovered_resources,attention_code,attention_message,sync_interval_minutes,next_sync_at,last_attempt_at,last_success_at,last_error_at,last_error",
    )
    .in("unit_id", allowedUnits);

  if (browserError) {
    throw new Error("Unable to load ResNexus browser connections.");
  }

  if (!(browserRows ?? []).length) return [];

  const calendarIds = (browserRows ?? []).map(
    (row) => row.calendar_connection_id as string,
  );

  const [calendarResult, blockResult] = await Promise.all([
    admin
      .from("calendar_connections")
      .select("id,label,sync_status")
      .in("id", calendarIds),
    admin
      .from("availability_blocks")
      .select("connection_id")
      .in("connection_id", calendarIds)
      .eq("block_type", "EXTERNAL_BLOCK")
      .eq("state", "ACTIVE"),
  ]);

  if (calendarResult.error || blockResult.error) {
    throw new Error("Unable to load ResNexus calendar status.");
  }

  const calendarById = new Map(
    (calendarResult.data ?? []).map((row) => [row.id, row]),
  );
  const countByConnection = new Map<string, number>();

  for (const row of blockResult.data ?? []) {
    const id = row.connection_id as string;
    countByConnection.set(id, (countByConnection.get(id) ?? 0) + 1);
  }

  return (browserRows ?? []).map((row) => {
    const calendar = calendarById.get(row.calendar_connection_id);

    return {
      id: row.id,
      organizationId: row.organization_id,
      unitId: row.unit_id,
      calendarConnectionId: row.calendar_connection_id,
      label: calendar?.label || "ResNexus browser sync",
      status: row.status,
      resourceMatch: row.resource_match,
      discoveredResources: Array.isArray(row.discovered_resources)
        ? row.discovered_resources.filter(
            (value): value is string => typeof value === "string",
          )
        : [],
      attentionCode: row.attention_code,
      attentionMessage: row.attention_message,
      syncIntervalMinutes: row.sync_interval_minutes,
      nextSyncAt: row.next_sync_at,
      lastAttemptAt: row.last_attempt_at,
      lastSuccessAt: row.last_success_at,
      lastErrorAt: row.last_error_at,
      lastError: row.last_error,
      calendarSyncStatus: calendar?.sync_status || "NEVER_SYNCED",
      activeBlockCount:
        countByConnection.get(row.calendar_connection_id) ?? 0,
    } satisfies ResNexusBrowserSafeState;
  });
}
