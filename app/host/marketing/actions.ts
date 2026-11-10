"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sendHostMarketingAdvertisingEmail } from "@/lib/notifications/host-marketing";
import { createClient } from "@/lib/supabase/server";

export async function saveHostMarketingPreferences(formData: FormData) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/host/sign-in?next=/host/marketing");

  const organizationId = String(formData.get("organization_id") || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) {
    redirect("/host/marketing?error=Invalid%20host%20account");
  }
  const returnPath = formData.get("return_to") === "onboarding" ? "/host/onboarding" : "/host/marketing";
  const intro = formData.get("intro_offer") === "on";
  const advertising = intro && formData.get("additional_advertising") === "YES";
  const email = String(formData.get("contact_email") || "").trim().toLowerCase();
  const notes = String(formData.get("notes") || "").trim().slice(0,1000);

  if (advertising && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/host/marketing?error=Enter%20a%20valid%20advertising%20contact%20email");
  }

  const { data, error } = await supabase.rpc("fap_save_host_intro_preferences", {
    target_organization_id: organizationId,
    opt_into_intro: intro,
    request_additional_advertising: advertising,
    contact_email: advertising ? email : "",
    details: notes,
  });
  if (error) {
    console.error("[Host marketing] save failed", {code:error.code,message:error.message});
    redirect(`/host/marketing?error=${encodeURIComponent(error.message.slice(0,180))}`);
  }

  let emailPending = false;
  const requestId = (data as {email_request_id?:string|null}|null)?.email_request_id;
  if (requestId) {
    try {
      await sendHostMarketingAdvertisingEmail(requestId);
    } catch {
      emailPending = true;
    }
  }
  revalidatePath("/host/marketing");
  revalidatePath("/host/onboarding");
  revalidatePath("/host");
  revalidatePath("/stays");
  revalidatePath("/");
  redirect(`${returnPath}?saved=1${emailPending ? "&emailPending=1" : ""}`);
}
