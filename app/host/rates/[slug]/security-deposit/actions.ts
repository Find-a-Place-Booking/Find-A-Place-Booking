"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getHostPropertyBySlug } from "@/lib/host/properties";
import { createClient } from "@/lib/supabase/server";
import { securityDepositPaymentsEnabled } from "@/lib/payments/security-deposit-toggle";

export async function saveSecurityDepositPolicy(form: FormData) {
  const slug = String(form.get("slug") || "").trim();
  const property = slug ? await getHostPropertyBySlug(slug) : null;
  if (!property) redirect("/host/properties");
  const amountInput = String(form.get("amount") || "").trim();
  const amount = amountInput === "" ? 0 : Number(amountInput);
  const enabled = form.get("enabled") === "on";
  if (enabled && !securityDepositPaymentsEnabled()) {
    redirect(`/host/rates/${encodeURIComponent(slug)}/security-deposit?error=not-enabled`);
  }
  const dueDays = Number(form.get("dueDays") ?? 2);
  const refundDays = Number(form.get("refundDays") ?? 7);
  const terms = String(form.get("terms") || "").trim();
  const moneyValid = Number.isFinite(amount) && amount >= 0 && amount <= 2500 && Math.round(amount * 100) === amount * 100;
  if (!moneyValid || (enabled && amount < 1) || !Number.isInteger(dueDays) || dueDays < 0 || dueDays > 30 ||
    !Number.isInteger(refundDays) || refundDays < 0 || refundDays > 30 || terms.length > 3000) {
    redirect(`/host/rates/${encodeURIComponent(slug)}/security-deposit?error=invalid`);
  }
  const supabase = await createClient();
  const { error } = await supabase.from("unit_security_deposit_settings").upsert({
    unit_id: property.unitId,
    amount_cents: Math.round(amount * 100),
    enabled,
    due_days_before_arrival: dueDays,
    refund_days_after_checkout: refundDays,
    terms,
    updated_at: new Date().toISOString(),
  }, { onConflict: "unit_id" });
  if (error) {
    console.error("[host deposit settings]", { code: error.code, message: error.message });
    redirect(`/host/rates/${encodeURIComponent(slug)}/security-deposit?error=save`);
  }
  revalidatePath(`/host/rates/${slug}/security-deposit`);
  redirect(`/host/rates/${encodeURIComponent(slug)}/security-deposit?saved=1`);
}
