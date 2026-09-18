import { NextRequest, NextResponse } from "next/server";

import { fetchIcalFeed } from "@/lib/calendar/fetch-ical";
import { parseIcalAvailability } from "@/lib/calendar/ical";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Connection = {
  id: string;
  unit_id: string;
  provider: string;
  feed_url: string | null;
  last_sync_attempt_at: string | null;
  last_success_at: string | null;
};

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

async function syncOne(connection: Connection) {
  const admin = createAdminClient();

  try {
    if (!connection.feed_url) {
      throw new Error("Calendar connection has no feed URL.");
    }

    const fetched = await fetchIcalFeed(connection.feed_url);
    const parsed = parseIcalAvailability(fetched.body);

    // Preserve existing imported availability if ANY feed event cannot be
    // normalized safely. This matches the manual-sync behavior.
    if (parsed.unsafeSkipped > 0) {
      const recurring = parsed.recurringSkipped
        ? ` (${parsed.recurringSkipped} recurring rule${
            parsed.recurringSkipped === 1 ? "" : "s"
          })`
        : "";

      throw new Error(
        `Calendar sync stopped safely: ${parsed.unsafeSkipped} event${
          parsed.unsafeSkipped === 1 ? "" : "s"
        }${recurring} could not be normalized without guessing.`,
      );
    }

    const { data, error } = await admin.rpc("service_apply_ical_sync", {
      target_connection_id: connection.id,
      source_events: parsed.events,
    });

    if (error) throw new Error(error.message);

    const result = (data ?? {}) as {
      imported_count?: number;
      deactivated_count?: number;
    };

    return {
      id: connection.id,
      provider: connection.provider,
      ok: true,
      imported: result.imported_count ?? parsed.events.length,
      deactivated: result.deactivated_count ?? 0,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Calendar synchronization failed.";

    await admin.rpc("service_mark_calendar_sync_error", {
      target_connection_id: connection.id,
      error_message: message.slice(0, 1000),
    });

    return {
      id: connection.id,
      provider: connection.provider,
      ok: false,
      error: message.slice(0, 240),
    };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
) {
  const output: R[] = new Array(items.length);
  let index = 0;

  async function runner() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      output[current] = await worker(items[current]);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      () => runner(),
    ),
  );

  return output;
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

  const due = ((data ?? []) as Connection[]).filter((connection) => {
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

  const results = await runWithConcurrency(due, 4, syncOne);
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
