import { redirect } from "next/navigation";

import { getManagedOrganizations } from "@/lib/host/properties";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ResNexusResource = {
  key: string;
  label: string;
};

export type ResNexusMappingState = {
  id: string;
  unitId: string;
  calendarConnectionId: string;
  resourceKey: string;
  resourceLabel: string;
  status: "ACTIVE" | "ERROR";
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  calendarSyncStatus: string;
  activeBlockCount: number;
};

export type ResNexusBrowserAccountState = {
  id: string;
  organizationId: string;
  label: string;
  status:
    | "PENDING"
    | "REFRESHING"
    | "CONNECTED"
    | "NEEDS_ATTENTION"
    | "ERROR"
    | "DISABLED";
  discoveredResources: ResNexusResource[];
  attentionCode: string | null;
  attentionMessage: string | null;
  syncIntervalMinutes: number;
  nextSyncAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  mappings: ResNexusMappingState[];
};

async function requireHost() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/host/sign-in");
  return supabase;
}

function safeResources(value: unknown): ResNexusResource[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const output: ResNexusResource[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const key =
      "key" in item && typeof item.key === "string"
        ? item.key.trim()
        : "";
    const label =
      "label" in item && typeof item.label === "string"
        ? item.label.trim()
        : "";

    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    output.push({ key, label });
  }

  return output;
}

export async function getResNexusBrowserAccounts(): Promise<
  ResNexusBrowserAccountState[]
> {
  const [supabase, organizations] = await Promise.all([
    requireHost(),
    getManagedOrganizations(),
  ]);

  const allowedOrganizationIds = organizations.map(
    (organization) => organization.id,
  );
  if (!allowedOrganizationIds.length) return [];

  // This verifies the user can still see/manage the same organizations through
  // the normal authenticated client before the service-role client reads secret
  // connector rows.
  const { data: visibleOrganizations, error: organizationError } =
    await supabase
      .from("organizations")
      .select("id")
      .in("id", allowedOrganizationIds);

  if (organizationError) {
    throw new Error("Unable to verify ResNexus host access.");
  }

  const allowed = new Set(
    (visibleOrganizations ?? []).map((row) => row.id as string),
  );
  if (!allowed.size) return [];

  const admin = createAdminClient();

  const { data: accountRows, error: accountError } = await admin
    .from("resnexus_browser_accounts")
    .select(
      "id,organization_id,label,status,discovered_resources,attention_code,attention_message,sync_interval_minutes,next_sync_at,last_attempt_at,last_success_at,last_error_at,last_error",
    )
    .in("organization_id", [...allowed])
    .order("created_at", { ascending: true });

  if (accountError) {
    throw new Error("Unable to load ResNexus browser accounts.");
  }

  if (!(accountRows ?? []).length) return [];

  const accountIds = (accountRows ?? []).map((row) => row.id as string);

  const { data: mappingRows, error: mappingError } = await admin
    .from("resnexus_resource_mappings")
    .select(
      "id,browser_account_id,unit_id,calendar_connection_id,resource_key,resource_label,status,last_success_at,last_error_at,last_error",
    )
    .in("browser_account_id", accountIds)
    .order("created_at", { ascending: true });

  if (mappingError) {
    throw new Error("Unable to load ResNexus property mappings.");
  }

  const calendarIds = (mappingRows ?? []).map(
    (row) => row.calendar_connection_id as string,
  );

  const [calendarResult, blockResult] = calendarIds.length
    ? await Promise.all([
        admin
          .from("calendar_connections")
          .select("id,sync_status")
          .in("id", calendarIds),
        admin
          .from("availability_blocks")
          .select("connection_id")
          .in("connection_id", calendarIds)
          .eq("block_type", "EXTERNAL_BLOCK")
          .eq("state", "ACTIVE"),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (calendarResult.error || blockResult.error) {
    throw new Error("Unable to load ResNexus calendar mapping status.");
  }

  const calendarById = new Map(
    (calendarResult.data ?? []).map((row) => [row.id as string, row]),
  );

  const activeBlockCount = new Map<string, number>();
  for (const row of blockResult.data ?? []) {
    const id = row.connection_id as string;
    activeBlockCount.set(id, (activeBlockCount.get(id) ?? 0) + 1);
  }

  const mappingsByAccount = new Map<string, ResNexusMappingState[]>();

  for (const row of mappingRows ?? []) {
    const accountId = row.browser_account_id as string;
    const calendar = calendarById.get(row.calendar_connection_id as string);

    const mapping: ResNexusMappingState = {
      id: row.id,
      unitId: row.unit_id,
      calendarConnectionId: row.calendar_connection_id,
      resourceKey: row.resource_key,
      resourceLabel: row.resource_label,
      status: row.status,
      lastSuccessAt: row.last_success_at,
      lastErrorAt: row.last_error_at,
      lastError: row.last_error,
      calendarSyncStatus: calendar?.sync_status || "NEVER_SYNCED",
      activeBlockCount:
        activeBlockCount.get(row.calendar_connection_id as string) ?? 0,
    };

    const list = mappingsByAccount.get(accountId) ?? [];
    list.push(mapping);
    mappingsByAccount.set(accountId, list);
  }

  return (accountRows ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    status: row.status,
    discoveredResources: safeResources(row.discovered_resources),
    attentionCode: row.attention_code,
    attentionMessage: row.attention_message,
    syncIntervalMinutes: row.sync_interval_minutes,
    nextSyncAt: row.next_sync_at,
    lastAttemptAt: row.last_attempt_at,
    lastSuccessAt: row.last_success_at,
    lastErrorAt: row.last_error_at,
    lastError: row.last_error,
    mappings: mappingsByAccount.get(row.id) ?? [],
  }));
}
