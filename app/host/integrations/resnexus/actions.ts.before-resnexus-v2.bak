"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { encryptPmsCredential } from "@/lib/integrations/credential-crypto";
import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 4096) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function go(kind: "saved" | "error", message?: string): never {
  const params = new URLSearchParams();
  params.set(
    kind,
    kind === "saved" ? "1" : message || "Unable to update ResNexus.",
  );
  redirect(`/host/integrations/resnexus?${params.toString()}`);
}

async function hostClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/host/sign-in");
  return supabase;
}

function refresh() {
  revalidatePath("/host/integrations/resnexus");
  revalidatePath("/host/calendar");
}

export async function saveResNexusBrowserAccount(formData: FormData) {
  const organizationId = field(formData, "organization_id", 100);
  const accountId = field(formData, "account_id", 100) || null;
  const label = field(formData, "label", 120) || "ResNexus";
  const login = field(formData, "login", 320);
  const password = field(formData, "password", 4096);
  const syncIntervalMinutes = Number(
    field(formData, "sync_interval_minutes", 4) || "60",
  );

  if (!organizationId || !login || !password) {
    go(
      "error",
      "Choose a host account and enter the ResNexus login and password.",
    );
  }

  if (
    !Number.isInteger(syncIntervalMinutes) ||
    syncIntervalMinutes < 15 ||
    syncIntervalMinutes > 240
  ) {
    go("error", "ResNexus sync interval must be between 15 and 240 minutes.");
  }

  const supabase = await hostClient();

  let encryptedLogin: string;
  let encryptedPassword: string;

  try {
    encryptedLogin = encryptPmsCredential(login);
    encryptedPassword = encryptPmsCredential(password);
  } catch (error) {
    go(
      "error",
      error instanceof Error
        ? error.message
        : "Unable to encrypt ResNexus credentials.",
    );
  }

  const { error } = await supabase.rpc("save_resnexus_browser_account", {
    target_organization_id: organizationId,
    account_label: label,
    encrypted_login: encryptedLogin,
    encrypted_password: encryptedPassword,
    requested_sync_interval: syncIntervalMinutes,
    target_account_id: accountId,
  });

  if (error) {
    console.error("[saveResNexusBrowserAccount]", error);
    go("error", error.message);
  }

  refresh();
  go("saved");
}

export async function saveResNexusResourceMappings(formData: FormData) {
  const accountId = field(formData, "account_id", 100);
  if (!accountId) go("error", "Missing ResNexus account connection.");

  const mappings: Array<{ unit_id: string; resource_key: string }> = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("mapping:")) continue;

    const unitId = key.slice("mapping:".length).trim().slice(0, 100);
    const resourceKey = String(value ?? "").trim().slice(0, 160);

    if (!unitId || !resourceKey) continue;
    mappings.push({ unit_id: unitId, resource_key: resourceKey });
  }

  const supabase = await hostClient();
  const { error } = await supabase.rpc(
    "replace_resnexus_resource_mappings",
    {
      target_account_id: accountId,
      requested_mappings: mappings,
    },
  );

  if (error) {
    console.error("[saveResNexusResourceMappings]", error);
    go("error", error.message);
  }

  refresh();
  go("saved");
}

export async function retryResNexusBrowserAccount(formData: FormData) {
  const accountId = field(formData, "account_id", 100);
  if (!accountId) go("error", "Missing ResNexus account connection.");

  const supabase = await hostClient();
  const { error } = await supabase.rpc("retry_resnexus_browser_account", {
    target_account_id: accountId,
  });

  if (error) go("error", error.message);

  refresh();
  go("saved");
}

export async function submitResNexusVerificationCode(formData: FormData) {
  const accountId = field(formData, "account_id", 100);
  const code = field(formData, "verification_code", 120);

  if (!accountId || !code) {
    go("error", "Enter the ResNexus verification code.");
  }

  const supabase = await hostClient();

  let encryptedChallenge: string;
  try {
    encryptedChallenge = encryptPmsCredential(code);
  } catch (error) {
    go(
      "error",
      error instanceof Error
        ? error.message
        : "Unable to encrypt the verification code.",
    );
  }

  const { error } = await supabase.rpc(
    "submit_resnexus_browser_account_challenge",
    {
      target_account_id: accountId,
      encrypted_challenge: encryptedChallenge,
    },
  );

  if (error) go("error", error.message);

  refresh();
  go("saved");
}

export async function disconnectResNexusBrowserAccount(formData: FormData) {
  const accountId = field(formData, "account_id", 100);
  if (!accountId) go("error", "Missing ResNexus account connection.");

  const supabase = await hostClient();
  const { error } = await supabase.rpc(
    "disconnect_resnexus_browser_account",
    {
      target_account_id: accountId,
    },
  );

  if (error) go("error", error.message);

  refresh();
  go("saved");
}
