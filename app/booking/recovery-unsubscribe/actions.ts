"use server";

import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";

export async function unsubscribeBookingRecovery(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    redirect("/booking/recovery-unsubscribe?error=invalid");
  }

  const { error } = await createAdminClient()
    .from("booking_recovery_suppressions")
    .update({ opted_out_at: new Date().toISOString() })
    .eq("access_token", token);

  if (error) {
    redirect("/booking/recovery-unsubscribe?error=save");
  }

  redirect("/booking/recovery-unsubscribe?done=1");
}
