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
  params.set(kind, kind === "saved" ? "1" : message || "Unable to update ResNexus.");
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

export async function saveResNexusBrowserConnection(formData: FormData) {
  const unitId = field(formData, "unit_id", 100);
  const label = field(formData, "label", 120) || "ResNexus browser sync";
  const login = field(formData, "login", 320);
  const password = field(formData, "password", 4096);
  const resourceMatch = field(formData, "resource_match", 240) || null;
  const syncIntervalMinutes = Number(
    field(formData, "sync_interval_minutes", 4) || "60",
  );

  if (!unitId || !login || !password) {
    go("error", "Choose a property and enter the ResNexus login and password.");
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

  const { error } = await supabase.rpc("save_resnexus_browser_connection", {
    target_unit_id: unitId,
    connection_label: label,
    encrypted_login: encryptedLogin,
    encrypted_password: encryptedPassword,
    requested_resource_match: resourceMatch,
    requested_sync_interval: syncIntervalMinutes,
  });

  if (error) {
    console.error("[saveResNexusBrowserConnection]", error);
    go("error", error.message);
  }

  refresh();
  go("saved");
}

export async function retryResNexusBrowserConnection(formData: FormData) {
  const browserConnectionId = field(formData, "browser_connection_id", 100);
  if (!browserConnectionId) go("error", "Missing ResNexus connection.");

  const supabase = await hostClient();
  const { error } = await supabase.rpc("retry_resnexus_browser_connection", {
    target_browser_connection_id: browserConnectionId,
  });

  if (error) go("error", error.message);

  refresh();
  go("saved");
}

export async function submitResNexusVerificationCode(formData: FormData) {
  const browserConnectionId = field(formData, "browser_connection_id", 100);
  const code = field(formData, "verification_code", 120);

  if (!browserConnectionId || !code) {
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

  const { error } = await supabase.rpc("submit_resnexus_browser_challenge", {
    target_browser_connection_id: browserConnectionId,
    encrypted_challenge: encryptedChallenge,
  });

  if (error) go("error", error.message);

  refresh();
  go("saved");
}

export async function disableResNexusBrowserConnection(formData: FormData) {
  const browserConnectionId = field(formData, "browser_connection_id", 100);
  if (!browserConnectionId) go("error", "Missing ResNexus connection.");

  const supabase = await hostClient();
  const { error } = await supabase.rpc("disable_resnexus_browser_connection", {
    target_browser_connection_id: browserConnectionId,
  });

  if (error) go("error", error.message);

  refresh();
  go("saved");
}
