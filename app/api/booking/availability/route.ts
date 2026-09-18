import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const unitId = request.nextUrl.searchParams.get("unitId")?.trim() || "";

    if (!UUID_RE.test(unitId)) {
      return NextResponse.json({ error: "Invalid unit." }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const requestedFrom =
      validDate(request.nextUrl.searchParams.get("from")) || today;
    const requestedTo =
      validDate(request.nextUrl.searchParams.get("to")) ||
      addDays(requestedFrom, 730);

    const maxTo = addDays(requestedFrom, 730);
    const from = requestedFrom < today ? today : requestedFrom;
    const to = requestedTo > maxTo ? maxTo : requestedTo;

    if (to <= from) {
      return NextResponse.json(
        { error: "Availability range is invalid." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: unit, error: unitError } = await admin
      .from("property_units")
      .select("id,property_id,is_active")
      .eq("id", unitId)
      .maybeSingle();

    if (unitError || !unit || !unit.is_active) {
      return NextResponse.json({ error: "Stay not found." }, { status: 404 });
    }

    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("id,status")
      .eq("id", unit.property_id)
      .maybeSingle();

    if (
      propertyError ||
      !property ||
      property.status !== "PUBLISHED"
    ) {
      return NextResponse.json({ error: "Stay not found." }, { status: 404 });
    }

    const { data: rows, error } = await admin
      .from("availability_blocks")
      .select("start_date,end_date,block_type,expires_at")
      .eq("unit_id", unitId)
      .eq("state", "ACTIVE")
      .lt("start_date", to)
      .gt("end_date", from)
      .order("start_date", { ascending: true })
      .limit(5000);

    if (error) {
      console.error("[public availability] lookup failed", {
        code: error.code,
        message: error.message,
        details: error.details,
      });

      return NextResponse.json(
        { error: "Unable to load availability." },
        { status: 500 },
      );
    }

    const now = Date.now();

    const blockedRanges = (rows ?? [])
      .filter((row) => {
        if (row.block_type !== "INTERNAL_HOLD") return true;
        if (!row.expires_at) return true;

        const expires = new Date(row.expires_at).getTime();
        return Number.isNaN(expires) || expires > now;
      })
      .map((row) => ({
        start: row.start_date,
        end: row.end_date,
      }));

    return NextResponse.json(
      {
        unitId,
        from,
        to,
        generatedAt: new Date().toISOString(),
        blockedRanges,
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("[public availability]", error);

    return NextResponse.json(
      { error: "Unable to load availability." },
      { status: 500 },
    );
  }
}
