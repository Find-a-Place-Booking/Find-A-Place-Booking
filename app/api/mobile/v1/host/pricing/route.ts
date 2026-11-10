import { NextRequest } from "next/server";
import { authenticateMobileHost } from "@/lib/mobile/host-access";
import { mobileUserClient } from "@/lib/mobile/user-client";
import { mobileJson, mobileOptions, readMobileObject } from "@/lib/mobile/http";
import { revalidatePath } from "next/cache";
export async function OPTIONS(r: NextRequest) {
  return mobileOptions(r);
}
async function context(r: NextRequest, unitId: unknown) {
  const auth = await authenticateMobileHost(r);
  if (!auth.ok)
    return { error: mobileJson(r, { error: auth.message }, auth.status) };
  if (!auth.access.allowed)
    return {
      error: mobileJson(r, { error: "Host app access required." }, 402),
    };
  if (typeof unitId !== "string" || !/^[0-9a-f-]{36}$/i.test(unitId))
    return { error: mobileJson(r, { error: "Choose a unit." }, 400) };
  const unit = await auth.admin
    .from("property_units")
    .select("property_id")
    .eq("id", unitId)
    .eq("is_active", true)
    .maybeSingle();
  const prop = unit.data
    ? await auth.admin
        .from("properties")
        .select("id")
        .eq("id", unit.data.property_id)
        .eq("organization_id", auth.access.organizationId)
        .neq("status", "ARCHIVED")
        .maybeSingle()
    : null;
  if (unit.error || prop?.error || !prop?.data)
    return { error: mobileJson(r, { error: "Unit not found." }, 404) };
  return { unitId };
}
export async function GET(r: NextRequest) {
  const c = await context(r, r.nextUrl.searchParams.get("unitId"));
  if (c.error) return c.error;
  const result = await (
    await mobileUserClient(r)
  ).rpc("host_pricing_bundle", { target_unit_id: c.unitId! });
  if (result.error) return mobileJson(r, { error: "Rates unavailable." }, 503);
  return mobileJson(r, { pricing: result.data });
}
export async function POST(r: NextRequest) {
  const parsed = await readMobileObject(r);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  const c = await context(r, b?.unitId);
  if (c.error) return c.error;
  if (!b?.pricing || typeof b.pricing !== "object" || Array.isArray(b.pricing))
    return mobileJson(r, { error: "Pricing required." }, 400);
  const pricing = b.pricing as Record<string, unknown>;
  const fields = [
    "weeknight",
    "weekend",
    "cleaning",
    "pet",
    "extraGuest",
    "includedGuests",
    "minimumStay",
  ];
  const data: Record<string, string> = {};
  for (const field of fields) {
    const v = pricing[field];
    if (typeof v !== "string" || v.length > 20 || !/^\d*(\.\d{1,2})?$/.test(v))
      return mobileJson(r, { error: "Enter valid nonnegative rates." }, 400);
    data[field] = v;
  }
  for (const key of ["weeknight", "weekend", "cleaning", "pet", "extraGuest"]) {
    if (data[key] !== "" && Number(data[key]) > 21474836.47)
      return mobileJson(r, { error: "That amount is too large." }, 400);
  }
  if (
    !data.weeknight ||
    Number(data.weeknight) < 0.01 ||
    (data.weekend !== "" && Number(data.weekend) < 0.01)
  )
    return mobileJson(
      r,
      { error: "Nightly rates must be greater than zero." },
      400,
    );
  if (Number(data.extraGuest) > 0 && data.includedGuests === "")
    return mobileJson(
      r,
      { error: "Set included guests before charging an extra guest fee." },
      400,
    );
  for (const key of ["includedGuests", "minimumStay"]) {
    if (key === "includedGuests" && data[key] === "") continue;
    if (
      !/^[1-9]\d*$/.test(data[key]) ||
      Number(data[key]) > (key === "minimumStay" ? 365 : 100)
    )
      return mobileJson(
        r,
        {
          error:
            "Guest count and minimum nights must be positive whole numbers.",
        },
        400,
      );
  }
  if (
    !["PER_NIGHT", "PER_PET_PER_STAY", "FLAT_PER_STAY"].includes(
      String(pricing.petCalculation),
    )
  )
    return mobileJson(r, { error: "Invalid pet fee calculation." }, 400);
  data.petCalculation = String(pricing.petCalculation);
  const result = await (
    await mobileUserClient(r)
  ).rpc("save_unit_base_pricing", {
    target_unit_id: c.unitId!,
    pricing_data: data,
  });
  if (result.error) return mobileJson(r, { error: result.error.message }, 409);
  revalidatePath("/stays");
  revalidatePath("/host/rates");
  revalidatePath("/host/calendar");
  return mobileJson(r, { ok: true });
}
