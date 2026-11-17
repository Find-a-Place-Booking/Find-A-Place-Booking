import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";

import { authenticateMobileHost } from "@/lib/mobile/host-access";
import { mobileJson, mobileOptions, readMobileObject } from "@/lib/mobile/http";
import { mobileUserClient } from "@/lib/mobile/user-client";
import { propertyTypes } from "@/lib/property/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: NextRequest) {
  return mobileOptions(request);
}

export async function GET(request: NextRequest) {
  const result = await authenticateMobileHost(request);
  if (!result.ok) {
    return mobileJson(request, { error: result.message }, result.status);
  }
  if (!result.access.allowed) {
    return mobileJson(request, { error: "Host access required." }, 403);
  }

  const { data, error } = await result.admin
    .from("properties")
    .select("id,name,status,city,region_code")
    .eq("organization_id", result.access.organizationId)
    .neq("status", "ARCHIVED")
    .order("name", { ascending: true })
    .limit(100);
  if (error) {
    return mobileJson(request, { error: "Properties could not be loaded." }, 503);
  }
  return mobileJson(request, { properties: data ?? [] });
}

export async function POST(request: NextRequest) {
  const result = await authenticateMobileHost(request);
  if (!result.ok) {
    return mobileJson(request, { error: result.message }, result.status);
  }
  if (!result.access.allowed) {
    return mobileJson(request, { error: "Host access required." }, 403);
  }

  const parsed = await readMobileObject(request, 4096);
  if (!parsed.ok) return parsed.response;

  const body = parsed.body;
  if (
    typeof body.name !== "string" ||
    typeof body.propertyType !== "string" ||
    typeof body.publicArea !== "string"
  ) {
    return mobileJson(request, { error: "Enter a property name, type and area." }, 400);
  }

  const name = body.name.trim();
  const type = body.propertyType.trim();
  const area = body.publicArea.trim();
  if (!name || name.length > 180 || area.length > 180) {
    return mobileJson(
      request,
      { error: "A property name is required (up to 180 characters). The public area must be under 180 characters." },
      400,
    );
  }
  if (type && !propertyTypes.some((option) => option === type)) {
    return mobileJson(request, { error: "Choose a valid property type." }, 400);
  }

  // IMPORTANT: User-scoped RPC preserves auth.uid() and the existing
  // can_manage_organization check. Never create this record using admin.
  // The organization ID comes from verified membership, not the request body.
  const supabase = await mobileUserClient(request);
  const { data, error } = await supabase.rpc("create_blank_property", {
    target_organization_id: result.access.organizationId,
    property_name: name,
    property_type: type || null,
    public_area: area || null,
  });

  if (error) {
    console.error("[host mobile create property]", {
      code: error.code,
      message: error.message,
    });
    const firstSetup = error.message?.includes(
      "Create the first property from the saved onboarding setup",
    );
    return mobileJson(
      request,
      {
        error: firstSetup
          ? "Your first property has saved onboarding details. Open Full property setup to use them before adding another listing."
          : error.message?.includes("owner or manager")
            ? "You don't have permission to add a listing to this organization."
            : "The new property could not be created. Nothing was published. Please try again.",
        ...(firstSetup ? { next: "/host/properties" } : {}),
      },
      firstSetup ? 409 : error.code === "42501" ? 403 : 503,
    );
  }

  const created = Array.isArray(data) ? data[0] : data;
  if (
    !created ||
    typeof created.property_id !== "string" ||
    typeof created.slug !== "string" ||
    !/^[a-z0-9-]{1,96}$/.test(created.slug)
  ) {
    return mobileJson(request, { error: "The property was saved, but the editor link could not be loaded. Check your property list before trying again." }, 502);
  }

  revalidatePath("/host/properties");
  revalidatePath("/host");

  // This RPC creates only a DRAFT; publishing remains protected by the
  // full existing host readiness, tax, calendar and Stripe checks.
  return mobileJson(
    request,
    {
      property: {
        id: created.property_id,
        slug: created.slug,
        status: "DRAFT",
      },
      editUrl: `/host/properties/${created.slug}?created=1`,
    },
    201,
  );
}
