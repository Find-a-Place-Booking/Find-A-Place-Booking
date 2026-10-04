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

function diffDays(start: string, end: string) {
  return Math.round(
    (new Date(`${end}T00:00:00Z`).getTime() -
      new Date(`${start}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

function missingDatabaseFunction(
  error: { code?: string; message?: string } | null,
) {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|does not exist/i.test(error.message || "")
  );
}

type StayRuleRow = {
  start_date: string;
  end_date: string;
  minimum_nights: number;
  priority: number;
  created_at: string;
};

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
      .select("id,property_id,is_active,minimum_stay_nights")
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

    const { data: resNexusState, error: resNexusStateError } = await admin.rpc(
      "service_resnexus_unit_calendar_state",
      {
        target_unit_id: unitId,
        target_check_in: from,
        target_check_out: to,
      },
    );

    if (
      resNexusStateError &&
      !missingDatabaseFunction(resNexusStateError)
    ) {
      console.error("[public availability] ResNexus state failed", {
        code: resNexusStateError.code,
        message: resNexusStateError.message,
      });
      return NextResponse.json(
        { error: "Unable to verify connected calendar availability." },
        { status: 503 },
      );
    }

    if (resNexusStateError) {
      console.info(
        "[public availability] dependency migration not visible yet; using existing availability blocks",
      );
    }

    const resNexus =
      !resNexusStateError &&
      resNexusState && typeof resNexusState === "object"
        ? (resNexusState as {
            has_resnexus?: boolean;
            ready?: boolean;
            reason?: string | null;
            unresolved_ranges?: Array<{ start: string; end: string }>;
          })
        : null;

    if (resNexus?.has_resnexus && resNexus.ready === false) {
      return NextResponse.json(
        {
          error:
            resNexus.reason ||
            "This connected calendar is temporarily unavailable. Please try again shortly.",
        },
        {
          status: 503,
          headers: { "Cache-Control": "private, no-store, max-age=0" },
        },
      );
    }

    const [
      { data: rows, error },
      { data: stayRuleRows, error: stayRuleError },
    ] = await Promise.all([
      admin
        .from("availability_blocks")
        .select("start_date,end_date,block_type,expires_at")
        .eq("unit_id", unitId)
        .eq("state", "ACTIVE")
        .lt("start_date", to)
        .gt("end_date", from)
        .order("start_date", { ascending: true })
        .limit(5000),
      admin
        .from("unit_stay_rules")
        .select(
          "start_date,end_date,minimum_nights,priority,created_at",
        )
        .eq("unit_id", unitId)
        .eq("is_active", true)
        .lte("start_date", to)
        .gte("end_date", from),
    ]);

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

    if (stayRuleError) {
      console.error("[public availability] stay-rule lookup failed", {
        code: stayRuleError.code,
        message: stayRuleError.message,
        details: stayRuleError.details,
      });

      return NextResponse.json(
        { error: "Unable to load minimum-stay rules." },
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

    for (const range of resNexus?.unresolved_ranges ?? []) {
      if (range?.start && range?.end) {
        blockedRanges.push({ start: range.start, end: range.end });
      }
    }

    // Match resolve_unit_pricing_days() rule precedence exactly:
    // priority DESC, narrower date range first, newest rule last tie-breaker.
    const stayRules = ((stayRuleRows ?? []) as StayRuleRow[])
      .sort((left, right) => {
        const priorityDifference =
          Number(right.priority || 0) - Number(left.priority || 0);
        if (priorityDifference !== 0) return priorityDifference;

        const leftSpan = diffDays(left.start_date, left.end_date);
        const rightSpan = diffDays(right.start_date, right.end_date);
        if (leftSpan !== rightSpan) return leftSpan - rightSpan;

        return (
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime()
        );
      })
      .map((rule) => ({
        start: rule.start_date,
        end: rule.end_date,
        minimumNights: Math.max(1, Number(rule.minimum_nights || 1)),
        priority: Number(rule.priority || 0),
        createdAt: rule.created_at,
      }));

    return NextResponse.json(
      {
        unitId,
        from,
        to,
        generatedAt: new Date().toISOString(),
        blockedRanges,
        minimumStayNights: Math.max(
          1,
          Number(unit.minimum_stay_nights || 1),
        ),
        stayRules,
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
