import { NextRequest, NextResponse } from "next/server";

import {
  type IcalConnection,
  runWithConcurrency,
  syncIcalConnection,
} from "@/lib/calendar/sync-ical";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

function minimumAgeMs() {
  const parsed = Number(process.env.CALENDAR_SYNC_INTERVAL_MINUTES || "15");
  const minutes =
    Number.isFinite(parsed) && parsed >= 5 && parsed <= 1440 ? parsed : 15;
  return minutes * 60_000;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("calendar_connections")
    .select(
      "id,unit_id,provider,feed_url,last_sync_attempt_at,last_success_at",
    )
    .eq("is_active", true)
    .eq("connection_kind", "ICAL")
    .not("feed_url", "is", null)
    .order("last_sync_attempt_at", {
      ascending: true,
      nullsFirst: true,
    })
    .limit(100);

  if (error) {
    console.error("[calendar cron] connection lookup failed", {
      code: error.code,
      message: error.message,
    });

    return NextResponse.json(
      { error: "Unable to load calendar connections." },
      { status: 500 },
    );
  }

  const cutoff = Date.now() - minimumAgeMs();

  const due = ((data ?? []) as IcalConnection[]).filter((connection) => {
    if (!connection.last_sync_attempt_at) return true;

    const lastAttempt = new Date(connection.last_sync_attempt_at).getTime();
    return Number.isNaN(lastAttempt) || lastAttempt <= cutoff;
  });

  if (!due.length) {
    return NextResponse.json({
      ok: true,
      checked: (data ?? []).length,
      due: 0,
      synced: 0,
      failed: 0,
    });
  }

  const results = await runWithConcurrency(due, 4, (connection) =>
    syncIcalConnection(connection, admin),
  );
  const succeeded = results.filter((result) => result.ok).length;

  return NextResponse.json({
    ok: true,
    checked: (data ?? []).length,
    due: due.length,
    synced: succeeded,
    failed: results.length - succeeded,
    results,
  });
}
