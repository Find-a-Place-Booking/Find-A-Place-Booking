import { NextRequest, NextResponse } from "next/server";

import {
  type IcalConnection,
  runWithConcurrency,
  syncIcalConnection,
} from "@/lib/calendar/sync-ical";
import { syncThinkReservationsConnection } from "@/lib/calendar/sync-thinkreservations";
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

function due(lastAttempt: string | null, cutoff: number) {
  if (!lastAttempt) return true;
  const time = new Date(lastAttempt).getTime();
  return Number.isNaN(time) || time <= cutoff;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();

  const [icalLookup, pmsLookup] = await Promise.all([
    admin
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
      .limit(100),
    admin
      .from("calendar_connections")
      .select("id,last_sync_attempt_at")
      .eq("is_active", true)
      .eq("connection_kind", "PMS_API")
      .eq("provider", "THINKRESERVATIONS")
      .not("pms_integration_id", "is", null)
      .order("last_sync_attempt_at", {
        ascending: true,
        nullsFirst: true,
      })
      .limit(100),
  ]);

  const lookupError = icalLookup.error ?? pmsLookup.error;
  if (lookupError) {
    console.error("[calendar cron] connection lookup failed", {
      code: lookupError.code,
      message: lookupError.message,
    });

    return NextResponse.json(
      { error: "Unable to load calendar connections." },
      { status: 500 },
    );
  }

  const cutoff = Date.now() - minimumAgeMs();

  const dueIcal = ((icalLookup.data ?? []) as IcalConnection[]).filter(
    (connection) => due(connection.last_sync_attempt_at, cutoff),
  );

  const duePms = (pmsLookup.data ?? []).filter(
    (connection: { id: string; last_sync_attempt_at: string | null }) =>
      due(connection.last_sync_attempt_at, cutoff),
  );

  const tasks = [
    ...dueIcal.map((connection) => ({
      kind: "ICAL" as const,
      id: connection.id,
      connection,
    })),
    ...duePms.map((connection: { id: string }) => ({
      kind: "PMS" as const,
      id: connection.id,
      connection: null,
    })),
  ];

  if (!tasks.length) {
    return NextResponse.json({
      ok: true,
      checked: (icalLookup.data ?? []).length + (pmsLookup.data ?? []).length,
      due: 0,
      synced: 0,
      failed: 0,
    });
  }

  const results = await runWithConcurrency(tasks, 4, (task) => {
    if (task.kind === "ICAL" && task.connection) {
      return syncIcalConnection(task.connection, admin);
    }
    return syncThinkReservationsConnection(task.id, admin);
  });

  const succeeded = results.filter((result) => result.ok).length;

  return NextResponse.json({
    ok: true,
    checked: (icalLookup.data ?? []).length + (pmsLookup.data ?? []).length,
    due: tasks.length,
    synced: succeeded,
    failed: results.length - succeeded,
    results,
  });
}
