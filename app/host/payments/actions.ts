"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function field(formData: FormData, key: string, max = 1000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function parseTaxLines(formData: FormData) {
  const categories = formData
    .getAll("taxLineCategory")
    .map((value) => String(value).trim().toUpperCase());
  const labels = formData
    .getAll("taxLineLabel")
    .map((value) => String(value).trim().slice(0, 160));
  const rates = formData
    .getAll("taxLineRatePercent")
    .map((value) => String(value).trim());
  const bases = formData
    .getAll("taxLineBaseScope")
    .map((value) => String(value).trim().toUpperCase());

  const count = Math.max(
    categories.length,
    labels.length,
    rates.length,
    bases.length,
  );

  if (count > 12) {
    throw new Error("A property can have at most 12 custom tax lines.");
  }

  const lines: Array<{
    category: string;
    label: string;
    rate_bps: number;
    base_scope: string;
  }> = [];

  for (let index = 0; index < count; index += 1) {
    const label = labels[index] || "";
    const rateText = rates[index] || "0";
    const parsed = Number.parseFloat(rateText || "0");

    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new Error("Enter valid tax rates between 0% and 100%.");
    }

    const rateBps = Math.round(parsed * 100);
    if (!label && rateBps === 0) continue;
    if (!label && rateBps > 0) {
      throw new Error("Every tax rate needs a name.");
    }
    if (rateBps === 0) continue;

    const category = categories[index] || "OTHER";
    const baseScope = bases[index] || "ACCOMMODATION_TOTAL";

    if (!["LOCAL_SALES", "LOCAL_LODGING", "OTHER"].includes(category)) {
      throw new Error("A tax line has an invalid type.");
    }
    if (
      !["LODGING_ONLY", "ACCOMMODATION_TOTAL", "PRE_TAX_TOTAL"].includes(
        baseScope,
      )
    ) {
      throw new Error("A tax line has an invalid taxable base.");
    }

    lines.push({
      category,
      label,
      rate_bps: rateBps,
      base_scope: baseScope,
    });
  }

  return lines;
}

function paymentsRedirect(kind: "saved" | "error", message: string): never {
  redirect(
    `/host/payments?${kind}=${encodeURIComponent(message)}#property-taxes`,
  );
}

export async function startStripeOnboarding(_formData?: FormData) {
  redirect("/host/payments");
}

export async function saveHostPropertyTaxConfiguration(formData: FormData) {
  const propertyId = field(formData, "propertyId", 100);
  const countyName = field(formData, "countyName", 120);
  const localityName = field(formData, "localityName", 120);
  const responsibilityAck =
    formData.get("responsibilityAck") === "on";

  if (!propertyId) {
    paymentsRedirect("error", "Property is required.");
  }

  if (!responsibilityAck) {
    paymentsRedirect(
      "error",
      "Confirm that you are responsible for the tax configuration and remittance.",
    );
  }

  let taxLines;
  try {
    taxLines = parseTaxLines(formData);
  } catch (error) {
    paymentsRedirect(
      "error",
      error instanceof Error ? error.message : "Invalid tax configuration.",
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/host/sign-in");

  const { error } = await supabase.rpc(
    "host_save_property_tax_configuration_v2",
    {
      target_property_id: propertyId,
      county_name_value: countyName || null,
      locality_name_value: localityName || null,
      tax_lines_value: taxLines,
      responsibility_ack_value: true,
    },
  );

  if (error) {
    console.error("[saveHostPropertyTaxConfiguration]", error);
    paymentsRedirect("error", error.message);
  }

  revalidatePath("/host/payments");
  revalidatePath("/checkout");
  paymentsRedirect(
    "saved",
    "Property tax setup saved and certified.",
  );
}
